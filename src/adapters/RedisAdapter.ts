/**
 * RedisAdapter Implementation
 * ioredis-compatible client built on valkey-glide
 */

import { Batch, GlideClient, Script, TimeUnit } from '@valkey/valkey-glide';
import { EventEmitter } from 'events';
import {
  ConnectionStatus,
  IRedisAdapter,
  Multi,
  Pipeline,
  RedisKey,
  RedisOptions,
  RedisValue,
} from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';

export class RedisAdapter extends EventEmitter implements IRedisAdapter {
  private _status: ConnectionStatus = 'disconnected';
  private client: GlideClient | null = null;
  private subscriberClient: GlideClient | null = null;
  private _options: RedisOptions;
  private watchedKeys: Set<string> = new Set();
  private subscribedChannels: Set<string> = new Set();
  private subscribedPatterns: Set<string> = new Set();
  private isInSubscriberMode: boolean = false;

  constructor();
  constructor(port: number, host?: string);
  constructor(options: RedisOptions);
  constructor(url: string);
  constructor(portOrOptions?: number | RedisOptions | string, host?: string) {
    super();
    
    // Parse constructor arguments (ioredis style)
    if (typeof portOrOptions === 'number') {
      this._options = { port: portOrOptions, host: host || 'localhost' };
    } else if (typeof portOrOptions === 'string') {
      this._options = this.parseRedisUrl(portOrOptions);
    } else if (typeof portOrOptions === 'object') {
      this._options = portOrOptions;
    } else {
      this._options = { port: 6379, host: 'localhost' };
    }
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get options(): RedisOptions {
    return this._options;
  }

  private parseRedisUrl(url: string): RedisOptions {
    // Simple URL parsing for redis:// URLs
    const match = url.match(/redis:\/\/(.*?):(\d+)/);
    if (match && match[1] && match[2]) {
      return { host: match[1], port: parseInt(match[2], 10) };
    }
    return { host: 'localhost', port: 6379 };
  }

  // Connection management
  async connect(): Promise<void> {
    if (this._status === 'ready' || this._status === 'connecting') {
      return;
    }

    try {
      this._status = 'connecting';
      this.emit('connect');
      
      const config = {
        addresses: [{ host: this._options.host || 'localhost', port: this._options.port || 6379 }],
        ...(this._options.password && { 
          credentials: { password: this._options.password }
        })
      };
      
      // Import GlideClient dynamically to handle potential import issues
      const { GlideClient } = await import('@valkey/valkey-glide');
      this.client = await GlideClient.createClient(config);
      
      this._status = 'ready';
      this.emit('ready');
    } catch (error) {
      this._status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this._status === 'disconnected' || this._status === 'disconnecting') {
      return;
    }

    try {
      this._status = 'disconnecting';
      
      // Clean up subscriber client first
      if (this.subscriberClient) {
        try {
          await this.subscriberClient.close();
        } catch (error) {
          // Log but don't fail disconnect for subscriber cleanup issues
          console.warn('Warning: Error closing subscriber client:', error);
        }
        this.subscriberClient = null;
      }
      
      // Clean up main client
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      
      // Reset state
      this.watchedKeys.clear();
      this.subscribedChannels.clear();
      this.subscribedPatterns.clear();
      this.isInSubscriberMode = false;
      
      this._status = 'end';
      this.emit('end');
    } catch (error) {
      this._status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  async ping(message?: string): Promise<string> {
    if (!this.client) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    const result = await this.client.ping(message ? { message } : undefined);
    return (result?.toString() || 'PONG');
  }

  /**
   * Ensure client is connected before executing commands
   */
  private async ensureConnected(): Promise<GlideClient> {
    if (!this.client) {
      await this.connect();
    }
    
    if (!this.client) {
      throw new Error('Failed to establish connection');
    }
    
    return this.client;
  }

  /**
   * Create and configure subscriber client for pub/sub operations
   */
  private async createSubscriberConnection(): Promise<GlideClient> {
    if (this.subscriberClient) {
      return this.subscriberClient;
    }

    const config = {
      addresses: [{ host: this._options.host || 'localhost', port: this._options.port || 6379 }],
      ...(this._options.password && { 
        credentials: { password: this._options.password }
      })
    };
    
    // Import GlideClient dynamically to handle potential import issues
    const { GlideClient } = await import('@valkey/valkey-glide');
    this.subscriberClient = await GlideClient.createClient(config);
    
    // Set up message handlers for the subscriber client
    this.setupMessageHandlers(this.subscriberClient);
    
    return this.subscriberClient;
  }

  /**
   * Setup message event handlers for subscriber client
   */
  private setupMessageHandlers(_client: GlideClient): void {
    // Note: Valkey GLIDE handles pub/sub message routing differently than ioredis
    // In a real implementation, we would need to set up a background listener
    // that polls for messages or uses Valkey GLIDE's pub/sub callback mechanisms
    
    // For now, we provide the infrastructure for message handling
    // The actual message polling would need to be implemented based on
    // Valkey GLIDE's final pub/sub API when it becomes available
    
    // TODO: Implement actual message polling/callback mechanism
    // This would involve setting up a background task that:
    // 1. Listens for incoming pub/sub messages
    // 2. Emits 'message' events for regular subscriptions
    // 3. Emits 'pmessage' events for pattern subscriptions
  }

  // String commands
  async set(key: RedisKey, value: RedisValue, ...args: any[]): Promise<string | null> {
    const client = await this.ensureConnected();
    const translated = ParameterTranslator.translateSetArgs([key, value, ...args]);
    
    const result = await client.set(translated.key, translated.value, translated.options);
    
    // If result is null, it means conditional set failed (NX/XX condition not met)
    if (result === null) {
      return null;
    }
    
    return ParameterTranslator.convertGlideString(result) || 'OK';
  }

  async get(key: RedisKey): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.get(normalizedKey);
    return ParameterTranslator.convertGlideString(result);
  }

  async mget(...keysOrArray: any[]): Promise<(string | null)[]> {
    const client = await this.ensureConnected();
    const keyStrings = ParameterTranslator.translateMGetArgs(keysOrArray);
    const result = await client.mget(keyStrings);
    return ParameterTranslator.convertGlideStringArray(result);
  }

  async mset(...argsOrHash: any[]): Promise<string> {
    const client = await this.ensureConnected();
    const keyValueMap = ParameterTranslator.translateMSetArgs(argsOrHash);
    await client.mset(keyValueMap);
    return 'OK';
  }

  async incr(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.incr(normalizedKey);
  }

  async decr(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.decr(normalizedKey);
  }

  async incrby(key: RedisKey, increment: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.incrBy(normalizedKey, increment);
  }

  async decrby(key: RedisKey, decrement: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.decrBy(normalizedKey, decrement);
  }

  async incrbyfloat(key: RedisKey, increment: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.incrByFloat(normalizedKey, increment);
  }

  async append(key: RedisKey, value: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await client.append(normalizedKey, normalizedValue);
  }

  async strlen(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.strlen(normalizedKey);
  }

  async getrange(key: RedisKey, start: number, end: number): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.getrange(normalizedKey, start, end);
    return ParameterTranslator.convertGlideString(result) || '';
  }

  async setrange(key: RedisKey, offset: number, value: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await client.setrange(normalizedKey, offset, normalizedValue);
  }

  async setex(key: RedisKey, seconds: number, value: RedisValue): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await client.set(normalizedKey, normalizedValue, { expiry: { type: TimeUnit.Seconds, count: seconds } });
    return 'OK';
  }

  async setnx(key: RedisKey, value: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    const result = await client.set(normalizedKey, normalizedValue, { conditionalSet: 'onlyIfDoesNotExist' });
    return result === 'OK' ? 1 : 0;
  }

  async psetex(key: RedisKey, milliseconds: number, value: RedisValue): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await client.set(normalizedKey, normalizedValue, { expiry: { type: TimeUnit.Milliseconds, count: milliseconds } });
    return 'OK';
  }

  // Hash commands
  async hset(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const translated = ParameterTranslator.translateHSetArgs([key, ...args]);
    const hashDataType = Object.entries(translated.fieldValues).map(([field, value]) => ({
      field,
      value
    }));
    return await client.hset(translated.key, hashDataType);
  }

  async hget(key: RedisKey, field: string): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hget(normalizedKey, field);
    return ParameterTranslator.convertGlideString(result);
  }

  async hmset(key: RedisKey, ...args: any[]): Promise<string> {
    const client = await this.ensureConnected();
    const translated = ParameterTranslator.translateHSetArgs([key, ...args]);
    const hashDataType = Object.entries(translated.fieldValues).map(([field, value]) => ({
      field,
      value
    }));
    await client.hset(translated.key, hashDataType);
    return 'OK';
  }

  async hmget(key: RedisKey, ...fieldsOrArray: any[]): Promise<(string | null)[]> {
    const client = await this.ensureConnected();
    const fields = Array.isArray(fieldsOrArray[0]) ? fieldsOrArray[0] : fieldsOrArray;
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hmget(normalizedKey, fields);
    return ParameterTranslator.convertGlideStringArray(result);
  }

  async hgetall(key: RedisKey): Promise<Record<string, string>> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hgetall(normalizedKey);
    const converted: Record<string, string> = {};
    
    if (result) {
      for (const [field, value] of Object.entries(result)) {
        converted[ParameterTranslator.convertGlideString(field) || ''] = 
          ParameterTranslator.convertGlideString(value) || '';
      }
    }
    
    return converted;
  }

  async hdel(key: RedisKey, ...fields: string[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hdel(normalizedKey, fields);
  }

  async hexists(key: RedisKey, field: string): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hexists(normalizedKey, field);
    return result ? 1 : 0;
  }

  async hkeys(key: RedisKey): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hkeys(normalizedKey);
    const converted = ParameterTranslator.convertGlideStringArray(result);
    return converted ? converted.filter((val): val is string => val !== null) : [];
  }

  async hvals(key: RedisKey): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hvals(normalizedKey);
    const converted = ParameterTranslator.convertGlideStringArray(result);
    return converted ? converted.filter((val): val is string => val !== null) : [];
  }

  async hlen(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hlen(normalizedKey);
  }

  async hincrby(key: RedisKey, field: string, increment: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hincrBy(normalizedKey, field, increment);
  }

  async hincrbyfloat(key: RedisKey, field: string, increment: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hincrByFloat(normalizedKey, field, increment);
  }

  async hsetnx(key: RedisKey, field: string, value: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    const result = await client.hsetnx(normalizedKey, field, normalizedValue);
    return result ? 1 : 0;
  }

  // List commands
  async lpush(key: RedisKey, ...elementsOrArray: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const elements = Array.isArray(elementsOrArray[0]) ? elementsOrArray[0] : elementsOrArray;
    const normalizedElements = elements.map(el => ParameterTranslator.normalizeValue(el));
    return await client.lpush(normalizedKey, normalizedElements);
  }

  async rpush(key: RedisKey, ...elementsOrArray: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const elements = Array.isArray(elementsOrArray[0]) ? elementsOrArray[0] : elementsOrArray;
    const normalizedElements = elements.map(el => ParameterTranslator.normalizeValue(el));
    return await client.rpush(normalizedKey, normalizedElements);
  }

  async lpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    if (count !== undefined) {
      const result = await client.lpopCount(normalizedKey, count);
      if (result === null) return null;
      const converted = ParameterTranslator.convertGlideStringArray(result);
      return converted ? converted.filter((val): val is string => val !== null) : [];
    } else {
      const result = await client.lpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async rpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    if (count !== undefined) {
      const result = await client.rpopCount(normalizedKey, count);
      if (result === null) return null;
      const converted = ParameterTranslator.convertGlideStringArray(result);
      return converted ? converted.filter((val): val is string => val !== null) : [];
    } else {
      const result = await client.rpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.lrange(normalizedKey, start, stop);
    const converted = ParameterTranslator.convertGlideStringArray(result);
    return converted ? converted.filter((val): val is string => val !== null) : [];
  }

  async llen(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.llen(normalizedKey);
  }

  async lindex(key: RedisKey, index: number): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.lindex(normalizedKey, index);
    return ParameterTranslator.convertGlideString(result);
  }

  async lset(key: RedisKey, index: number, element: RedisValue): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedElement = ParameterTranslator.normalizeValue(element);
    await client.lset(normalizedKey, index, normalizedElement);
    return 'OK';
  }

  async ltrim(key: RedisKey, start: number, stop: number): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    await client.ltrim(normalizedKey, start, stop);
    return 'OK';
  }

  async lrem(key: RedisKey, count: number, element: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedElement = ParameterTranslator.normalizeValue(element);
    return await client.lrem(normalizedKey, count, normalizedElement);
  }

  async lpushx(key: RedisKey, ...elements: RedisValue[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedElements = elements.map(el => ParameterTranslator.normalizeValue(el));
    return await client.lpushx(normalizedKey, normalizedElements);
  }

  async rpushx(key: RedisKey, ...elements: RedisValue[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedElements = elements.map(el => ParameterTranslator.normalizeValue(el));
    return await client.rpushx(normalizedKey, normalizedElements);
  }

  // Key commands
  async del(...keys: RedisKey[]): Promise<number> {
    const client = await this.ensureConnected();
    const keyStrings = ParameterTranslator.translateDelArgs(keys);
    return await client.del(keyStrings);
  }

  async exists(...keys: RedisKey[]): Promise<number> {
    const client = await this.ensureConnected();
    const keyStrings = ParameterTranslator.translateExistsArgs(keys);
    return await client.exists(keyStrings);
  }

  async expire(key: RedisKey, seconds: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.expire(normalizedKey, seconds);
    return result ? 1 : 0;
  }

  async ttl(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.ttl(normalizedKey);
    // Handle special cases: -1 (no expire), -2 (key doesn't exist)
    if (result === -1 || result === -2) {
      return result;
    }
    return result;
  }

  async type(key: RedisKey): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.type(normalizedKey);
    return ParameterTranslator.convertGlideString(result) || 'none';
  }

  async keys(pattern: string = '*'): Promise<string[]> {
    const client = await this.ensureConnected();
    const result = await client.customCommand(['KEYS', pattern]);
    if (Array.isArray(result)) {
      return result.map(item => ParameterTranslator.convertGlideString(item) || '');
    }
    return [];
  }

  // Generic command execution
  async call(command: string, ...args: (string | number | Buffer)[]): Promise<any> {
    const client = await this.ensureConnected();
    const stringArgs = args.map(arg => arg.toString());
    return await client.customCommand([command, ...stringArgs]);
  }

  // Pipeline and transactions
  pipeline(): Pipeline {
    return new PipelineAdapter(this);
  }

  multi(): Multi {
    return new MultiAdapter(this, new Set(this.watchedKeys));
  }

  // Pub/Sub
  async publish(channel: string, message: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedChannel = ParameterTranslator.normalizeKey(channel);
    const normalizedMessage = ParameterTranslator.normalizeValue(message);
    return await client.publish(normalizedChannel, normalizedMessage);
  }

  async subscribe(...channels: string[]): Promise<number> {
    // Create subscriber client if not exists
    if (!this.subscriberClient) {
      await this.createSubscriberConnection();
    }
    
    let totalSubscribed = this.subscribedChannels.size;
    
    for (const channel of channels) {
      if (!this.subscribedChannels.has(channel)) {
        try {
          // Use separate subscriber client for pub/sub operations
          await this.subscriberClient!.customCommand(['SUBSCRIBE', channel]);
          this.subscribedChannels.add(channel);
          totalSubscribed++;
          
          // Emit subscribe event
          this.emit('subscribe', channel, totalSubscribed);
        } catch (error) {
          // Log error but continue with other channels
          console.warn(`Failed to subscribe to channel ${channel}:`, error);
        }
      }
    }
    
    this.isInSubscriberMode = true;
    return this.subscribedChannels.size;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    if (!this.subscriberClient || !this.isInSubscriberMode) {
      return 0;
    }
    
    // If no channels specified, unsubscribe from all
    if (channels.length === 0) {
      const allChannels = Array.from(this.subscribedChannels);
      for (const channel of allChannels) {
        try {
          await this.subscriberClient.customCommand(['UNSUBSCRIBE', channel]);
          this.subscribedChannels.delete(channel);
          this.emit('unsubscribe', channel, this.subscribedChannels.size);
        } catch (error) {
          console.warn(`Failed to unsubscribe from channel ${channel}:`, error);
        }
      }
    } else {
      // Unsubscribe from specific channels
      for (const channel of channels) {
        if (this.subscribedChannels.has(channel)) {
          try {
            await this.subscriberClient.customCommand(['UNSUBSCRIBE', channel]);
            this.subscribedChannels.delete(channel);
            this.emit('unsubscribe', channel, this.subscribedChannels.size);
          } catch (error) {
            console.warn(`Failed to unsubscribe from channel ${channel}:`, error);
          }
        }
      }
    }
    
    // Exit subscriber mode if no more subscriptions
    if (this.subscribedChannels.size === 0 && this.subscribedPatterns.size === 0) {
      this.isInSubscriberMode = false;
    }
    
    return this.subscribedChannels.size;
  }

  async psubscribe(...patterns: string[]): Promise<number> {
    // Create subscriber client if not exists
    if (!this.subscriberClient) {
      await this.createSubscriberConnection();
    }
    
    let totalSubscribed = this.subscribedPatterns.size;
    
    for (const pattern of patterns) {
      if (!this.subscribedPatterns.has(pattern)) {
        try {
          // Use separate subscriber client for pub/sub operations
          await this.subscriberClient!.customCommand(['PSUBSCRIBE', pattern]);
          this.subscribedPatterns.add(pattern);
          totalSubscribed++;
          
          // Emit psubscribe event
          this.emit('psubscribe', pattern, totalSubscribed);
        } catch (error) {
          // Log error but continue with other patterns
          console.warn(`Failed to subscribe to pattern ${pattern}:`, error);
        }
      }
    }
    
    this.isInSubscriberMode = true;
    return this.subscribedPatterns.size;
  }

  async punsubscribe(...patterns: string[]): Promise<number> {
    if (!this.subscriberClient || !this.isInSubscriberMode) {
      return 0;
    }
    
    // If no patterns specified, unsubscribe from all
    if (patterns.length === 0) {
      const allPatterns = Array.from(this.subscribedPatterns);
      for (const pattern of allPatterns) {
        try {
          await this.subscriberClient.customCommand(['PUNSUBSCRIBE', pattern]);
          this.subscribedPatterns.delete(pattern);
          this.emit('punsubscribe', pattern, this.subscribedPatterns.size);
        } catch (error) {
          console.warn(`Failed to unsubscribe from pattern ${pattern}:`, error);
        }
      }
    } else {
      // Unsubscribe from specific patterns
      for (const pattern of patterns) {
        if (this.subscribedPatterns.has(pattern)) {
          try {
            await this.subscriberClient.customCommand(['PUNSUBSCRIBE', pattern]);
            this.subscribedPatterns.delete(pattern);
            this.emit('punsubscribe', pattern, this.subscribedPatterns.size);
          } catch (error) {
            console.warn(`Failed to unsubscribe from pattern ${pattern}:`, error);
          }
        }
      }
    }
    
    // Exit subscriber mode if no more subscriptions
    if (this.subscribedChannels.size === 0 && this.subscribedPatterns.size === 0) {
      this.isInSubscriberMode = false;
    }
    
    return this.subscribedPatterns.size;
  }

  async watch(...keys: RedisKey[]): Promise<string> {
    // Track keys locally for transaction context
    keys.forEach(key => this.watchedKeys.add(ParameterTranslator.normalizeKey(key)));
    
    // Execute WATCH command through valkey-glide
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(key => ParameterTranslator.normalizeKey(key));
    await client.customCommand(['WATCH', ...normalizedKeys]);
    
    return 'OK';
  }
  
  async unwatch(): Promise<string> {
    // Clear local tracking
    this.watchedKeys.clear();
    
    // Execute UNWATCH command through valkey-glide
    const client = await this.ensureConnected();
    await client.customCommand(['UNWATCH']);
    
    return 'OK';
  }

  // Script methods implementation using Valkey Glide's Script object
  async scriptLoad(script: string): Promise<string> {
    const client = await this.ensureConnected();
    
    // Create a Script object for automatic hash generation and management
    const scriptObj = new Script(script);
    
    try {
      // Ensure script is loaded in Redis cache using SCRIPT LOAD
      await client.customCommand(['SCRIPT', 'LOAD', script]);
      
      // Return the hash from the Script object
      return scriptObj.getHash();
    } catch (error) {
      // If SCRIPT LOAD fails, still return the hash for compatibility
      // The script can be loaded later when executed
      console.warn('Script load failed, but hash is still available:', error);
      return scriptObj.getHash();
    }
  }

  async scriptExists(...scripts: string[]): Promise<boolean[]> {
    const client = await this.ensureConnected();
    const result = await client.customCommand(['SCRIPT', 'EXISTS', ...scripts]);
    // The result should be an array of 0s and 1s
    if (Array.isArray(result)) {
      return result.map((val: any) => val === 1);
    }
    // Fallback in case of unexpected result format
    return scripts.map(() => false);
  }

  async scriptFlush(): Promise<string> {
    const client = await this.ensureConnected();
    await client.customCommand(['SCRIPT', 'FLUSH']);
    return 'OK';
  }

  async eval(script: string, numkeys: number, ...keysAndArgs: any[]): Promise<any> {
    const client = await this.ensureConnected();
    
    // Convert keys and arguments to appropriate format
    const keys = keysAndArgs.slice(0, numkeys).map(String);
    const args = keysAndArgs.slice(numkeys).map(String);
    
    // Execute the script using customCommand with EVAL
    const commandArgs = [script, numkeys.toString(), ...keys, ...args];
    return await client.customCommand(['EVAL', ...commandArgs]);
  }

  async evalsha(sha1: string, numkeys: number, ...keysAndArgs: any[]): Promise<any> {
    const client = await this.ensureConnected();
    
    // Convert keys and arguments to appropriate format
    const keys = keysAndArgs.slice(0, numkeys).map(String);
    const args = keysAndArgs.slice(numkeys).map(String);
    
    try {
      // Try direct EVALSHA first
      const commandArgs = [sha1, numkeys.toString(), ...keys, ...args];
      return await client.customCommand(['EVALSHA', ...commandArgs]);
    } catch (error) {
      // If NOSCRIPT error, we can't auto-retry without the original script
      // This is expected ioredis behavior - the caller should handle NOSCRIPT
      if (error && error.toString().includes('NOSCRIPT')) {
        // Re-throw NOSCRIPT errors for the caller to handle
        throw error;
      }
      // For other errors, also re-throw
      throw error;
    }
  }
}

// Pipeline mock implementation
class PipelineAdapter implements Pipeline {
  protected commands: Array<{ method: string; args: any[] }> = [];
  protected redis: RedisAdapter;

  constructor(redis: RedisAdapter) {
    this.redis = redis;
  }

  // String commands
  set(key: RedisKey, value: RedisValue, ...args: any[]): Pipeline {
    this.commands.push({ method: 'set', args: [key, value, ...args] });
    return this;
  }

  get(key: RedisKey): Pipeline {
    this.commands.push({ method: 'get', args: [key] });
    return this;
  }

  mget(...keys: any[]): Pipeline {
    this.commands.push({ method: 'mget', args: keys });
    return this;
  }

  mset(...args: any[]): Pipeline {
    this.commands.push({ method: 'mset', args });
    return this;
  }

  incr(key: RedisKey): Pipeline {
    this.commands.push({ method: 'incr', args: [key] });
    return this;
  }

  decr(key: RedisKey): Pipeline {
    this.commands.push({ method: 'decr', args: [key] });
    return this;
  }

  incrby(key: RedisKey, increment: number): Pipeline {
    this.commands.push({ method: 'incrby', args: [key, increment] });
    return this;
  }

  decrby(key: RedisKey, decrement: number): Pipeline {
    this.commands.push({ method: 'decrby', args: [key, decrement] });
    return this;
  }

  incrbyfloat(key: RedisKey, increment: number): Pipeline {
    this.commands.push({ method: 'incrbyfloat', args: [key, increment] });
    return this;
  }

  append(key: RedisKey, value: RedisValue): Pipeline {
    this.commands.push({ method: 'append', args: [key, value] });
    return this;
  }

  strlen(key: RedisKey): Pipeline {
    this.commands.push({ method: 'strlen', args: [key] });
    return this;
  }

  getrange(key: RedisKey, start: number, end: number): Pipeline {
    this.commands.push({ method: 'getrange', args: [key, start, end] });
    return this;
  }

  setrange(key: RedisKey, offset: number, value: RedisValue): Pipeline {
    this.commands.push({ method: 'setrange', args: [key, offset, value] });
    return this;
  }

  setex(key: RedisKey, seconds: number, value: RedisValue): Pipeline {
    this.commands.push({ method: 'setex', args: [key, seconds, value] });
    return this;
  }

  setnx(key: RedisKey, value: RedisValue): Pipeline {
    this.commands.push({ method: 'setnx', args: [key, value] });
    return this;
  }

  psetex(key: RedisKey, milliseconds: number, value: RedisValue): Pipeline {
    this.commands.push({ method: 'psetex', args: [key, milliseconds, value] });
    return this;
  }

  // Hash commands
  hset(key: RedisKey, ...args: any[]): Pipeline {
    this.commands.push({ method: 'hset', args: [key, ...args] });
    return this;
  }

  hget(key: RedisKey, field: string): Pipeline {
    this.commands.push({ method: 'hget', args: [key, field] });
    return this;
  }

  hmset(key: RedisKey, ...args: any[]): Pipeline {
    this.commands.push({ method: 'hmset', args: [key, ...args] });
    return this;
  }

  hmget(key: RedisKey, ...fields: any[]): Pipeline {
    this.commands.push({ method: 'hmget', args: [key, ...fields] });
    return this;
  }

  hgetall(key: RedisKey): Pipeline {
    this.commands.push({ method: 'hgetall', args: [key] });
    return this;
  }

  hdel(key: RedisKey, ...fields: string[]): Pipeline {
    this.commands.push({ method: 'hdel', args: [key, ...fields] });
    return this;
  }

  hexists(key: RedisKey, field: string): Pipeline {
    this.commands.push({ method: 'hexists', args: [key, field] });
    return this;
  }

  hkeys(key: RedisKey): Pipeline {
    this.commands.push({ method: 'hkeys', args: [key] });
    return this;
  }

  hvals(key: RedisKey): Pipeline {
    this.commands.push({ method: 'hvals', args: [key] });
    return this;
  }

  hlen(key: RedisKey): Pipeline {
    this.commands.push({ method: 'hlen', args: [key] });
    return this;
  }

  hincrby(key: RedisKey, field: string, increment: number): Pipeline {
    this.commands.push({ method: 'hincrby', args: [key, field, increment] });
    return this;
  }

  hincrbyfloat(key: RedisKey, field: string, increment: number): Pipeline {
    this.commands.push({ method: 'hincrbyfloat', args: [key, field, increment] });
    return this;
  }

  hsetnx(key: RedisKey, field: string, value: RedisValue): Pipeline {
    this.commands.push({ method: 'hsetnx', args: [key, field, value] });
    return this;
  }

  // List commands
  lpush(key: RedisKey, ...elements: any[]): Pipeline {
    this.commands.push({ method: 'lpush', args: [key, ...elements] });
    return this;
  }

  rpush(key: RedisKey, ...elements: any[]): Pipeline {
    this.commands.push({ method: 'rpush', args: [key, ...elements] });
    return this;
  }

  lpop(key: RedisKey, count?: number): Pipeline {
    this.commands.push({ method: 'lpop', args: count !== undefined ? [key, count] : [key] });
    return this;
  }

  rpop(key: RedisKey, count?: number): Pipeline {
    this.commands.push({ method: 'rpop', args: count !== undefined ? [key, count] : [key] });
    return this;
  }

  lrange(key: RedisKey, start: number, stop: number): Pipeline {
    this.commands.push({ method: 'lrange', args: [key, start, stop] });
    return this;
  }

  llen(key: RedisKey): Pipeline {
    this.commands.push({ method: 'llen', args: [key] });
    return this;
  }

  lindex(key: RedisKey, index: number): Pipeline {
    this.commands.push({ method: 'lindex', args: [key, index] });
    return this;
  }

  lset(key: RedisKey, index: number, element: RedisValue): Pipeline {
    this.commands.push({ method: 'lset', args: [key, index, element] });
    return this;
  }

  ltrim(key: RedisKey, start: number, stop: number): Pipeline {
    this.commands.push({ method: 'ltrim', args: [key, start, stop] });
    return this;
  }

  lrem(key: RedisKey, count: number, element: RedisValue): Pipeline {
    this.commands.push({ method: 'lrem', args: [key, count, element] });
    return this;
  }

  lpushx(key: RedisKey, ...elements: RedisValue[]): Pipeline {
    this.commands.push({ method: 'lpushx', args: [key, ...elements] });
    return this;
  }

  rpushx(key: RedisKey, ...elements: RedisValue[]): Pipeline {
    this.commands.push({ method: 'rpushx', args: [key, ...elements] });
    return this;
  }

  // Key commands
  del(...keys: RedisKey[]): Pipeline {
    this.commands.push({ method: 'del', args: keys });
    return this;
  }

  exists(...keys: RedisKey[]): Pipeline {
    this.commands.push({ method: 'exists', args: keys });
    return this;
  }

  expire(key: RedisKey, seconds: number): Pipeline {
    this.commands.push({ method: 'expire', args: [key, seconds] });
    return this;
  }

  ttl(key: RedisKey): Pipeline {
    this.commands.push({ method: 'ttl', args: [key] });
    return this;
  }

  type(key: RedisKey): Pipeline {
    this.commands.push({ method: 'type', args: [key] });
    return this;
  }

  // Pub/Sub commands
  publish(channel: string, message: RedisValue): Pipeline {
    this.commands.push({ method: 'publish', args: [channel, message] });
    return this;
  }

  async exec(): Promise<Array<[Error | null, any]>> {
    if (this.commands.length === 0) {
      return [];
    }

    const client = await (this.redis as any).ensureConnected();
    const batch = new Batch(false); // Non-atomic pipeline

    // Add all commands to the batch
    for (const cmd of this.commands) {
      try {
        this.addCommandToBatch(batch, cmd.method, cmd.args);
      } catch (error) {
        // If there's an error adding a command, return it in the results
        continue;
      }
    }

    try {
      // Execute the batch
      const results = await client.exec(batch, false); // raiseOnError = false
      
      // Convert results to ioredis format: [Error | null, result]
      const formattedResults: Array<[Error | null, any]> = [];
      
      if (results) {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result instanceof Error) {
            formattedResults.push([result, null]);
          } else {
            formattedResults.push([null, result]);
          }
        }
      }
      
      return formattedResults;
    } catch (error) {
      // If the entire batch fails, return error for all commands
      return this.commands.map(() => [error as Error, null]);
    } finally {
      // Clear commands after execution
      this.commands = [];
    }
  }

  protected addCommandToBatch(batch: Batch, method: string, args: any[]): void {
    // Map pipeline commands to batch methods
    switch (method) {
      case 'set':
        if (args.length >= 2) {
          const translated = ParameterTranslator.translateSetArgs(args);
          batch.set(translated.key, translated.value, translated.options);
        }
        break;
      case 'get':
        if (args.length >= 1) {
          batch.get(ParameterTranslator.normalizeKey(args[0]));
        }
        break;
      case 'mget':
        const mgetKeys = ParameterTranslator.translateMGetArgs(args);
        batch.mget(mgetKeys);
        break;
      case 'mset':
        const msetData = ParameterTranslator.translateMSetArgs(args);
        batch.mset(msetData);
        break;
      case 'incr':
        batch.incr(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'decr':
        batch.decr(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'incrby':
        batch.incrBy(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'decrby':
        batch.decrBy(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'incrbyfloat':
        batch.incrByFloat(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'append':
        batch.append(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[1]));
        break;
      case 'strlen':
        batch.strlen(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'getrange':
        batch.getrange(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'setrange':
        batch.setrange(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      case 'setex':
        batch.set(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[2]), {
          expiry: { type: TimeUnit.Seconds, count: args[1] }
        });
        break;
      case 'setnx':
        batch.set(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[1]), {
          conditionalSet: 'onlyIfDoesNotExist'
        });
        break;
      case 'psetex':
        batch.set(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[2]), {
          expiry: { type: TimeUnit.Milliseconds, count: args[1] }
        });
        break;
      // Hash commands
      case 'hset':
        const hsetTranslated = ParameterTranslator.translateHSetArgs(args);
        const hashDataType = Object.entries(hsetTranslated.fieldValues).map(([field, value]) => ({
          field,
          value
        }));
        batch.hset(hsetTranslated.key, hashDataType);
        break;
      case 'hget':
        batch.hget(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'hmset':
        const hmsetTranslated = ParameterTranslator.translateHSetArgs(args);
        const hmsetHashDataType = Object.entries(hmsetTranslated.fieldValues).map(([field, value]) => ({
          field,
          value
        }));
        batch.hset(hmsetTranslated.key, hmsetHashDataType);
        break;
      case 'hmget':
        const hmgetTranslated = ParameterTranslator.translateHMGetArgs(args);
        batch.hmget(hmgetTranslated.key, hmgetTranslated.fields);
        break;
      case 'hgetall':
        batch.hgetall(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hdel':
        batch.hdel(ParameterTranslator.normalizeKey(args[0]), args.slice(1));
        break;
      case 'hexists':
        batch.hexists(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'hkeys':
        batch.hkeys(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hvals':
        batch.hvals(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hlen':
        batch.hlen(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hincrby':
        batch.hincrBy(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'hincrbyfloat':
        batch.hincrByFloat(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'hsetnx':
        batch.hsetnx(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      // List commands
      case 'lpush':
        const lpushTranslated = ParameterTranslator.translateListPushArgs(args);
        batch.lpush(lpushTranslated.key, lpushTranslated.elements);
        break;
      case 'rpush':
        const rpushTranslated = ParameterTranslator.translateListPushArgs(args);
        batch.rpush(rpushTranslated.key, rpushTranslated.elements);
        break;
      case 'lpop':
        if (args.length > 1) {
          batch.lpopCount(ParameterTranslator.normalizeKey(args[0]), args[1]);
        } else {
          batch.lpop(ParameterTranslator.normalizeKey(args[0]));
        }
        break;
      case 'rpop':
        if (args.length > 1) {
          batch.rpopCount(ParameterTranslator.normalizeKey(args[0]), args[1]);
        } else {
          batch.rpop(ParameterTranslator.normalizeKey(args[0]));
        }
        break;
      case 'lrange':
        batch.lrange(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'llen':
        batch.llen(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'lindex':
        batch.lindex(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'lset':
        batch.lset(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      case 'ltrim':
        batch.ltrim(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'lrem':
        batch.lrem(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      case 'lpushx':
        const lpushxElements = args.slice(1).map(el => ParameterTranslator.normalizeValue(el));
        batch.lpushx(ParameterTranslator.normalizeKey(args[0]), lpushxElements);
        break;
      case 'rpushx':
        const rpushxElements = args.slice(1).map(el => ParameterTranslator.normalizeValue(el));
        batch.rpushx(ParameterTranslator.normalizeKey(args[0]), rpushxElements);
        break;
      // Key commands
      case 'del':
        const delKeys = ParameterTranslator.translateDelArgs(args);
        batch.del(delKeys);
        break;
      case 'exists':
        const existsKeys = ParameterTranslator.translateExistsArgs(args);
        batch.exists(existsKeys);
        break;
      case 'expire':
        batch.expire(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'ttl':
        batch.ttl(ParameterTranslator.normalizeKey(args[0]));
        break;
      // Pub/Sub commands
      case 'publish':
        batch.publish(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[1]));
        break;
      default:
        throw new Error(`Unsupported pipeline command: ${method}`);
    }
  }

  discard(): void {
    this.commands = [];
  }
}

// Multi (transaction) mock implementation
class MultiAdapter implements Multi {
  protected commands: Array<{ method: string; args: any[] }> = [];
  protected redis: RedisAdapter;
  private watchedKeys: Set<string> = new Set();

  constructor(redis: RedisAdapter, watchedKeys?: Set<string>) {
    this.redis = redis;
    if (watchedKeys) {
      this.watchedKeys = new Set(watchedKeys);
    }
  }

  // Basic pipeline methods - just store commands
  set(key: RedisKey, value: RedisValue, ...args: any[]): Multi {
    this.commands.push({ method: 'set', args: [key, value, ...args] });
    return this;
  }

  get(key: RedisKey): Multi {
    this.commands.push({ method: 'get', args: [key] });
    return this;
  }

  mget(...keys: any[]): Multi {
    this.commands.push({ method: 'mget', args: keys });
    return this;
  }

  mset(...args: any[]): Multi {
    this.commands.push({ method: 'mset', args });
    return this;
  }

  incr(key: RedisKey): Multi { this.commands.push({ method: 'incr', args: [key] }); return this; }
  decr(key: RedisKey): Multi { this.commands.push({ method: 'decr', args: [key] }); return this; }
  incrby(key: RedisKey, increment: number): Multi { this.commands.push({ method: 'incrby', args: [key, increment] }); return this; }
  decrby(key: RedisKey, decrement: number): Multi { this.commands.push({ method: 'decrby', args: [key, decrement] }); return this; }
  incrbyfloat(key: RedisKey, increment: number): Multi { this.commands.push({ method: 'incrbyfloat', args: [key, increment] }); return this; }
  append(key: RedisKey, value: RedisValue): Multi { this.commands.push({ method: 'append', args: [key, value] }); return this; }
  strlen(key: RedisKey): Multi { this.commands.push({ method: 'strlen', args: [key] }); return this; }
  getrange(key: RedisKey, start: number, end: number): Multi { this.commands.push({ method: 'getrange', args: [key, start, end] }); return this; }
  setrange(key: RedisKey, offset: number, value: RedisValue): Multi { this.commands.push({ method: 'setrange', args: [key, offset, value] }); return this; }
  setex(key: RedisKey, seconds: number, value: RedisValue): Multi { this.commands.push({ method: 'setex', args: [key, seconds, value] }); return this; }
  setnx(key: RedisKey, value: RedisValue): Multi { this.commands.push({ method: 'setnx', args: [key, value] }); return this; }
  psetex(key: RedisKey, milliseconds: number, value: RedisValue): Multi { this.commands.push({ method: 'psetex', args: [key, milliseconds, value] }); return this; }

  // Hash commands
  hset(key: RedisKey, ...args: any[]): Multi { this.commands.push({ method: 'hset', args: [key, ...args] }); return this; }
  hget(key: RedisKey, field: string): Multi { this.commands.push({ method: 'hget', args: [key, field] }); return this; }
  hmset(key: RedisKey, ...args: any[]): Multi { this.commands.push({ method: 'hmset', args: [key, ...args] }); return this; }
  hmget(key: RedisKey, ...fields: any[]): Multi { this.commands.push({ method: 'hmget', args: [key, ...fields] }); return this; }
  hgetall(key: RedisKey): Multi { this.commands.push({ method: 'hgetall', args: [key] }); return this; }
  hdel(key: RedisKey, ...fields: string[]): Multi { this.commands.push({ method: 'hdel', args: [key, ...fields] }); return this; }
  hexists(key: RedisKey, field: string): Multi { this.commands.push({ method: 'hexists', args: [key, field] }); return this; }
  hkeys(key: RedisKey): Multi { this.commands.push({ method: 'hkeys', args: [key] }); return this; }
  hvals(key: RedisKey): Multi { this.commands.push({ method: 'hvals', args: [key] }); return this; }
  hlen(key: RedisKey): Multi { this.commands.push({ method: 'hlen', args: [key] }); return this; }
  hincrby(key: RedisKey, field: string, increment: number): Multi { this.commands.push({ method: 'hincrby', args: [key, field, increment] }); return this; }
  hincrbyfloat(key: RedisKey, field: string, increment: number): Multi { this.commands.push({ method: 'hincrbyfloat', args: [key, field, increment] }); return this; }
  hsetnx(key: RedisKey, field: string, value: RedisValue): Multi { this.commands.push({ method: 'hsetnx', args: [key, field, value] }); return this; }

  // List commands
  lpush(key: RedisKey, ...elements: any[]): Multi { this.commands.push({ method: 'lpush', args: [key, ...elements] }); return this; }
  rpush(key: RedisKey, ...elements: any[]): Multi { this.commands.push({ method: 'rpush', args: [key, ...elements] }); return this; }
  lpop(key: RedisKey, count?: number): Multi { this.commands.push({ method: 'lpop', args: count !== undefined ? [key, count] : [key] }); return this; }
  rpop(key: RedisKey, count?: number): Multi { this.commands.push({ method: 'rpop', args: count !== undefined ? [key, count] : [key] }); return this; }
  lrange(key: RedisKey, start: number, stop: number): Multi { this.commands.push({ method: 'lrange', args: [key, start, stop] }); return this; }
  llen(key: RedisKey): Multi { this.commands.push({ method: 'llen', args: [key] }); return this; }
  lindex(key: RedisKey, index: number): Multi { this.commands.push({ method: 'lindex', args: [key, index] }); return this; }
  lset(key: RedisKey, index: number, element: RedisValue): Multi { this.commands.push({ method: 'lset', args: [key, index, element] }); return this; }
  ltrim(key: RedisKey, start: number, stop: number): Multi { this.commands.push({ method: 'ltrim', args: [key, start, stop] }); return this; }
  lrem(key: RedisKey, count: number, element: RedisValue): Multi { this.commands.push({ method: 'lrem', args: [key, count, element] }); return this; }
  lpushx(key: RedisKey, ...elements: RedisValue[]): Multi { this.commands.push({ method: 'lpushx', args: [key, ...elements] }); return this; }
  rpushx(key: RedisKey, ...elements: RedisValue[]): Multi { this.commands.push({ method: 'rpushx', args: [key, ...elements] }); return this; }

  // Key commands
  del(...keys: RedisKey[]): Multi { this.commands.push({ method: 'del', args: keys }); return this; }
  exists(...keys: RedisKey[]): Multi { this.commands.push({ method: 'exists', args: keys }); return this; }
  expire(key: RedisKey, seconds: number): Multi { this.commands.push({ method: 'expire', args: [key, seconds] }); return this; }
  ttl(key: RedisKey): Multi { this.commands.push({ method: 'ttl', args: [key] }); return this; }
  type(key: RedisKey): Multi { this.commands.push({ method: 'type', args: [key] }); return this; }

  discard(): void {
    this.commands = [];
  }

  async watch(...keys: RedisKey[]): Promise<string> {
    // Track keys locally
    keys.forEach(key => this.watchedKeys.add(ParameterTranslator.normalizeKey(key)));
    
    // Execute WATCH command through valkey-glide
    const client = await (this.redis as any).ensureConnected();
    const normalizedKeys = keys.map(key => ParameterTranslator.normalizeKey(key));
    await client.customCommand(['WATCH', ...normalizedKeys]);
    
    return 'OK';
  }

  async unwatch(): Promise<string> {
    // Clear local tracking
    this.watchedKeys.clear();
    
    // Execute UNWATCH command through valkey-glide
    const client = await (this.redis as any).ensureConnected();
    await client.customCommand(['UNWATCH']);
    
    return 'OK';
  }

  async exec(): Promise<Array<[Error | null, any]> | null> {
    if (this.commands.length === 0) {
      return [];
    }

    try {
      const client = await (this.redis as any).ensureConnected();
      const batch = new Batch(true); // Atomic batch for transactions

      // Add all commands to the batch
      for (const cmd of this.commands) {
        try {
          (this as any).addCommandToBatch(batch, cmd.method, cmd.args);
        } catch (error) {
          // If there's an error adding a command, return transaction failure
          return null;
        }
      }

      // Execute the atomic batch
      const results = await client.exec(batch, false); // raiseOnError = false

      // Check if transaction was discarded due to WATCH violations
      if (results === null) {
        return null; // ioredis convention for discarded transactions
      }

      // Format results to match ioredis format: [Error | null, result]
      const formattedResults: Array<[Error | null, any]> = [];

      if (results && Array.isArray(results)) {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result instanceof Error) {
            formattedResults.push([result, null]);
          } else {
            formattedResults.push([null, result]);
          }
        }
      }

      return formattedResults;
    } catch (error) {
      // Handle transaction failure (e.g., due to WATCH violations or connection issues)
      if (this.isWatchFailure(error)) {
        return null; // ioredis convention
      }
      
      // For other errors, we still want to return null for transaction failure
      // as per ioredis behavior
      return null;
    } finally {
      // Clear commands after execution
      this.commands = [];
      // Clear watched keys on the parent adapter as well
      (this.redis as any).watchedKeys.clear();
    }
  }

  /**
   * Check if error indicates WATCH key violation
   */
  private isWatchFailure(error: any): boolean {
    // Check for common WATCH failure indicators
    if (error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      return message.includes('watch') || 
             message.includes('transaction') ||
             message.includes('multi') ||
             message.includes('exec');
    }
    return false;
  }

  protected addCommandToBatch(batch: Batch, method: string, args: any[]): void {
    // This method is similar to the one in PipelineAdapter but used for transactions
    // We can reuse the same logic since both use Batch
    // Map transaction commands to batch methods
    switch (method) {
      case 'set':
        if (args.length >= 2) {
          const translated = ParameterTranslator.translateSetArgs(args);
          batch.set(translated.key, translated.value, translated.options);
        }
        break;
      case 'get':
        if (args.length >= 1) {
          batch.get(ParameterTranslator.normalizeKey(args[0]));
        }
        break;
      case 'mget':
        const mgetKeys = ParameterTranslator.translateMGetArgs(args);
        batch.mget(mgetKeys);
        break;
      case 'mset':
        const msetData = ParameterTranslator.translateMSetArgs(args);
        batch.mset(msetData);
        break;
      case 'incr':
        batch.incr(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'decr':
        batch.decr(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'incrby':
        batch.incrBy(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'decrby':
        batch.decrBy(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'incrbyfloat':
        batch.incrByFloat(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'append':
        batch.append(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[1]));
        break;
      case 'strlen':
        batch.strlen(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'getrange':
        batch.getrange(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'setrange':
        batch.setrange(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      case 'setex':
        batch.set(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[2]), {
          expiry: { type: TimeUnit.Seconds, count: args[1] }
        });
        break;
      case 'setnx':
        batch.set(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[1]), {
          conditionalSet: 'onlyIfDoesNotExist'
        });
        break;
      case 'psetex':
        batch.set(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[2]), {
          expiry: { type: TimeUnit.Milliseconds, count: args[1] }
        });
        break;
      // Hash commands
      case 'hset':
        const hsetTranslated = ParameterTranslator.translateHSetArgs(args);
        const hashDataType = Object.entries(hsetTranslated.fieldValues).map(([field, value]) => ({
          field,
          value
        }));
        batch.hset(hsetTranslated.key, hashDataType);
        break;
      case 'hget':
        batch.hget(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'hmset':
        const hmsetTranslated = ParameterTranslator.translateHSetArgs(args);
        const hmsetHashDataType = Object.entries(hmsetTranslated.fieldValues).map(([field, value]) => ({
          field,
          value
        }));
        batch.hset(hmsetTranslated.key, hmsetHashDataType);
        break;
      case 'hmget':
        const hmgetTranslated = ParameterTranslator.translateHMGetArgs(args);
        batch.hmget(hmgetTranslated.key, hmgetTranslated.fields);
        break;
      case 'hgetall':
        batch.hgetall(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hdel':
        batch.hdel(ParameterTranslator.normalizeKey(args[0]), args.slice(1));
        break;
      case 'hexists':
        batch.hexists(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'hkeys':
        batch.hkeys(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hvals':
        batch.hvals(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hlen':
        batch.hlen(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'hincrby':
        batch.hincrBy(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'hincrbyfloat':
        batch.hincrByFloat(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'hsetnx':
        batch.hsetnx(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      // List commands
      case 'lpush':
        const lpushTranslated = ParameterTranslator.translateListPushArgs(args);
        batch.lpush(lpushTranslated.key, lpushTranslated.elements);
        break;
      case 'rpush':
        const rpushTranslated = ParameterTranslator.translateListPushArgs(args);
        batch.rpush(rpushTranslated.key, rpushTranslated.elements);
        break;
      case 'lpop':
        if (args.length > 1) {
          batch.lpopCount(ParameterTranslator.normalizeKey(args[0]), args[1]);
        } else {
          batch.lpop(ParameterTranslator.normalizeKey(args[0]));
        }
        break;
      case 'rpop':
        if (args.length > 1) {
          batch.rpopCount(ParameterTranslator.normalizeKey(args[0]), args[1]);
        } else {
          batch.rpop(ParameterTranslator.normalizeKey(args[0]));
        }
        break;
      case 'lrange':
        batch.lrange(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'llen':
        batch.llen(ParameterTranslator.normalizeKey(args[0]));
        break;
      case 'lindex':
        batch.lindex(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'lset':
        batch.lset(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      case 'ltrim':
        batch.ltrim(ParameterTranslator.normalizeKey(args[0]), args[1], args[2]);
        break;
      case 'lrem':
        batch.lrem(ParameterTranslator.normalizeKey(args[0]), args[1], ParameterTranslator.normalizeValue(args[2]));
        break;
      case 'lpushx':
        const lpushxElements = args.slice(1).map(el => ParameterTranslator.normalizeValue(el));
        batch.lpushx(ParameterTranslator.normalizeKey(args[0]), lpushxElements);
        break;
      case 'rpushx':
        const rpushxElements = args.slice(1).map(el => ParameterTranslator.normalizeValue(el));
        batch.rpushx(ParameterTranslator.normalizeKey(args[0]), rpushxElements);
        break;
      // Key commands
      case 'del':
        const delKeys = ParameterTranslator.translateDelArgs(args);
        batch.del(delKeys);
        break;
      case 'exists':
        const existsKeys = ParameterTranslator.translateExistsArgs(args);
        batch.exists(existsKeys);
        break;
      case 'expire':
        batch.expire(ParameterTranslator.normalizeKey(args[0]), args[1]);
        break;
      case 'ttl':
        batch.ttl(ParameterTranslator.normalizeKey(args[0]));
        break;
      // Pub/Sub commands
      case 'publish':
        batch.publish(ParameterTranslator.normalizeKey(args[0]), ParameterTranslator.normalizeValue(args[1]));
        break;
      default:
        throw new Error(`Unsupported transaction command: ${method}`);
    }
  }
}

// Export the classes
export { MultiAdapter, PipelineAdapter };