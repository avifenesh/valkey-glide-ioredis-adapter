/**
 * ioredis-Compatible Pub/Sub Client
 * 
 * Direct TCP connection with RESP protocol parsing for full binary data support.
 * Used for Socket.IO compatibility and applications requiring binary message handling.
 * 
 * Part of the dual pub/sub architecture:
 * - DirectGlidePubSub: High-performance GLIDE native callbacks (text only)
 * - IoredisPubSubClient: Full ioredis compatibility with binary support
 */

import { EventEmitter } from 'events';
import { Socket } from 'net';
import { RedisOptions } from '../types';

// RESP protocol constants for better maintainability
const RESP_TYPES = {
  ARRAY: '*',
  BULK_STRING: '$',
  INTEGER: ':',
  CRLF: '\r\n'
} as const;

// Connection timeout and retry constants
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

      this.socket = new Socket();

      // Connection success handler
      this.socket.once('connect', () => {
        clearTimeout(timeout);
        this.connectionStatus = 'connected';
        this.emit('connect');
        this.emit('ready');
        resolve();
      });

      // Data handler for RESP protocol
      this.socket.on('data', (data: Buffer) => {
        try {
          this.handleRespData(data);
        } catch (error) {
          this.emit('error', new Error(`RESP parsing error: ${error}`));
        }
      });

      // Error handler
      this.socket.once('error', (error: Error) => {
        clearTimeout(timeout);
        this.cleanup();
        this.emit('error', error);
        reject(error);
      });

      // Connection close handler
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
    this.buffer = Buffer.alloc(0); // Clear parsing buffer
  }

  // === RESP Protocol Parsing ===
  
  /**
   * Handles incoming RESP data by parsing messages and updating buffer
   * @param data Incoming buffer data from socket
   */
  private handleRespData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    // Parse all complete messages from buffer
    while (this.buffer.length > 0) {
      const parseResult = this.parseRespMessage(this.buffer);
      if (!parseResult) break;

      // Update buffer to remove parsed data
      this.buffer = this.buffer.subarray(parseResult.consumed);

      // Process parsed pub/sub message
      if (parseResult.message) {
        this.handlePubSubMessage(parseResult.message);
      }
    }
  }

  /**
   * Parse a single RESP message from buffer
   * @param buffer Buffer containing RESP data
   * @returns Parsed message and bytes consumed, or null if incomplete
   */
  private parseRespMessage(
    buffer: Buffer
  ): { message: RespMessage | null; consumed: number } | null {
    if (buffer.length === 0) return null;
    
    const firstByte = buffer[0];
    if (firstByte === undefined) return null;
    
    const respType = String.fromCharCode(firstByte);

    if (respType === RESP_TYPES.ARRAY) {
      // Array type - pub/sub messages are arrays
      return this.parseRespArray(buffer);
    }

    // Skip non-array types (not expected in pub/sub context)
    const crlfIndex = buffer.indexOf(RESP_TYPES.CRLF);
    if (crlfIndex === -1) return null;

    return { message: null, consumed: crlfIndex + RESP_TYPES.CRLF.length };
  }

  /**
   * Parse RESP array containing pub/sub message
   * @param buffer Buffer starting with array marker '*'
   * @returns Parsed pub/sub message and bytes consumed
   */
  private parseRespArray(
    buffer: Buffer
  ): { message: RespMessage | null; consumed: number } | null {
    let pos = 1; // Skip array marker '*'

    // Read array length
    const lengthEnd = buffer.indexOf(RESP_TYPES.CRLF, pos);
    if (lengthEnd === -1) return null;

    const arrayLength = parseInt(buffer.subarray(pos, lengthEnd).toString());
    if (isNaN(arrayLength) || arrayLength < 0) return null;
    
    pos = lengthEnd + RESP_TYPES.CRLF.length;

    const elements: (string | Buffer)[] = [];

    // Parse each array element
    for (let i = 0; i < arrayLength; i++) {
      if (pos >= buffer.length) return null;

      const elementTypeByte = buffer[pos];
      if (elementTypeByte === undefined) return null;
      
      const elementType = String.fromCharCode(elementTypeByte);

      if (elementType === RESP_TYPES.BULK_STRING) {
        // Parse bulk string element
        const bulkStringResult = this.parseBulkString(buffer, pos);
        if (!bulkStringResult) return null;
        
        elements.push(bulkStringResult.value);
        pos = bulkStringResult.consumed;
      } else if (elementType === RESP_TYPES.INTEGER) {
        // Parse integer element
        const crlfIndex = buffer.indexOf(RESP_TYPES.CRLF, pos);
        if (crlfIndex === -1) return null;
        
        const intValue = buffer.subarray(pos + 1, crlfIndex).toString();
        elements.push(intValue);
        pos = crlfIndex + RESP_TYPES.CRLF.length;
      } else {
        // Unexpected element type in pub/sub message
        return null;
      }
    }

    // Parse pub/sub message from elements
    const message = this.createPubSubMessage(elements);
    return { message, consumed: pos };
  }

  /**
   * Creates a pub/sub message from parsed RESP array elements
   * @param elements Array elements from RESP array
   * @returns Parsed pub/sub message or null if invalid
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
            message: elements[2] // Preserve Buffer for binary data
          };
        }
        break;
        
      case 'pmessage':
        if (elements.length >= 4 && elements[3] !== undefined) {
          return {
            type: 'pmessage',
            pattern: this.bufferToString(elements[1]!),
            channel: this.bufferToString(elements[2]!),
            message: elements[3] // Preserve Buffer for binary data
          };
        }
        break;
        
      case 'subscribe':
      case 'psubscribe':
        if (elements.length >= 3) {
          const count = parseInt(this.bufferToString(elements[2]!));
          return {
            type: messageType as 'subscribe' | 'psubscribe',
            channel: this.bufferToString(elements[1]!),
            count: isNaN(count) ? 0 : count
          };
        }
        break;
    }
    
    return null; // Unknown or invalid message type
  }

  /**
   * Safely converts Buffer or string to string
   * @param value Buffer or string value
   * @returns String representation
   */
  private bufferToString(value: string | Buffer): string {
    return Buffer.isBuffer(value) ? value.toString() : String(value);
  }

  /**
   * Parse RESP bulk string from buffer
   * @param buffer Buffer containing RESP data
   * @param startPos Starting position in buffer (should point to '$')
   * @returns Parsed bulk string value and bytes consumed
   */
  private parseBulkString(
    buffer: Buffer,
    startPos: number
  ): { value: Buffer; consumed: number } | null {
    if (startPos >= buffer.length) return null;
    
    // Verify bulk string marker
    const startByte = buffer[startPos];
    if (startByte === undefined || String.fromCharCode(startByte) !== RESP_TYPES.BULK_STRING) {
      return null;
    }

    let pos = startPos + 1; // Skip '$' marker

    // Find length specification end
    const lengthEnd = buffer.indexOf(RESP_TYPES.CRLF, pos);
    if (lengthEnd === -1) return null;

    // Parse string length
    const stringLength = parseInt(buffer.subarray(pos, lengthEnd).toString());
    if (isNaN(stringLength) || stringLength < 0) return null;
    
    pos = lengthEnd + RESP_TYPES.CRLF.length;

    // Check if we have enough data for the string + CRLF
    if (pos + stringLength + RESP_TYPES.CRLF.length > buffer.length) return null;

    // Extract raw Buffer to preserve binary data (critical for Socket.IO/MessagePack)
    const value = buffer.subarray(pos, pos + stringLength);
    pos += stringLength + RESP_TYPES.CRLF.length;

    return { value, consumed: pos };
  }

  // === Event Emission ===
  
  /**
   * Process parsed pub/sub message and emit appropriate events
   * @param message Parsed pub/sub message
   */
  private handlePubSubMessage(message: RespMessage): void {
    switch (message.type) {
      case 'message':
        this.handleRegularMessage(message);
        break;
        
      case 'pmessage':
        this.handlePatternMessage(message);
        break;
        
      // Subscription confirmations are handled but not emitted as user events
      case 'subscribe':
      case 'psubscribe':
        // These are internal confirmations, no user-facing events needed
        break;
    }
  }

  /**
   * Handle regular channel message
   */
  private handleRegularMessage(message: RespMessage): void {
    if (!message.channel || message.message === undefined) return;

    const cleanChannel = this.removeKeyPrefix(message.channel);
    const messageData = message.message!; // Safe after undefined check
    const messageBuffer = this.ensureBuffer(messageData);

    // Emit both string and buffer variants for compatibility
    this.emit('message', cleanChannel, messageData);
    this.emit('messageBuffer', cleanChannel, messageBuffer);
  }

  /**
   * Handle pattern-based message
   */
  private handlePatternMessage(message: RespMessage): void {
    if (!message.pattern || !message.channel || message.message === undefined) return;

    const cleanPattern = this.removeKeyPrefix(message.pattern);
    const cleanChannel = this.removeKeyPrefix(message.channel);
    const messageData = message.message!; // Safe after undefined check
    const messageBuffer = this.ensureBuffer(messageData);

    // Emit both string and buffer variants for compatibility  
    this.emit('pmessage', cleanPattern, cleanChannel, messageData);
    this.emit('pmessageBuffer', cleanPattern, cleanChannel, messageBuffer);
  }

  /**
   * Remove key prefix from channel/pattern name if present
   */
  private removeKeyPrefix(name: string): string {
    return this.keyPrefix && name.startsWith(this.keyPrefix) 
      ? name.substring(this.keyPrefix.length)
      : name;
  }

  /**
   * Ensure message is available as Buffer for binary compatibility
   */
  private ensureBuffer(message: string | Buffer): Buffer {
    return Buffer.isBuffer(message) 
      ? message 
      : Buffer.from(String(message), 'utf8');
  }

  // === Command Transmission ===

  /**
   * Send RESP command to server
   * @param command Array of command arguments
   */
  private async sendCommand(command: string[]): Promise<void> {
    await this.ensureConnected();
    
    const respCommand = this.buildRespCommand(command);
    this.socket!.write(respCommand);
  }

  /**
   * Send RESP command with binary data to server
   * @param command Array of command arguments
   * @param binaryData Binary message data
   */
  private async sendCommandWithBinary(
    command: string[],
    binaryData: string | Buffer
  ): Promise<void> {
    await this.ensureConnected();

    const dataBuffer = Buffer.isBuffer(binaryData)
      ? binaryData
      : Buffer.from(binaryData, 'utf8');

    // Build command header
    const totalArgs = command.length + 1;
    let header = `${RESP_TYPES.ARRAY}${totalArgs}${RESP_TYPES.CRLF}`;

    // Add string command arguments
    for (const arg of command) {
      header += `${RESP_TYPES.BULK_STRING}${Buffer.byteLength(arg)}${RESP_TYPES.CRLF}${arg}${RESP_TYPES.CRLF}`;
    }

    // Add binary data length
    header += `${RESP_TYPES.BULK_STRING}${dataBuffer.length}${RESP_TYPES.CRLF}`;

    // Send command in parts to handle binary data properly
    this.socket!.write(header);
    this.socket!.write(dataBuffer);
    this.socket!.write(RESP_TYPES.CRLF);
  }

  /**
   * Build RESP command string from arguments
   * @param command Command arguments
   * @returns RESP formatted command string
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
   * Ensure connection is established before sending commands
   */
  private async ensureConnected(): Promise<void> {
    if (!this.socket || this.connectionStatus !== 'connected') {
      await this.connect();
    }
  }

  // === Public API Methods ===

  /**
   * Subscribe to a channel
   * @param channel Channel name to subscribe to
   */
  async subscribe(channel: string): Promise<void> {
    const prefixedChannel = this.keyPrefix + channel;
    this.subscriptions.add(prefixedChannel);
    await this.sendCommand(['SUBSCRIBE', prefixedChannel]);
  }

  /**
   * Unsubscribe from channel(s)
   * @param channel Specific channel to unsubscribe from, or undefined for all
   */
  async unsubscribe(channel?: string): Promise<void> {
    if (channel) {
      const prefixedChannel = this.keyPrefix + channel;
      this.subscriptions.delete(prefixedChannel);
      await this.sendCommand(['UNSUBSCRIBE', prefixedChannel]);
    } else {
      this.subscriptions.clear();
      await this.sendCommand(['UNSUBSCRIBE']);
    }
  }

  /**
   * Subscribe to a pattern
   * @param pattern Pattern to subscribe to (supports wildcards)
   */
  async psubscribe(pattern: string): Promise<void> {
    const prefixedPattern = this.keyPrefix + pattern;
    this.patternSubscriptions.add(prefixedPattern);
    await this.sendCommand(['PSUBSCRIBE', prefixedPattern]);
  }

  /**
   * Unsubscribe from pattern(s)
   * @param pattern Specific pattern to unsubscribe from, or undefined for all
   */
  async punsubscribe(pattern?: string): Promise<void> {
    if (pattern) {
      const prefixedPattern = this.keyPrefix + pattern;
      this.patternSubscriptions.delete(prefixedPattern);
      await this.sendCommand(['PUNSUBSCRIBE', prefixedPattern]);
    } else {
      this.patternSubscriptions.clear();
      await this.sendCommand(['PUNSUBSCRIBE']);
    }
  }

  /**
   * Publish message to channel
   * @param channel Channel to publish to
   * @param message Message data (string or binary)
   * @returns Number of subscribers that received the message (always 1 in this implementation)
   */
  async publish(channel: string, message: string | Buffer): Promise<number> {
    const prefixedChannel = this.keyPrefix + channel;

    // Note: Pub/sub connections are typically one-way, so we don't get 
    // the actual subscriber count. Return 1 to indicate successful send.
    await this.sendCommandWithBinary(['PUBLISH', prefixedChannel], message);
    return 1;
  }

  // === ioredis Compatibility ===

  /**
   * Get connection status in ioredis-compatible format
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
   * Create a duplicate client instance with same configuration
   * @returns New IoredisPubSubClient instance
   */
  duplicate(): IoredisPubSubClient {
    return new IoredisPubSubClient(this.options);
  }
}
