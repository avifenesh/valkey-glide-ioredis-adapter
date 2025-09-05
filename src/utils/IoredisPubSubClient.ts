/**
 * ioredis-Compatible Pub/Sub Client for Valkey
 * 
 * Direct TCP connection with RESP protocol parsing for full binary data support.
 * Provides Socket.IO compatibility and binary message handling through the
 * dual pub/sub architecture.
 */

import { EventEmitter } from 'events';
import { Socket } from 'net';
import { RedisOptions } from '../types';

const RESP_TYPES = {
  ARRAY: '*',
  BULK_STRING: '$',
  INTEGER: ':',
  CRLF: '\r\n'
} as const;

const CONNECTION_DEFAULTS = {
  TIMEOUT: 10000,
  DEFAULT_PORT: 6379,
  DEFAULT_HOST: 'localhost'
} as const;

interface RespMessage {
  type: 'message' | 'pmessage' | 'subscribe' | 'psubscribe' | 'unsubscribe' | 'punsubscribe';
  channel: string;
  pattern?: string;
  message?: string | Buffer;
  count?: number;
}


export class IoredisPubSubClient extends EventEmitter {
  private socket: Socket | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private readonly subscriptions = new Set<string>();
  private readonly patternSubscriptions = new Set<string>();
  private buffer = Buffer.alloc(0);
  private readonly keyPrefix: string;
  // Awaitable unsubscribe acks
  private pendingUnsub = new Map<string, () => void>();
  private pendingPUnsub = new Map<string, () => void>();
  private unsubAllResolve: (() => void) | null = null;
  private punsubAllResolve: (() => void) | null = null;

  constructor(private options: RedisOptions) {
    super();
    this.keyPrefix = options.keyPrefix || '';
  }

  /**
   * Establishes connection to the server with comprehensive error handling
   */
  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') return;

    this.connectionStatus = 'connecting';
    this.emit('connecting');

    return new Promise<void>((resolve, reject) => {
      const timeoutMs = this.options.connectTimeout || CONNECTION_DEFAULTS.TIMEOUT;
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      (timeout as any).unref?.();

      this.socket = new Socket();
      // Prevent this socket from keeping the event loop alive
      try { this.socket.unref(); } catch {}

      this.socket.once('connect', async () => {
        try { this.socket && this.socket.unref && this.socket.unref(); } catch {}
        clearTimeout(timeout);
        try {
          // Optional AUTH
          if (this.options.password) {
            if (this.options.username) {
              await this.sendCommand([
                'AUTH',
                this.options.username,
                this.options.password,
              ]);
            } else {
              await this.sendCommand(['AUTH', this.options.password]);
            }
          }
          // Optional CLIENT SETNAME
          if (this.options.clientName) {
            await this.sendCommand([
              'CLIENT',
              'SETNAME',
              this.options.clientName,
            ]);
          }
          // Optional SELECT
          if (typeof this.options.db === 'number') {
            await this.sendCommand(['SELECT', String(this.options.db)]);
          }
          this.connectionStatus = 'connected';
          this.emit('connect');
          this.emit('ready');
          resolve();
        } catch (handshakeErr) {
          this.cleanup();
          this.emit('error', handshakeErr as Error);
          reject(handshakeErr);
        }
      });

      this.socket.on('data', (data: Buffer) => {
        try {
          this.handleRespData(data);
        } catch (error) {
          this.emit('error', new Error(`RESP parsing error: ${error}`));
        }
      });

      this.socket.once('error', (error: Error) => {
        clearTimeout(timeout);
        this.cleanup();
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('close', (hadError: boolean) => {
        this.connectionStatus = 'disconnected';
        this.emit('close');
        this.emit('end');
        if (hadError) {
          this.emit('error', new Error('Socket closed due to error'));
        }
      });

      // Initiate connection
      this.socket.connect(
        this.options.port ?? CONNECTION_DEFAULTS.DEFAULT_PORT,
        this.options.host ?? CONNECTION_DEFAULTS.DEFAULT_HOST
      );
    });
  }

  /**
   * Gracefully disconnect from server and clean up resources
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * Internal cleanup method for connection resources
   */
  private cleanup(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      if (!this.socket.destroyed) {
        this.socket.end();
        this.socket.destroy();
      }
      this.socket = null;
    }
    this.connectionStatus = 'disconnected';
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Handles incoming RESP data by parsing messages and updating buffer.
   * @param data - Incoming buffer data from socket
   * @private
   */
  private handleRespData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length > 0) {
      const parseResult = this.parseRespMessage(this.buffer);
      if (!parseResult) break;

      this.buffer = this.buffer.subarray(parseResult.consumed);

      if (parseResult.message) {
        this.handlePubSubMessage(parseResult.message);
      }
    }
  }

  /**
   * Parses a single RESP message from buffer.
   * @param buffer - Buffer containing RESP data
   * @returns Parsed message and bytes consumed, or null if incomplete
   * @private
   */
  private parseRespMessage(
    buffer: Buffer
  ): { message: RespMessage | null; consumed: number } | null {
    if (buffer.length === 0) return null;
    
    const firstByte = buffer[0];
    if (firstByte === undefined) return null;
    
    const respType = String.fromCharCode(firstByte);

    if (respType === RESP_TYPES.ARRAY) {
      return this.parseRespArray(buffer);
    }

    const crlfIndex = buffer.indexOf(RESP_TYPES.CRLF);
    if (crlfIndex === -1) return null;

    return { message: null, consumed: crlfIndex + RESP_TYPES.CRLF.length };
  }

  /**
   * Parses RESP array containing pub/sub message.
   * @param buffer - Buffer starting with array marker '*'
   * @returns Parsed pub/sub message and bytes consumed
   * @private
   */
  private parseRespArray(
    buffer: Buffer
  ): { message: RespMessage | null; consumed: number } | null {
    let pos = 1;

    const lengthEnd = buffer.indexOf(RESP_TYPES.CRLF, pos);
    if (lengthEnd === -1) return null;

    const arrayLength = parseInt(buffer.subarray(pos, lengthEnd).toString());
    if (isNaN(arrayLength) || arrayLength < 0) return null;
    
    pos = lengthEnd + RESP_TYPES.CRLF.length;

    const elements: (string | Buffer)[] = [];

    for (let i = 0; i < arrayLength; i++) {
      if (pos >= buffer.length) return null;

      const elementTypeByte = buffer[pos];
      if (elementTypeByte === undefined) return null;
      
      const elementType = String.fromCharCode(elementTypeByte);

      if (elementType === RESP_TYPES.BULK_STRING) {
        const bulkStringResult = this.parseBulkString(buffer, pos);
        if (!bulkStringResult) return null;
        
        elements.push(bulkStringResult.value);
        pos = bulkStringResult.consumed;
      } else if (elementType === RESP_TYPES.INTEGER) {
        const crlfIndex = buffer.indexOf(RESP_TYPES.CRLF, pos);
        if (crlfIndex === -1) return null;
        
        const intValue = buffer.subarray(pos + 1, crlfIndex).toString();
        elements.push(intValue);
        pos = crlfIndex + RESP_TYPES.CRLF.length;
      } else {
        return null;
      }
    }

    const message = this.createPubSubMessage(elements);
    return { message, consumed: pos };
  }

  /**
   * Creates a pub/sub message from parsed RESP array elements.
   * @param elements - Array elements from RESP array
   * @returns Parsed pub/sub message or null if invalid
   * @private
   */
  private createPubSubMessage(elements: (string | Buffer)[]): RespMessage | null {
    if (elements.length < 3) return null;

    const messageType = this.bufferToString(elements[0]!);
    
    switch (messageType) {
      case 'message':
        if (elements.length >= 3 && elements[2] !== undefined) {
          return {
            type: 'message',
            channel: this.bufferToString(elements[1]!),
            message: elements[2]
          };
        }
        break;
        
      case 'pmessage':
        if (elements.length >= 4 && elements[3] !== undefined) {
          return {
            type: 'pmessage',
            pattern: this.bufferToString(elements[1]!),
            channel: this.bufferToString(elements[2]!),
            message: elements[3]
          };
        }
        break;
        
      case 'subscribe':
      case 'psubscribe':
      case 'unsubscribe':
      case 'punsubscribe':
        if (elements.length >= 3) {
          const count = parseInt(this.bufferToString(elements[2]!));
          return {
            type: messageType as any,
            channel: this.bufferToString(elements[1]!),
            count: isNaN(count) ? 0 : count
          };
        }
        break;
    }
    
    return null;
  }

  /**
   * Safely converts Buffer or string to string.
   * @param value - Buffer or string value
   * @returns String representation
   * @private
   */
  private bufferToString(value: string | Buffer): string {
    return Buffer.isBuffer(value) ? value.toString() : String(value);
  }

  /**
   * Parses RESP bulk string from buffer.
   * @param buffer - Buffer containing RESP data
   * @param startPos - Starting position in buffer (should point to '$')
   * @returns Parsed bulk string value and bytes consumed
   * @private
   */
  private parseBulkString(
    buffer: Buffer,
    startPos: number
  ): { value: Buffer; consumed: number } | null {
    if (startPos >= buffer.length) return null;
    
    const startByte = buffer[startPos];
    if (startByte === undefined || String.fromCharCode(startByte) !== RESP_TYPES.BULK_STRING) {
      return null;
    }

    let pos = startPos + 1;

    const lengthEnd = buffer.indexOf(RESP_TYPES.CRLF, pos);
    if (lengthEnd === -1) return null;

    const stringLength = parseInt(buffer.subarray(pos, lengthEnd).toString());
    if (isNaN(stringLength) || stringLength < 0) return null;
    
    pos = lengthEnd + RESP_TYPES.CRLF.length;

    if (pos + stringLength + RESP_TYPES.CRLF.length > buffer.length) return null;

    const value = buffer.subarray(pos, pos + stringLength);
    pos += stringLength + RESP_TYPES.CRLF.length;

    return { value, consumed: pos };
  }

  /**
   * Processes parsed pub/sub message and emits appropriate events.
   * @param message - Parsed pub/sub message
   * @private
   */
  private handlePubSubMessage(message: RespMessage): void {
    switch (message.type) {
      case 'message':
        this.handleRegularMessage(message);
        break;
        
      case 'pmessage':
        this.handlePatternMessage(message);
        break;
        
      case 'subscribe':
      case 'psubscribe':
        break;
      case 'unsubscribe': {
        // Resolve channel-specific or all-unsubscribe awaits
        const key = message.channel;
        const resolver = this.pendingUnsub.get(key);
        if (resolver) {
          this.pendingUnsub.delete(key);
          try { resolver(); } catch {}
        }
        if ((message.count ?? 0) === 0 && this.unsubAllResolve) {
          const r = this.unsubAllResolve; this.unsubAllResolve = null;
          try { r(); } catch {}
        }
        break;
      }
      case 'punsubscribe': {
        const key = message.channel;
        const resolver = this.pendingPUnsub.get(key);
        if (resolver) {
          this.pendingPUnsub.delete(key);
          try { resolver(); } catch {}
        }
        if ((message.count ?? 0) === 0 && this.punsubAllResolve) {
          const r = this.punsubAllResolve; this.punsubAllResolve = null;
          try { r(); } catch {}
        }
        break;
      }
    }
  }

  /**
   * Handles regular channel message.
   * @param message - Message object containing channel and data
   * @private
   */
  private handleRegularMessage(message: RespMessage): void {
    if (!message.channel || message.message === undefined) return;

    const cleanChannel = this.removeKeyPrefix(message.channel);
    const messageData = message.message!;
    const messageBuffer = this.ensureBuffer(messageData);

    this.emit('message', cleanChannel, messageData);
    this.emit('messageBuffer', cleanChannel, messageBuffer);
  }

  /**
   * Handles pattern-based message.
   * @param message - Message object containing pattern, channel, and data
   * @private
   */
  private handlePatternMessage(message: RespMessage): void {
    if (!message.pattern || !message.channel || message.message === undefined) return;

    const cleanPattern = this.removeKeyPrefix(message.pattern);
    const cleanChannel = this.removeKeyPrefix(message.channel);
    const messageData = message.message!;
    const messageBuffer = this.ensureBuffer(messageData);

    this.emit('pmessage', cleanPattern, cleanChannel, messageData);
    this.emit('pmessageBuffer', cleanPattern, cleanChannel, messageBuffer);
  }

  /**
   * Removes key prefix from channel/pattern name if present.
   * @param name - Channel or pattern name
   * @returns Name without prefix
   * @private
   */
  private removeKeyPrefix(name: string): string {
    return this.keyPrefix && name.startsWith(this.keyPrefix) 
      ? name.substring(this.keyPrefix.length)
      : name;
  }

  /**
   * Ensures message is available as Buffer for binary compatibility.
   * @param message - Message data as string or Buffer
   * @returns Buffer representation of the message
   * @private
   */
  private ensureBuffer(message: string | Buffer): Buffer {
    return Buffer.isBuffer(message) 
      ? message 
      : Buffer.from(String(message), 'utf8');
  }

  /**
   * Sends RESP command to server.
   * @param command - Array of command arguments
   * @private
   */
  private async sendCommand(command: string[]): Promise<void> {
    await this.ensureConnected();
    
    const respCommand = this.buildRespCommand(command);
    this.socket!.write(respCommand);
  }

  /**
   * Sends RESP command with binary data to server.
   * @param command - Array of command arguments
   * @param binaryData - Binary message data
   * @private
   */
  private async sendCommandWithBinary(
    command: string[],
    binaryData: string | Buffer
  ): Promise<void> {
    await this.ensureConnected();

    const dataBuffer = Buffer.isBuffer(binaryData)
      ? binaryData
      : Buffer.from(binaryData, 'utf8');

    const totalArgs = command.length + 1;
    let header = `${RESP_TYPES.ARRAY}${totalArgs}${RESP_TYPES.CRLF}`;

    for (const arg of command) {
      header += `${RESP_TYPES.BULK_STRING}${Buffer.byteLength(arg)}${RESP_TYPES.CRLF}${arg}${RESP_TYPES.CRLF}`;
    }

    header += `${RESP_TYPES.BULK_STRING}${dataBuffer.length}${RESP_TYPES.CRLF}`;

    this.socket!.write(header);
    this.socket!.write(dataBuffer);
    this.socket!.write(RESP_TYPES.CRLF);
  }

  /**
   * Builds RESP command string from arguments.
   * @param command - Command arguments
   * @returns RESP formatted command string
   * @private
   */
  private buildRespCommand(command: string[]): string {
    let resp = `${RESP_TYPES.ARRAY}${command.length}${RESP_TYPES.CRLF}`;
    
    for (const arg of command) {
      const argBytes = Buffer.byteLength(arg);
      resp += `${RESP_TYPES.BULK_STRING}${argBytes}${RESP_TYPES.CRLF}${arg}${RESP_TYPES.CRLF}`;
    }
    
    return resp;
  }

  /**
   * Ensures connection is established before sending commands.
   * @private
   */
  private async ensureConnected(): Promise<void> {
    if (!this.socket || this.connectionStatus !== 'connected') {
      await this.connect();
    }
  }

  /**
   * Subscribes to a channel.
   * @param channel - Channel name to subscribe to
   */
  async subscribe(channel: string): Promise<void> {
    const prefixedChannel = this.keyPrefix + channel;
    this.subscriptions.add(prefixedChannel);
    await this.sendCommand(['SUBSCRIBE', prefixedChannel]);
  }

  /**
   * Unsubscribes from channel(s).
   * @param channel - Specific channel to unsubscribe from, or undefined for all
   */
  async unsubscribe(channel?: string): Promise<void> {
    if (channel) {
      const prefixedChannel = this.keyPrefix + channel;
      this.subscriptions.delete(prefixedChannel);
      const ack = new Promise<void>(resolve => this.pendingUnsub.set(prefixedChannel, resolve));
      await this.sendCommand(['UNSUBSCRIBE', prefixedChannel]);
      await Promise.race([
        ack,
        new Promise<void>(r => {
          const t = setTimeout(r, 500);
          (t as any).unref?.();
        }),
      ]);
    } else {
      this.subscriptions.clear();
      const ack = new Promise<void>(resolve => (this.unsubAllResolve = resolve));
      await this.sendCommand(['UNSUBSCRIBE']);
      await Promise.race([
        ack,
        new Promise<void>(r => {
          const t = setTimeout(r, 500);
          (t as any).unref?.();
        }),
      ]);
    }
    // Auto-close socket when nothing is subscribed
    if (this.subscriptions.size === 0 && this.patternSubscriptions.size === 0) {
      this.disconnect();
    }
  }

  /**
   * Subscribes to a pattern.
   * @param pattern - Pattern to subscribe to (supports wildcards)
   */
  async psubscribe(pattern: string): Promise<void> {
    const prefixedPattern = this.keyPrefix + pattern;
    this.patternSubscriptions.add(prefixedPattern);
    await this.sendCommand(['PSUBSCRIBE', prefixedPattern]);
  }

  /**
   * Unsubscribes from pattern(s).
   * @param pattern - Specific pattern to unsubscribe from, or undefined for all
   */
  async punsubscribe(pattern?: string): Promise<void> {
    if (pattern) {
      const prefixedPattern = this.keyPrefix + pattern;
      this.patternSubscriptions.delete(prefixedPattern);
      const ack = new Promise<void>(resolve => this.pendingPUnsub.set(prefixedPattern, resolve));
      await this.sendCommand(['PUNSUBSCRIBE', prefixedPattern]);
      await Promise.race([
        ack,
        new Promise<void>(r => {
          const t = setTimeout(r, 500);
          (t as any).unref?.();
        }),
      ]);
    } else {
      this.patternSubscriptions.clear();
      const ack = new Promise<void>(resolve => (this.punsubAllResolve = resolve));
      await this.sendCommand(['PUNSUBSCRIBE']);
      await Promise.race([
        ack,
        new Promise<void>(r => {
          const t = setTimeout(r, 500);
          (t as any).unref?.();
        }),
      ]);
    }
    // Auto-close socket when nothing is subscribed
    if (this.subscriptions.size === 0 && this.patternSubscriptions.size === 0) {
      this.disconnect();
    }
  }

  /**
   * Publishes message to channel.
   * @param channel - Channel to publish to
   * @param message - Message data (string or binary)
   * @returns Number of subscribers that received the message
   */
  async publish(channel: string, message: string | Buffer): Promise<number> {
    const prefixedChannel = this.keyPrefix + channel;
    await this.sendCommandWithBinary(['PUBLISH', prefixedChannel], message);
    return 1;
  }

  /**
   * Gets connection status in ioredis-compatible format.
   * @returns Connection status string
   */
  get status(): string {
    switch (this.connectionStatus) {
      case 'connecting':
        return 'connecting';
      case 'connected':
        return 'ready';
      default:
        return 'disconnected';
    }
  }

  /**
   * Creates a duplicate client instance with same configuration.
   * @returns New IoredisPubSubClient instance
   */
  duplicate(): IoredisPubSubClient {
    return new IoredisPubSubClient(this.options);
  }
}
