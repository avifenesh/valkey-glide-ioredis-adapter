/**
 * ioredis-compatible pub/sub client using direct TCP connection
 * Used when enableEventBasedPubSub is true for Socket.IO compatibility
 */

import { EventEmitter } from 'events';
import { Socket } from 'net';
import { RedisOptions } from '../types';

interface RedisMessage {
  type: string;
  channel: string;
  pattern?: string;
  message?: string | Buffer;
  count?: number;
}

export class IoredisPubSubClient extends EventEmitter {
  private socket: Socket | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' =
    'disconnected';
  private subscriptions = new Set<string>();
  private patternSubscriptions = new Set<string>();
  private buffer = Buffer.alloc(0);
  private keyPrefix: string;

  constructor(private options: RedisOptions) {
    super();
    this.keyPrefix = options.keyPrefix || '';
  }

  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') return;

    this.connectionStatus = 'connecting';
    this.emit('connecting');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeout || 10000);

      this.socket = new Socket();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.connectionStatus = 'connected';
        this.emit('connect');
        this.emit('ready');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleRedisData(data);
      });

      this.socket.on('error', error => {
        clearTimeout(timeout);
        this.connectionStatus = 'disconnected';
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('close', () => {
        this.connectionStatus = 'disconnected';
        this.emit('close');
        this.emit('end');
      });

      this.socket.connect(
        this.options.port ?? 6379,
        this.options.host ?? 'localhost'
      );
    });
  }

  disconnect(): void {
    if (this.socket) {
      // First try to gracefully end the connection
      this.socket.end();
      // Then force destroy to ensure cleanup
      this.socket.destroy();
      this.socket = null;
    }
    this.connectionStatus = 'disconnected';
    this.removeAllListeners();
  }

  // Redis RESP protocol parsing
  private handleRedisData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length > 0) {
      const parsed = this.parseRedisMessage(this.buffer);
      if (!parsed) break;

      this.buffer = this.buffer.subarray(parsed.consumed);

      if (parsed.message) {
        this.handlePubSubMessage(parsed.message);
      }
    }
  }

  private parseRedisMessage(
    buffer: Buffer
  ): { message: RedisMessage | null; consumed: number } | null {
    if (buffer.length === 0) return null;
    const firstByte = buffer[0];
    if (firstByte === undefined) return null;
    const type = String.fromCharCode(firstByte);

    if (type === '*') {
      // Array type - pub/sub messages are arrays
      return this.parseArray(buffer);
    }

    // Skip other types for now
    const newlineIndex = buffer.indexOf('\r\n');
    if (newlineIndex === -1) return null;

    return { message: null, consumed: newlineIndex + 2 };
  }

  private parseArray(
    buffer: Buffer
  ): { message: RedisMessage | null; consumed: number } | null {
    let pos = 1; // Skip '*'

    // Read array length
    const lengthEnd = buffer.indexOf('\r\n', pos);
    if (lengthEnd === -1) {
      return null;
    }

    const arrayLength = parseInt(buffer.subarray(pos, lengthEnd).toString());
    pos = lengthEnd + 2;

    const elements: (string | Buffer)[] = [];

    for (let i = 0; i < arrayLength; i++) {
      // Check element type
      if (pos >= buffer.length) {
        return null;
      }

      const elementTypeByte = buffer[pos];
      if (elementTypeByte === undefined) {
        return null;
      }
      const elementType = String.fromCharCode(elementTypeByte);

      if (elementType === '$') {
        // Bulk string
        const element = this.parseBulkString(buffer, pos);
        if (!element) {
          return null;
        }
        elements.push(element.value);
        pos = element.consumed;
      } else if (elementType === ':') {
        // Integer
        const newlineIndex = buffer.indexOf('\r\n', pos);
        if (newlineIndex === -1) {
          return null;
        }
        const intValue = buffer.subarray(pos + 1, newlineIndex).toString();
        elements.push(intValue);
        pos = newlineIndex + 2;
      } else {
        return null;
      }
    }

    // Parse pub/sub message
    let message: RedisMessage | null = null;

    // Debug removed to prevent post-test logging issues

    if (elements.length >= 3) {
      const messageType = Buffer.isBuffer(elements[0])
        ? elements[0].toString()
        : String(elements[0]);

      if (
        messageType === 'message' &&
        elements[1] &&
        elements[2] !== undefined
      ) {
        message = {
          type: 'message',
          channel: Buffer.isBuffer(elements[1])
            ? elements[1].toString()
            : String(elements[1]),
          message: elements[2], // Preserve Buffer for binary data
        };
      } else if (
        messageType === 'pmessage' &&
        elements[1] &&
        elements[2] &&
        elements[3] !== undefined
      ) {
        message = {
          type: 'pmessage',
          pattern: Buffer.isBuffer(elements[1])
            ? elements[1].toString()
            : String(elements[1]),
          channel: Buffer.isBuffer(elements[2])
            ? elements[2].toString()
            : String(elements[2]),
          message: elements[3], // Preserve Buffer for binary data
        };
      } else if (
        (messageType === 'subscribe' || messageType === 'psubscribe') &&
        elements[1] &&
        elements[2]
      ) {
        message = {
          type: messageType,
          channel: Buffer.isBuffer(elements[1])
            ? elements[1].toString()
            : String(elements[1]),
          count: parseInt(
            Buffer.isBuffer(elements[2])
              ? elements[2].toString()
              : String(elements[2])
          ),
          message: '', // Subscription confirmation has no message content
        };
      }
    }

    return { message, consumed: pos };
  }

  private parseBulkString(
    buffer: Buffer,
    startPos: number
  ): { value: Buffer; consumed: number } | null {
    if (startPos >= buffer.length) return null;
    const startByte = buffer[startPos];
    if (startByte === undefined || String.fromCharCode(startByte) !== '$') {
      return null;
    }

    let pos = startPos + 1; // Skip '$'

    const lengthEnd = buffer.indexOf('\r\n', pos);
    if (lengthEnd === -1) return null;

    const stringLength = parseInt(buffer.subarray(pos, lengthEnd).toString());
    pos = lengthEnd + 2;

    if (pos + stringLength + 2 > buffer.length) return null;

    // Always return raw Buffer to preserve binary data (Socket.IO/MessagePack compatibility)
    const value = buffer.subarray(pos, pos + stringLength);
    pos += stringLength + 2; // Skip string and \r\n

    return { value, consumed: pos };
  }

  private handlePubSubMessage(message: RedisMessage): void {
    if (
      message.type === 'message' &&
      message.channel &&
      message.message !== undefined
    ) {
      // Remove key prefix if present
      let channel = message.channel;
      if (this.keyPrefix && channel.startsWith(this.keyPrefix)) {
        channel = channel.substring(this.keyPrefix.length);
      }

      this.emit('message', channel, message.message);
      // Socket.IO adapter compatibility - also emit messageBuffer with correct parameter order: (channel, message)
      const messageBuffer = Buffer.isBuffer(message.message)
        ? message.message
        : Buffer.from(String(message.message), 'utf8');
      this.emit('messageBuffer', channel, messageBuffer);
    } else if (
      message.type === 'pmessage' &&
      message.pattern &&
      message.channel &&
      message.message !== undefined
    ) {
      let pattern = message.pattern;
      let channel = message.channel;

      if (this.keyPrefix) {
        if (pattern.startsWith(this.keyPrefix)) {
          pattern = pattern.substring(this.keyPrefix.length);
        }
        if (channel.startsWith(this.keyPrefix)) {
          channel = channel.substring(this.keyPrefix.length);
        }
      }

      this.emit('pmessage', pattern, channel, message.message);
      // Socket.IO adapter compatibility - also emit pmessageBuffer with correct parameter order: (pattern, channel, message)
      const messageBuffer = Buffer.isBuffer(message.message)
        ? message.message
        : Buffer.from(String(message.message), 'utf8');
      this.emit('pmessageBuffer', pattern, channel, messageBuffer);
    }
  }

  // Redis commands
  private async sendCommand(command: string[]): Promise<void> {
    if (!this.socket || this.connectionStatus !== 'connected') {
      await this.connect();
    }

    // Build RESP command
    let resp = `*${command.length}\r\n`;
    for (const arg of command) {
      resp += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
    }

    this.socket!.write(resp);
  }

  private async sendCommandWithBinary(
    command: string[],
    binaryData: string | Buffer
  ): Promise<void> {
    if (!this.socket || this.connectionStatus !== 'connected') {
      await this.connect();
    }

    // Build RESP command with binary data
    const totalArgs = command.length + 1;
    let resp = `*${totalArgs}\r\n`;

    // Add string arguments
    for (const arg of command) {
      resp += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
    }

    // Add binary data argument
    const dataBuffer = Buffer.isBuffer(binaryData)
      ? binaryData
      : Buffer.from(binaryData, 'utf8');
    resp += `$${dataBuffer.length}\r\n`;

    // Send the command header first
    this.socket!.write(resp);
    // Send the binary data directly
    this.socket!.write(dataBuffer);
    // Send the trailing CRLF
    this.socket!.write('\r\n');
  }

  async subscribe(channel: string): Promise<void> {
    const prefixedChannel = this.keyPrefix + channel;
    this.subscriptions.add(prefixedChannel);
    await this.sendCommand(['SUBSCRIBE', prefixedChannel]);
  }

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

  async psubscribe(pattern: string): Promise<void> {
    const prefixedPattern = this.keyPrefix + pattern;
    this.patternSubscriptions.add(prefixedPattern);
    await this.sendCommand(['PSUBSCRIBE', prefixedPattern]);
  }

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

  async publish(channel: string, message: string | Buffer): Promise<number> {
    const prefixedChannel = this.keyPrefix + channel;

    // For publish, we need to get a response, but pub/sub connections are one-way
    // We'll use a simple approach - assume success and return 1
    await this.sendCommandWithBinary(['PUBLISH', prefixedChannel], message);
    return 1;
  }

  // ioredis compatibility methods
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

  duplicate(): IoredisPubSubClient {
    return new IoredisPubSubClient(this.options);
  }
}
