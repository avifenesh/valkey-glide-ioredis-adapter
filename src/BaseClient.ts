/**
 * BaseClient - Complete key-value database API implementation
 * Base class for both standalone and cluster clients
 * Database-agnostic internally, ioredis-compatible externally
 * Uses Valkey GLIDE for all operations
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';
import { RedisOptions, RedisKey, RedisValue, Multi, Pipeline } from './types';
import { ParameterTranslator } from './utils/ParameterTranslator';
import { TimeUnit, SetOptions } from '@valkey/valkey-glide';
import { IoredisPubSubClient } from './utils/IoredisPubSubClient';

export type GlideClientType = GlideClient | GlideClusterClient;

// Direct GLIDE Pub/Sub Interface (Resilient Architecture)
export interface DirectPubSubMessage {
  channel: string;
  message: string;
  pattern?: string;
}

export interface DirectGlidePubSubInterface {
  // Subscribe with direct callback (resilient GLIDE architecture)
  subscribe(
    channels: string[],
    callback: (message: DirectPubSubMessage) => void
  ): Promise<number>;
  psubscribe(
    patterns: string[],
    callback: (message: DirectPubSubMessage) => void
  ): Promise<number>;
  ssubscribe?(
    channels: string[],
    callback: (message: DirectPubSubMessage) => void
  ): Promise<number>; // Cluster only

  // Unsubscribe (affects callback-based subscriptions)
  unsubscribe(...channels: string[]): Promise<number>;
  punsubscribe(...patterns: string[]): Promise<number>;
  sunsubscribe?(...channels: string[]): Promise<number>; // Cluster only

  // Publishing
  publish(
    channel: string,
    message: string | Buffer,
    sharded?: boolean
  ): Promise<number>;

  // Status
  getStatus(): {
    subscribedChannels: string[];
    subscribedPatterns: string[];
    subscribedShardedChannels?: string[];
  };
}

export abstract class BaseClient extends EventEmitter {
  protected glideClient: GlideClientType | null = null;
  protected subscriberClient: GlideClientType | null = null;
  protected ioredisCompatiblePubSub: IoredisPubSubClient | null = null;
  protected connectionStatus: string = 'disconnected';
  protected options: RedisOptions;

  // ioredis compatibility properties
  public blocked: boolean = false;

  // Socket.IO compatibility: duplicate() method for separate pub/sub clients
  duplicate(): BaseClient {
    // Create new instance with same options
    const duplicateClient = Object.create(Object.getPrototypeOf(this));
    duplicateClient.options = { ...this.options };
    duplicateClient.connectionStatus = 'disconnected';
    duplicateClient.glideClient = null;
    duplicateClient.subscriberClient = null;
    duplicateClient.ioredisCompatiblePubSub = null;
    duplicateClient.blocked = false;
    duplicateClient._status = undefined;

    // Initialize EventEmitter
    EventEmitter.call(duplicateClient);

    return duplicateClient;
  }

  // Pub/Sub state management - Event-based Compatible Architecture
  protected subscribedChannels = new Set<string>();
  protected subscribedPatterns = new Set<string>();
  protected subscribedShardedChannels = new Set<string>(); // Only used by cluster clients
  protected isInSubscriberMode = false;

  // Event-based pub/sub state (for binary data compatibility)
  protected pollingActive = false;
  protected pollingPromise: Promise<void> | null = null;
  protected eventBasedSubscriber: GlideClientType | null = null;

  // Direct GLIDE Pub/Sub - Resilient Architecture
  public directPubSub: DirectGlidePubSubInterface;

  constructor(options: RedisOptions = {}) {
    super();
    this.options = {
      host: 'localhost',
      port: 6379,
      lazyConnect: false, // Default to immediate connection like ioredis
      ...options,
    };

    // ioredis compatibility - expose options as _options
    (this as any)._options = this.options;

    // Initialize Direct GLIDE Pub/Sub (Resilient Architecture)
    this.directPubSub = new DirectGlidePubSub(this);

    // GLIDE by default is NOT lazy - it connects immediately
    // Only trigger connection if NOT lazy (ioredis compatibility)
    if (!this.options.lazyConnect) {
      // Use nextTick to avoid blocking constructor while maintaining immediate connection expectation
      process.nextTick(() => {
        this.connect().catch(error => {
          this.emit('error', error);
        });
      });
    }
  }

  // Abstract method for subclasses to implement their specific GLIDE client creation
  protected abstract createClient(): Promise<GlideClientType>;
  protected abstract createSubscriberClient(): Promise<GlideClientType>;

  // Connection Management
  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') return;

    this.connectionStatus = 'connecting';
    this.emit('connecting');

    try {
      this.glideClient = await this.createClient();
      this.connectionStatus = 'connected';
      this.emit('connect');
      this.emit('ready');
    } catch (error) {
      this.connectionStatus = 'disconnected';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Internal cleanup helper - closes all connections and clears resources
   */
  private cleanupConnections(): void {
    // Close main GLIDE client
    if (this.glideClient) {
      try {
        this.glideClient.close();
      } catch (error) {
        // Ignore errors when closing - connection might already be closed
      }
      this.glideClient = null;
    }

    // Close subscriber client
    if (this.subscriberClient) {
      try {
        this.subscriberClient.close();
      } catch (error) {
        // Ignore errors when closing - connection might already be closed
      }
      this.subscriberClient = null;
    }

    // Clean up ioredis-compatible pub/sub client
    if (this.ioredisCompatiblePubSub) {
      this.ioredisCompatiblePubSub.disconnect();
      this.ioredisCompatiblePubSub = null;
    }
  }

  async disconnect(): Promise<void> {
    if (
      this.connectionStatus === 'end' ||
      this.connectionStatus === 'disconnected'
    )
      return;

    this.connectionStatus = 'disconnecting';
    this.emit('close');

    // Clean up all connections
    this.cleanupConnections();

    // Set final status and emit end event
    this.connectionStatus = 'end';
    this.emit('end');
  }

  async quit(): Promise<void> {
    // quit() is permanent termination - same as disconnect() in our implementation
    if (this.connectionStatus === 'end') return;

    this.connectionStatus = 'disconnecting';
    this.emit('close');

    // Clean up all connections
    this.cleanupConnections();

    // Set final status and emit end event
    this.connectionStatus = 'end';
    this.emit('end');
  }

  async close(): Promise<void> {
    // close() is an alias for disconnect() - allows reconnection
    await this.disconnect();
  }

  async waitUntilReady(): Promise<GlideClientType> {
    if (this.connectionStatus === 'connected' && this.glideClient) {
      return this.glideClient;
    }

    if (this.connectionStatus === 'disconnected') {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (this.glideClient && this.connectionStatus === 'connected') {
        resolve(this.glideClient);
        return;
      }

      const onReady = () => {
        this.removeListener('error', onError);
        resolve(this.glideClient!);
      };

      const onError = (error: Error) => {
        this.removeListener('ready', onReady);
        reject(error);
      };

      this.once('ready', onReady);
      this.once('error', onError);
    });
  }

  protected async ensureConnected(): Promise<GlideClientType> {
    if (!this.glideClient || this.connectionStatus !== 'connected') {
      await this.connect();
    }
    return this.glideClient!;
  }

  // ioredis compatibility properties
  private _status?: string; // Allow BullMQ to override status

  // Map internal connection status to ioredis compatible values
  private mapToIoredisStatus(internalStatus: string): string {
    switch (internalStatus) {
      case 'connecting':
        return 'connecting';
      case 'connected':
        return 'ready';
      case 'disconnecting':
        return 'close';
      case 'disconnected':
        return 'disconnected';
      case 'end':
        return 'end';
      case 'wait':
        return 'wait';
      default:
        return internalStatus;
    }
  }

  get status(): string {
    return this._status || this.mapToIoredisStatus(this.connectionStatus);
  }

  set status(value: string) {
    // Allow BullMQ and other libraries to set the status property
    // This is essential for BullMQ compatibility during connection cleanup
    this._status = value;
  }

  get ready(): boolean {
    return this.connectionStatus === 'connected';
  }

  get isCluster(): boolean {
    return false; // Override in ClusterClient
  }

  // Dynamic Lua script registration (critical for BullMQ)
  defineCommand(
    name: string,
    options: { lua: string; numberOfKeys?: number }
  ): void {
    const { lua, numberOfKeys = 0 } = options;

    const commandHandler = async (...args: any[]): Promise<any> => {
      const client = await this.ensureConnected();
      const numkeys = Number(numberOfKeys) || 0;

      // BullMQ calls with single array: client[commandName]([...args])
      // Need to handle both BullMQ pattern and regular ioredis pattern
      let allArgs: any[];
      if (args.length === 1 && Array.isArray(args[0])) {
        // BullMQ pattern: single array argument
        allArgs = args[0];
      } else {
        // Regular ioredis pattern: variadic arguments
        allArgs = args;
      }

      // Split into keys and args based on numberOfKeys (same as ioredis EVAL)
      const keys = allArgs.slice(0, numkeys);
      const scriptArgs = allArgs.slice(numkeys);

      // Normalize parameters for GLIDE - preserve Buffer data for msgpack
      const normalizedKeys = keys.map(k => {
        if (k === null || k === undefined) return '';
        // Keep Buffer as is - GLIDE will handle Buffer conversion
        if (k instanceof Buffer) return k;
        return String(k);
      });

      const normalizedArgs = scriptArgs.map(a => {
        if (a === null || a === undefined) return '';
        // Keep Buffer as is for msgpack - GLIDE handles Buffer conversion
        if (a instanceof Buffer) return a;
        if (typeof a === 'object') {
          // JSON stringify objects for compatibility with ioredis
          return JSON.stringify(a);
        }
        return String(a);
      });

      try {
        // Use GLIDE's invokeScript - it does support separate keys and args
        if ('invokeScript' in client) {
          const Script = require('@valkey/valkey-glide').Script;
          const script = new Script(lua);
          const result = await (client as any).invokeScript(script, {
            keys: normalizedKeys,
            args: normalizedArgs,
          });
          return result === null && lua.includes('return {}') ? [] : result;
        } else {
          // Fallback to EVAL command
          const commandArgs = [
            'EVAL',
            lua,
            numkeys.toString(),
            ...normalizedKeys,
            ...normalizedArgs,
          ];
          const result = await (client as any).customCommand(commandArgs);
          return result === null && lua.includes('return {}') ? [] : result;
        }
      } catch (error) {
        // If invokeScript fails, try EVAL fallback
        try {
          const commandArgs = [
            'EVAL',
            lua,
            numkeys.toString(),
            ...normalizedKeys,
            ...normalizedArgs,
          ];
          const result = await (client as any).customCommand(commandArgs);
          return result === null && lua.includes('return {}') ? [] : result;
        } catch (fallbackError) {
          // Script execution failed - throw the fallback error
          throw fallbackError;
        }
      }
    };

    // Register the command on this instance
    (this as any)[name] = commandHandler;
  }

  // Key scanning with stream interface (critical for BullMQ cleanup)
  scanStream(options: { match?: string; type?: string; count?: number } = {}) {
    const { Readable } = require('stream');

    class ScanStream extends Readable {
      public cursor: string = '0';
      public finished: boolean = false;
      public client: BaseClient;
      public options: any;

      constructor(client: BaseClient, options: any) {
        super({ objectMode: true });
        this.client = client;
        this.options = options;
      }

      async _read() {
        if (this.finished) {
          this.push(null);
          return;
        }

        try {
          const result = await this.client.scan(
            this.cursor,
            ...(this.options.match ? ['MATCH', this.options.match] : []),
            ...(this.options.count
              ? ['COUNT', this.options.count.toString()]
              : []),
            ...(this.options.type ? ['TYPE', this.options.type] : [])
          );

          const [newCursor, keys] = result;
          this.cursor = newCursor;

          if (newCursor === '0') {
            this.finished = true;
          }

          if (keys.length > 0) {
            this.push(keys);
          }

          if (this.finished) {
            this.push(null);
          }
        } catch (error) {
          this.emit('error', error);
        }
      }
    }

    return new ScanStream(this, options);
  }

  // ALL Database Commands - Complete Implementation

  // === String Commands ===
  async get(key: RedisKey): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.get(normalizedKey);
    return ParameterTranslator.convertGlideString(result);
  }

  async set(
    key: RedisKey,
    value: RedisValue,
    ...args: any[]
  ): Promise<string | null> {
    // Validate key is not empty (ioredis compatibility)
    if (key === '' || key === null || key === undefined) {
      throw new Error("ERR wrong number of arguments for 'set' command");
    }
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);

    // Handle additional arguments (EX, PX, EXAT, PXAT, NX, XX, KEEPTTL, GET, etc.)
    const options: SetOptions = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Handle object-based arguments (like from connect-redis)
      if (typeof arg === 'object' && arg !== null) {
        // Handle connect-redis style expiration object
        if (arg.expiration && typeof arg.expiration === 'object') {
          const exp = arg.expiration;
          if (exp.type === 'EX') {
            options.expiry = {
              type: TimeUnit.Seconds,
              count: Number(exp.value),
            };
          } else if (exp.type === 'PX') {
            options.expiry = {
              type: TimeUnit.Milliseconds,
              count: Number(exp.value),
            };
          } else if (exp.type === 'EXAT') {
            options.expiry = {
              type: TimeUnit.UnixSeconds,
              count: Number(exp.value),
            };
          } else if (exp.type === 'PXAT') {
            options.expiry = {
              type: TimeUnit.UnixMilliseconds,
              count: Number(exp.value),
            };
          }
        }

        // Handle direct object properties (like {EX: 60, NX: true})
        if (arg.EX !== undefined) {
          options.expiry = { type: TimeUnit.Seconds, count: Number(arg.EX) };
        } else if (arg.PX !== undefined) {
          options.expiry = {
            type: TimeUnit.Milliseconds,
            count: Number(arg.PX),
          };
        } else if (arg.EXAT !== undefined) {
          options.expiry = {
            type: TimeUnit.UnixSeconds,
            count: Number(arg.EXAT),
          };
        } else if (arg.PXAT !== undefined) {
          options.expiry = {
            type: TimeUnit.UnixMilliseconds,
            count: Number(arg.PXAT),
          };
        } else if (arg.KEEPTTL === true) {
          options.expiry = 'keepExisting';
        }

        if (arg.NX === true) options.conditionalSet = 'onlyIfDoesNotExist';
        if (arg.XX === true) options.conditionalSet = 'onlyIfExists';
        if (arg.GET === true) options.returnOldValue = true;

        continue; // Skip the i+=2 logic for object args
      }

      // Handle string-based arguments (traditional SET syntax)
      if (typeof arg === 'string') {
        const option = arg.toString().toUpperCase();

        // Options that take a value
        if (
          (option === 'EX' ||
            option === 'PX' ||
            option === 'EXAT' ||
            option === 'PXAT') &&
          i + 1 < args.length
        ) {
          const optionValue = args[i + 1];

          if (option === 'EX') {
            options.expiry = {
              type: TimeUnit.Seconds,
              count: Number(optionValue),
            };
          } else if (option === 'PX') {
            options.expiry = {
              type: TimeUnit.Milliseconds,
              count: Number(optionValue),
            };
          } else if (option === 'EXAT') {
            options.expiry = {
              type: TimeUnit.UnixSeconds,
              count: Number(optionValue),
            };
          } else if (option === 'PXAT') {
            options.expiry = {
              type: TimeUnit.UnixMilliseconds,
              count: Number(optionValue),
            };
          }
          i++; // Skip next arg since we consumed it
        }
        // Options that are flags
        else if (option === 'NX') {
          options.conditionalSet = 'onlyIfDoesNotExist';
        } else if (option === 'XX') {
          options.conditionalSet = 'onlyIfExists';
        } else if (option === 'KEEPTTL') {
          options.expiry = 'keepExisting';
        } else if (option === 'GET') {
          options.returnOldValue = true;
        }
      }
    }

    const result = await client.set(normalizedKey, normalizedValue, options);
    return result === 'OK' ? 'OK' : null;
  }

  async mget(...keysOrArray: any[]): Promise<(string | null)[]> {
    const client = await this.ensureConnected();
    const keys = Array.isArray(keysOrArray[0]) ? keysOrArray[0] : keysOrArray;
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    const results = await client.mget(normalizedKeys);
    return results.map(ParameterTranslator.convertGlideString);
  }

  async mset(...argsOrHash: any[]): Promise<string> {
    const client = await this.ensureConnected();

    // Parse key-value pairs
    const keyValuePairs: Record<string, string> = {};
    if (
      argsOrHash.length === 1 &&
      typeof argsOrHash[0] === 'object' &&
      !Array.isArray(argsOrHash[0])
    ) {
      // Object format: mset({ key1: value1, key2: value2 })
      const obj = argsOrHash[0];
      for (const [key, value] of Object.entries(obj)) {
        keyValuePairs[ParameterTranslator.normalizeKey(key)] =
          ParameterTranslator.normalizeValue(value as any);
      }
    } else {
      // Array format: mset(key1, value1, key2, value2, ...)
      for (let i = 0; i < argsOrHash.length; i += 2) {
        const key = ParameterTranslator.normalizeKey(argsOrHash[i]);
        const value = ParameterTranslator.normalizeValue(argsOrHash[i + 1]);
        keyValuePairs[key] = value;
      }
    }

    await client.mset(keyValuePairs);
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
    const result = await client.incrByFloat(normalizedKey, increment);
    return parseFloat(result.toString());
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

  async setrange(
    key: RedisKey,
    offset: number,
    value: RedisValue
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await client.setrange(normalizedKey, offset, normalizedValue);
  }

  async setex(
    key: RedisKey,
    seconds: number,
    value: RedisValue
  ): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await client.set(normalizedKey, normalizedValue, {
      expiry: { type: TimeUnit.Seconds, count: seconds },
    });
    return 'OK';
  }

  async setnx(key: RedisKey, value: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    const result = await client.set(normalizedKey, normalizedValue, {
      conditionalSet: 'onlyIfDoesNotExist',
    });
    return result === 'OK' ? 1 : 0;
  }

  async psetex(
    key: RedisKey,
    milliseconds: number,
    value: RedisValue
  ): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await client.set(normalizedKey, normalizedValue, {
      expiry: { type: TimeUnit.Milliseconds, count: milliseconds },
    });
    return 'OK';
  }

  // === Key Commands ===
  async del(...keys: RedisKey[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(k => ParameterTranslator.normalizeKey(k));
    const result = await client.del(normalizedKeys);
    return Number(result);
  }

  async exists(...keys: RedisKey[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(k => ParameterTranslator.normalizeKey(k));
    const result = await client.exists(normalizedKeys);
    return Number(result);
  }

  async persist(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.persist(normalizedKey);
    return result ? 1 : 0;
  }

  async type(key: RedisKey): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.type(normalizedKey);
  }

  // === Script Commands ===
  private scriptCache = new Map<string, { script: any; source: string }>();

  private generateScriptSHA1(script: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(script).digest('hex');
  }

  async eval(
    script: string,
    numKeys: number,
    ...keysAndArgs: any[]
  ): Promise<any> {
    const client = await this.ensureConnected();
    const { Script } = require('@valkey/valkey-glide');

    // Parse keys and arguments from the ioredis format
    const keys = keysAndArgs
      .slice(0, numKeys)
      .map(k => ParameterTranslator.normalizeKey(k as RedisKey));
    const args = keysAndArgs
      .slice(numKeys)
      .map(v => ParameterTranslator.normalizeValue(v as RedisValue));

    const glideScript = new Script(script);

    // Cache the script for potential evalsha usage
    const sha1 = this.generateScriptSHA1(script);
    this.scriptCache.set(sha1, { script: glideScript, source: script });

    return await client.invokeScript(glideScript, { keys, args });
  }

  async evalsha(
    sha1: string,
    numKeys: number,
    ...keysAndArgs: any[]
  ): Promise<any> {
    const client = await this.ensureConnected();

    // Parse keys and arguments from the ioredis format
    const keys = keysAndArgs
      .slice(0, numKeys)
      .map(k => ParameterTranslator.normalizeKey(k as RedisKey));
    const args = keysAndArgs
      .slice(numKeys)
      .map(v => ParameterTranslator.normalizeValue(v as RedisValue));

    // Check if we have the script cached
    if (this.scriptCache.has(sha1)) {
      const cached = this.scriptCache.get(sha1)!;
      return await client.invokeScript(cached.script, { keys, args });
    } else {
      // Script not found in cache - this should fail as expected
      throw new Error(`NOSCRIPT No matching script. Please use EVAL.`);
    }
  }

  async scriptLoad(script: string): Promise<string> {
    const { Script } = require('@valkey/valkey-glide');

    const sha1 = this.generateScriptSHA1(script);
    const glideScript = new Script(script);

    // Cache the script
    this.scriptCache.set(sha1, { script: glideScript, source: script });

    return sha1;
  }

  async expire(key: RedisKey, seconds: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.expire(normalizedKey, seconds);
    return result ? 1 : 0;
  }

  async pexpire(key: RedisKey, milliseconds: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.pexpire(normalizedKey, milliseconds);
    return result ? 1 : 0;
  }

  async ttl(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.ttl(normalizedKey);
    return Number(result);
  }

  async pttl(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.pttl(normalizedKey);
    return Number(result);
  }

  async scan(cursor: string, ...args: string[]): Promise<[string, string[]]> {
    const client = await this.ensureConnected();
    const scanArgs = [cursor, ...args];
    const result = await client.customCommand(['SCAN', ...scanArgs]);

    if (Array.isArray(result) && result.length === 2) {
      const [nextCursor, keys] = result;
      const cursorStr =
        ParameterTranslator.convertGlideString(nextCursor) || '0';
      const keyArray = Array.isArray(keys)
        ? keys.map(k => ParameterTranslator.convertGlideString(k) || '')
        : [];
      return [cursorStr, keyArray];
    }

    return ['0', []];
  }

  async hscan(
    key: RedisKey,
    cursor: string,
    ...args: string[]
  ): Promise<[string, string[]]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const scanArgs = [normalizedKey, cursor, ...args];
    const result = await client.customCommand(['HSCAN', ...scanArgs]);

    if (Array.isArray(result) && result.length === 2) {
      const [nextCursor, fields] = result;
      const cursorStr =
        ParameterTranslator.convertGlideString(nextCursor) || '0';
      const fieldArray = Array.isArray(fields)
        ? fields.map(f => ParameterTranslator.convertGlideString(f) || '')
        : [];
      return [cursorStr, fieldArray];
    }

    return ['0', []];
  }

  async sscan(
    key: RedisKey,
    cursor: string,
    ...args: string[]
  ): Promise<[string, string[]]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const scanArgs = [normalizedKey, cursor, ...args];
    const result = await client.customCommand(['SSCAN', ...scanArgs]);

    if (Array.isArray(result) && result.length === 2) {
      const [nextCursor, members] = result;
      const cursorStr =
        ParameterTranslator.convertGlideString(nextCursor) || '0';
      const memberArray = Array.isArray(members)
        ? members.map(m => ParameterTranslator.convertGlideString(m) || '')
        : [];
      return [cursorStr, memberArray];
    }

    return ['0', []];
  }

  async zscan(
    key: RedisKey,
    cursor: string,
    ...args: string[]
  ): Promise<[string, string[]]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const scanArgs = [normalizedKey, cursor, ...args];
    const result = await client.customCommand(['ZSCAN', ...scanArgs]);

    if (Array.isArray(result) && result.length === 2) {
      const [nextCursor, membersAndScores] = result;
      const cursorStr =
        ParameterTranslator.convertGlideString(nextCursor) || '0';
      const memberArray = Array.isArray(membersAndScores)
        ? membersAndScores.map(
            m => ParameterTranslator.convertGlideString(m) || ''
          )
        : [];
      return [cursorStr, memberArray];
    }

    return ['0', []];
  }

  // === Hash Commands ===
  async hget(key: RedisKey, field: string): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hget(normalizedKey, field);
    return ParameterTranslator.convertGlideString(result);
  }

  async hset(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Parse field-value pairs into Record format for GLIDE
    const fieldValuePairs: Record<string, string> = {};
    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0])
    ) {
      // Object format: hset(key, { field1: value1, field2: value2 })
      const obj = args[0];
      for (const [field, value] of Object.entries(obj)) {
        fieldValuePairs[field] = ParameterTranslator.normalizeValue(
          value as RedisValue
        );
      }
    } else {
      // Variadic format: hset(key, field1, value1, field2, value2, ...)
      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 < args.length) {
          const field = args[i].toString();
          const value = ParameterTranslator.normalizeValue(args[i + 1]);
          fieldValuePairs[field] = value;
        }
      }
    }

    return await client.hset(normalizedKey, fieldValuePairs);
  }

  async hgetall(key: RedisKey): Promise<Record<string, string>> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hgetall(normalizedKey);

    // GLIDE returns HashDataType: [{field: "f1", value: "v1"}, {field: "f2", value: "v2"}]
    if (Array.isArray(result)) {
      const converted: Record<string, string> = {};
      for (const item of result) {
        if (
          item &&
          typeof item === 'object' &&
          'field' in item &&
          'value' in item
        ) {
          const field =
            ParameterTranslator.convertGlideString(item.field) || '';
          const value =
            ParameterTranslator.convertGlideString(item.value) || '';
          converted[field] = value;
        }
      }
      return converted;
    }

    return {};
  }

  async hmset(key: RedisKey, ...args: any[]): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Parse field-value pairs into Record format for GLIDE
    const fieldValuePairs: Record<string, string> = {};
    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0])
    ) {
      // Object format: hmset(key, { field1: value1, field2: value2 })
      const obj = args[0];
      for (const [field, value] of Object.entries(obj)) {
        fieldValuePairs[field] = ParameterTranslator.normalizeValue(
          value as RedisValue
        );
      }
    } else {
      // Variadic format: hmset(key, field1, value1, field2, value2, ...)
      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 < args.length) {
          const field = args[i].toString();
          const value = ParameterTranslator.normalizeValue(args[i + 1]);
          fieldValuePairs[field] = value;
        }
      }
    }

    await client.hset(normalizedKey, fieldValuePairs);
    return 'OK';
  }

  async hmget(
    key: RedisKey,
    ...fieldsOrArray: any[]
  ): Promise<(string | null)[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const fields = Array.isArray(fieldsOrArray[0])
      ? fieldsOrArray[0]
      : fieldsOrArray;
    const results = await client.hmget(normalizedKey, fields);
    return results.map(ParameterTranslator.convertGlideString);
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
    const results = await client.hkeys(normalizedKey);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async hvals(key: RedisKey): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const results = await client.hvals(normalizedKey);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async hlen(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hlen(normalizedKey);
  }

  async hincrby(
    key: RedisKey,
    field: string,
    increment: number
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hincrBy(normalizedKey, field, increment);
  }

  async hincrbyfloat(
    key: RedisKey,
    field: string,
    increment: number
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hincrByFloat(normalizedKey, field, increment);
    return parseFloat(result.toString());
  }

  async hsetnx(
    key: RedisKey,
    field: string,
    value: RedisValue
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    const result = await client.hsetnx(normalizedKey, field, normalizedValue);
    return result ? 1 : 0;
  }

  // === ZSet Commands ===
  async zadd(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Parse score-member pairs
    const scoreMemberPairs: Record<string, number> = {};
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = ParameterTranslator.normalizeValue(args[i + 1]);
      scoreMemberPairs[member] = score;
    }

    return await client.zadd(normalizedKey, scoreMemberPairs);
  }

  async zrem(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
    return await client.zrem(normalizedKey, normalizedMembers);
  }

  async zcard(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.zcard(normalizedKey);
  }

  async zscore(key: RedisKey, member: RedisValue): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMember = ParameterTranslator.normalizeValue(member);
    const result = await client.zscore(normalizedKey, normalizedMember);

    if (result === null) return null;

    const scoreStr = result.toString();
    // Normalize infinity values to match ioredis format
    if (scoreStr === '-Infinity') return '-inf';
    if (scoreStr === 'Infinity') return 'inf';
    return scoreStr;
  }

  async zrank(key: RedisKey, member: RedisValue): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMember = ParameterTranslator.normalizeValue(member);
    return await client.zrank(normalizedKey, normalizedMember);
  }

  async zrevrank(key: RedisKey, member: RedisValue): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMember = ParameterTranslator.normalizeValue(member);
    return await client.zrevrank(normalizedKey, normalizedMember);
  }

  async zrange(
    key: RedisKey,
    start: number,
    stop: number,
    withScores?: boolean
  ): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const rangeQuery = {
      type: 'byIndex' as const,
      start,
      end: stop,
    };

    let result: any;
    if (withScores) {
      result = await client.zrangeWithScores(normalizedKey, rangeQuery);
      // GLIDE returns array of objects with {element, score} - convert to ioredis flat format
      const flattened: string[] = [];
      for (const item of result) {
        flattened.push(
          ParameterTranslator.convertGlideString(item.element) || ''
        );
        flattened.push(item.score.toString());
      }
      return flattened;
    } else {
      result = await client.zrange(normalizedKey, rangeQuery);
      return result.map(
        (item: any) => ParameterTranslator.convertGlideString(item) || ''
      );
    }
  }

  async zrevrange(
    key: RedisKey,
    start: number,
    stop: number,
    withScores?: boolean
  ): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const rangeQuery = {
      type: 'byIndex' as const,
      start,
      end: stop,
    };

    let result: any;
    if (withScores) {
      result = await client.zrangeWithScores(normalizedKey, rangeQuery, {
        reverse: true,
      });
    } else {
      result = await client.zrange(normalizedKey, rangeQuery, {
        reverse: true,
      });
    }

    return result.map(
      (item: any) => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async zrangebyscore(
    key: RedisKey,
    min: string | number,
    max: string | number,
    ...args: string[]
  ): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    try {
      // Parse min/max boundaries for native GLIDE zrange
      let minBoundary: any;
      if (typeof min === 'string') {
        if (min === '-inf' || min === '+inf') {
          minBoundary = { value: min as any, isInclusive: true };
        } else if (min.startsWith('(')) {
          const val = min.slice(1);
          if (val === '-inf' || val === '+inf') {
            minBoundary = { value: val as any, isInclusive: false };
          } else {
            minBoundary = { value: parseFloat(val), isInclusive: false };
          }
        } else {
          minBoundary = { value: parseFloat(min), isInclusive: true };
        }
      } else {
        minBoundary = { value: min, isInclusive: true };
      }

      let maxBoundary: any;
      if (typeof max === 'string') {
        if (max === '-inf' || max === '+inf') {
          maxBoundary = { value: max as any, isInclusive: true };
        } else if (max.startsWith('(')) {
          const val = max.slice(1);
          if (val === '-inf' || val === '+inf') {
            maxBoundary = { value: val as any, isInclusive: false };
          } else {
            maxBoundary = { value: parseFloat(val), isInclusive: false };
          }
        } else {
          maxBoundary = { value: parseFloat(max), isInclusive: true };
        }
      } else {
        maxBoundary = { value: max, isInclusive: true };
      }

      const rangeQuery: any = {
        type: 'byScore',
        start: minBoundary,
        end: maxBoundary,
      };

      // Handle LIMIT arguments
      for (let i = 0; i < args.length; i++) {
        const currentArg = args[i];
        if (
          currentArg &&
          currentArg.toString().toUpperCase() === 'LIMIT' &&
          i + 2 < args.length
        ) {
          const offsetArg = args[i + 1];
          const countArg = args[i + 2];
          if (offsetArg !== undefined && countArg !== undefined) {
            rangeQuery.limit = {
              offset: parseInt(offsetArg.toString()),
              count: parseInt(countArg.toString()),
            };
            break;
          }
        }
      }

      // Check if WITHSCORES is requested
      const withScores = args.some(arg => arg.toUpperCase() === 'WITHSCORES');

      // Use native GLIDE zrange method
      const result = withScores
        ? await client.zrangeWithScores(normalizedKey, rangeQuery)
        : await client.zrange(normalizedKey, rangeQuery);

      if (!Array.isArray(result)) {
        return [];
      }

      if (withScores) {
        // GLIDE returns [{element: 'key', score: 1}] format, convert to ['key', '1'] format
        const flattened: string[] = [];
        for (const item of result) {
          if (
            typeof item === 'object' &&
            item !== null &&
            'element' in item &&
            'score' in item
          ) {
            flattened.push(String(item.element), String(item.score));
          }
        }
        return flattened;
      }

      return result.map(
        (item: any) => ParameterTranslator.convertGlideString(item) || ''
      );
    } catch (error) {
      console.warn('zrangebyscore error:', error);
      return [];
    }
  }

  async zrevrangebyscore(
    key: RedisKey,
    max: string | number,
    min: string | number,
    ...args: string[]
  ): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    try {
      // Parse min/max boundaries for native GLIDE zrange
      let minBoundary: any;
      if (typeof min === 'string') {
        if (min === '-inf' || min === '+inf') {
          minBoundary = { value: min as any, isInclusive: true };
        } else if (min.startsWith('(')) {
          const val = min.slice(1);
          if (val === '-inf' || val === '+inf') {
            minBoundary = { value: val as any, isInclusive: false };
          } else {
            minBoundary = { value: parseFloat(val), isInclusive: false };
          }
        } else {
          minBoundary = { value: parseFloat(min), isInclusive: true };
        }
      } else {
        minBoundary = { value: min, isInclusive: true };
      }

      let maxBoundary: any;
      if (typeof max === 'string') {
        if (max === '-inf' || max === '+inf') {
          maxBoundary = { value: max as any, isInclusive: true };
        } else if (max.startsWith('(')) {
          const val = max.slice(1);
          if (val === '-inf' || val === '+inf') {
            maxBoundary = { value: val as any, isInclusive: false };
          } else {
            maxBoundary = { value: parseFloat(val), isInclusive: false };
          }
        } else {
          maxBoundary = { value: parseFloat(max), isInclusive: true };
        }
      } else {
        maxBoundary = { value: max, isInclusive: true };
      }

      const rangeQuery: any = {
        type: 'byScore',
        start: minBoundary,
        end: maxBoundary,
      };

      // Handle LIMIT arguments
      for (let i = 0; i < args.length; i++) {
        const currentArg = args[i];
        if (
          currentArg &&
          currentArg.toString().toUpperCase() === 'LIMIT' &&
          i + 2 < args.length
        ) {
          const offsetArg = args[i + 1];
          const countArg = args[i + 2];
          if (offsetArg !== undefined && countArg !== undefined) {
            rangeQuery.limit = {
              offset: parseInt(offsetArg.toString()),
              count: parseInt(countArg.toString()),
            };
            break;
          }
        }
      }

      // Check if WITHSCORES is requested
      const withScores = args.some(arg => arg.toUpperCase() === 'WITHSCORES');

      // Use native GLIDE zrange method without reverse option (then reverse manually)
      // Note: GLIDE's reverse option doesn't work correctly with byScore queries
      const result = withScores
        ? await client.zrangeWithScores(normalizedKey, rangeQuery)
        : await client.zrange(normalizedKey, rangeQuery);

      if (!Array.isArray(result)) {
        return [];
      }

      if (withScores) {
        // GLIDE returns [{element: 'key', score: 1}] format, convert to ['key', '1'] format
        const flattened: string[] = [];
        // For reverse, we need to reverse the result array first
        const reversedResult = [...result].reverse();
        for (const item of reversedResult) {
          if (
            typeof item === 'object' &&
            item !== null &&
            'element' in item &&
            'score' in item
          ) {
            flattened.push(String(item.element), String(item.score));
          }
        }
        return flattened;
      }

      // For non-WITHSCORES, just reverse the array
      const converted = result.map(
        (item: any) => ParameterTranslator.convertGlideString(item) || ''
      );
      return converted.reverse();
    } catch (error) {
      console.warn('zrevrangebyscore error:', error);
      return [];
    }
  }

  async zpopmin(key: RedisKey, count?: number): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    try {
      const options = count !== undefined ? { count } : undefined;
      const result = await client.zpopmin(normalizedKey, options);

      if (Array.isArray(result)) {
        // GLIDE returns [{element: string, score: number}, ...]
        const converted: string[] = [];
        for (const item of result) {
          if (
            item &&
            typeof item === 'object' &&
            'element' in item &&
            'score' in item
          ) {
            converted.push(
              ParameterTranslator.convertGlideString(item.element) || '',
              item.score.toString()
            );
          }
        }
        return converted;
      }

      return [];
    } catch (error) {
      console.warn('zpopmin error:', error);
      return [];
    }
  }

  async zpopmax(key: RedisKey, count?: number): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    try {
      const options = count !== undefined ? { count } : undefined;
      const result = await client.zpopmax(normalizedKey, options);

      if (Array.isArray(result)) {
        // GLIDE returns [{element: string, score: number}, ...]
        const converted: string[] = [];
        for (const item of result) {
          if (
            item &&
            typeof item === 'object' &&
            'element' in item &&
            'score' in item
          ) {
            converted.push(
              ParameterTranslator.convertGlideString(item.element) || '',
              item.score.toString()
            );
          }
        }
        return converted;
      }

      return [];
    } catch (error) {
      console.warn('zpopmax error:', error);
      return [];
    }
  }

  // BullMQ-critical blocking commands
  async bzpopmin(...args: any[]): Promise<[string, string, string] | null> {
    const client = await this.ensureConnected();
    let keys: RedisKey[];
    let timeout: number;

    // Handle parameter order: keys first, timeout last
    if (typeof args[args.length - 1] === 'number') {
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else {
      throw new Error('Invalid bzpopmin arguments: timeout must be provided');
    }

    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);

    // Use native GLIDE method instead of customCommand
    const result = await client.bzpopmin(normalizedKeys, timeout);

    if (Array.isArray(result) && result.length === 3) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || '',
        result[2].toString(), // Convert score number to string for ioredis compatibility
      ];
    }

    return null;
  }

  async bzpopmax(...args: any[]): Promise<[string, string, string] | null> {
    const client = await this.ensureConnected();
    let keys: RedisKey[];
    let timeout: number;

    // Handle parameter order: keys first, timeout last
    if (typeof args[args.length - 1] === 'number') {
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else {
      throw new Error('Invalid bzpopmax arguments: timeout must be provided');
    }

    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);

    // Use native GLIDE method instead of customCommand
    const result = await client.bzpopmax(normalizedKeys, timeout);

    if (Array.isArray(result) && result.length === 3) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || '',
        result[2].toString(), // Convert score number to string for ioredis compatibility
      ];
    }

    return null;
  }

  async zremrangebyscore(
    key: RedisKey,
    min: string | number,
    max: string | number
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Parse boundaries with proper infinity handling
    let minBoundary: any;
    if (typeof min === 'string') {
      if (min === '-inf' || min === '+inf') {
        minBoundary = { value: min as any, isInclusive: true };
      } else if (min.startsWith('(')) {
        const val = min.slice(1);
        if (val === '-inf' || val === '+inf') {
          minBoundary = { value: val as any, isInclusive: false };
        } else {
          minBoundary = { value: parseFloat(val), isInclusive: false };
        }
      } else {
        minBoundary = { value: parseFloat(min), isInclusive: true };
      }
    } else {
      minBoundary = { value: min, isInclusive: true };
    }

    let maxBoundary: any;
    if (typeof max === 'string') {
      if (max === '-inf' || max === '+inf') {
        maxBoundary = { value: max as any, isInclusive: true };
      } else if (max.startsWith('(')) {
        const val = max.slice(1);
        if (val === '-inf' || val === '+inf') {
          maxBoundary = { value: val as any, isInclusive: false };
        } else {
          maxBoundary = { value: parseFloat(val), isInclusive: false };
        }
      } else {
        maxBoundary = { value: parseFloat(max), isInclusive: true };
      }
    } else {
      maxBoundary = { value: max, isInclusive: true };
    }

    return await client.zremRangeByScore(
      normalizedKey,
      minBoundary,
      maxBoundary
    );
  }

  async zincrby(
    key: RedisKey,
    increment: number,
    member: RedisValue
  ): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMember = ParameterTranslator.normalizeValue(member);
    const result = await client.zincrby(
      normalizedKey,
      increment,
      normalizedMember
    );
    return result.toString();
  }

  // === Set Commands ===
  async sadd(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
    return await client.sadd(normalizedKey, normalizedMembers);
  }

  async srem(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
    return await client.srem(normalizedKey, normalizedMembers);
  }

  async scard(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.scard(normalizedKey);
  }

  async sismember(key: RedisKey, member: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedMember = ParameterTranslator.normalizeValue(member);
    const result = await client.sismember(normalizedKey, normalizedMember);
    return result ? 1 : 0;
  }

  async smembers(key: RedisKey): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.smembers(normalizedKey);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sinter(...keys: RedisKey[]): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    const result = await client.sinter(normalizedKeys);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sinterstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedDestination = ParameterTranslator.normalizeKey(destination);
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    return await client.sinterstore(normalizedDestination, normalizedKeys);
  }

  async sdiff(...keys: RedisKey[]): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    const result = await client.sdiff(normalizedKeys);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sdiffstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedDestination = ParameterTranslator.normalizeKey(destination);
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    return await client.sdiffstore(normalizedDestination, normalizedKeys);
  }

  async sunion(...keys: RedisKey[]): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    const result = await client.sunion(normalizedKeys);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sunionstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedDestination = ParameterTranslator.normalizeKey(destination);
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    return await client.sunionstore(normalizedDestination, normalizedKeys);
  }

  async spop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    if (count === undefined) {
      // Single member pop
      const result = await client.spop(normalizedKey);
      return result
        ? ParameterTranslator.convertGlideString(result) || null
        : null;
    } else {
      // Multiple members pop
      const result = await client.spopCount(normalizedKey, count);
      return Array.from(result).map(
        item => ParameterTranslator.convertGlideString(item) || ''
      );
    }
  }

  async srandmember(
    key: RedisKey,
    count?: number
  ): Promise<string | string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    if (count === undefined) {
      // Single member random
      const result = await client.srandmember(normalizedKey);
      return result
        ? ParameterTranslator.convertGlideString(result) || null
        : null;
    } else {
      // Multiple members random
      const result = await client.srandmemberCount(normalizedKey, count);
      return result.map(
        item => ParameterTranslator.convertGlideString(item) || ''
      );
    }
  }

  // === List Commands ===
  async lpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Handle both spread and array forms
    let values: RedisValue[];
    if (args.length === 1 && Array.isArray(args[0])) {
      values = args[0];
    } else {
      values = args;
    }

    const normalizedValues = values.map(ParameterTranslator.normalizeValue);
    return await client.lpush(normalizedKey, normalizedValues);
  }

  async rpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Handle both spread and array forms
    let values: RedisValue[];
    if (args.length === 1 && Array.isArray(args[0])) {
      values = args[0];
    } else {
      values = args;
    }

    const normalizedValues = values.map(ParameterTranslator.normalizeValue);
    return await client.rpush(normalizedKey, normalizedValues);
  }

  async lpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    if (count !== undefined) {
      const results = await client.lpopCount(normalizedKey, count);
      return results
        ? results.map(r => ParameterTranslator.convertGlideString(r) || '')
        : null;
    } else {
      const result = await client.lpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async rpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    if (count !== undefined) {
      const results = await client.rpopCount(normalizedKey, count);
      return results
        ? results.map(r => ParameterTranslator.convertGlideString(r) || '')
        : null;
    } else {
      const result = await client.rpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async llen(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.llen(normalizedKey);
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const results = await client.lrange(normalizedKey, start, stop);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async ltrim(key: RedisKey, start: number, stop: number): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    await client.ltrim(normalizedKey, start, stop);
    return 'OK';
  }

  async lindex(key: RedisKey, index: number): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.lindex(normalizedKey, index);
    return ParameterTranslator.convertGlideString(result);
  }

  async lset(key: RedisKey, index: number, value: RedisValue): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await client.lset(normalizedKey, index, normalizedValue);
    return 'OK';
  }

  async lrem(key: RedisKey, count: number, value: RedisValue): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await client.lrem(normalizedKey, count, normalizedValue);
  }

  async linsert(
    key: RedisKey,
    direction: 'BEFORE' | 'AFTER',
    pivot: RedisValue,
    element: RedisValue
  ): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedPivot = ParameterTranslator.normalizeValue(pivot);
    const normalizedElement = ParameterTranslator.normalizeValue(element);
    const insertPosition = direction === 'BEFORE' ? 'before' : 'after';
    return await client.linsert(
      normalizedKey,
      insertPosition as any,
      normalizedPivot,
      normalizedElement
    );
  }

  async rpoplpush(
    source: RedisKey,
    destination: RedisKey
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedSource = ParameterTranslator.normalizeKey(source);
    const normalizedDest = ParameterTranslator.normalizeKey(destination);
    const result = await client.customCommand([
      'RPOPLPUSH',
      normalizedSource,
      normalizedDest,
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  // Blocking operations - critical for queue systems
  async blpop(...args: any[]): Promise<[string, string] | null> {
    const client = await this.ensureConnected();

    let keys: RedisKey[];
    let timeout: number;

    // Handle both ioredis styles:
    // 1. blpop(timeout, ...keys) - original ioredis style
    // 2. blpop(...keys, timeout) - BullMQ style
    if (typeof args[args.length - 1] === 'number') {
      // BullMQ style: keys first, timeout last
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else if (typeof args[0] === 'number') {
      // Original ioredis style: timeout first, keys after
      timeout = args[0];
      keys = args.slice(1);
    } else {
      throw new Error('Invalid blpop arguments: timeout must be provided');
    }

    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);

    const result = await client.blpop(normalizedKeys, timeout);

    if (Array.isArray(result) && result.length === 2) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || '',
      ];
    }

    return null;
  }

  async brpop(...args: any[]): Promise<[string, string] | null> {
    const client = await this.ensureConnected();

    let keys: RedisKey[];
    let timeout: number;

    // Handle both ioredis styles:
    // 1. brpop(timeout, ...keys) - original ioredis style
    // 2. brpop(...keys, timeout) - BullMQ style
    if (typeof args[args.length - 1] === 'number') {
      // BullMQ style: keys first, timeout last
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else if (typeof args[0] === 'number') {
      // Original ioredis style: timeout first, keys after
      timeout = args[0];
      keys = args.slice(1);
    } else {
      throw new Error('Invalid brpop arguments: timeout must be provided');
    }

    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);

    const result = await client.brpop(normalizedKeys, timeout);

    if (Array.isArray(result) && result.length === 2) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || '',
      ];
    }

    return null;
  }

  async brpoplpush(
    source: RedisKey,
    destination: RedisKey,
    timeout: number
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedSource = ParameterTranslator.normalizeKey(source);
    const normalizedDestination = ParameterTranslator.normalizeKey(destination);

    // BRPOPLPUSH is not available in GLIDE, must use customCommand
    const result = await client.customCommand([
      'BRPOPLPUSH',
      normalizedSource,
      normalizedDestination,
      timeout.toString(),
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  // === Transaction/Script Commands ===
  async script(subcommand: string, ...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    return await client.customCommand([
      'SCRIPT',
      subcommand,
      ...args.map(String),
    ]);
  }

  // WATCH method - both GlideClient and GlideClusterClient inherit from BaseClient with same signature
  async watch(...keys: RedisKey[]): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    return await client.watch(normalizedKeys);
  }

  // UNWATCH method is client-specific due to different signatures - implemented in StandaloneClient/ClusterClient
  abstract unwatch(): Promise<string>;

  // Pipeline and Multi (Transaction) support using GLIDE Batch
  pipeline(): Pipeline {
    return this.createBatchAdapter(false);
  }

  multi(): Multi {
    return this.createBatchAdapter(true);
  }

  // Create adapter that implements Pipeline/Multi interface on top of GLIDE Batch
  private createBatchAdapter(isTransaction: boolean): any {
    // Choose the right batch class based on cluster vs standalone and transaction vs pipeline
    let BatchClass;
    if (this.isCluster) {
      BatchClass = isTransaction
        ? require('@valkey/valkey-glide').ClusterTransaction
        : require('@valkey/valkey-glide').ClusterBatch;
    } else {
      BatchClass = isTransaction
        ? require('@valkey/valkey-glide').Transaction
        : require('@valkey/valkey-glide').Batch;
    }

    // For GLIDE Batch: constructor(isAtomic: boolean)
    // For GLIDE Transaction: constructor()
    // isTransaction determines if it's atomic (true) or pipeline (false)
    const batch = isTransaction ? new BatchClass() : new BatchClass(false);
    let commandCount = 0;
    let discarded = false;

    const adapter = {
      // String commands
      set: (key: RedisKey, value: RedisValue, ..._args: any[]) => {
        batch.set(
          ParameterTranslator.normalizeKey(key),
          ParameterTranslator.normalizeValue(value)
        );
        commandCount++;
        return adapter;
      },
      get: (key: RedisKey) => {
        batch.get(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      mget: (...keys: RedisKey[]) => {
        const normalizedKeys = Array.isArray(keys[0])
          ? keys[0].map(k => ParameterTranslator.normalizeKey(k))
          : keys.map(k => ParameterTranslator.normalizeKey(k));
        batch.mget(normalizedKeys);
        commandCount++;
        return adapter;
      },
      mset: (...args: any[]) => {
        let keyValues: Record<string, string>;
        if (
          args.length === 1 &&
          typeof args[0] === 'object' &&
          !Array.isArray(args[0])
        ) {
          // Object format: mset({ key1: 'val1', key2: 'val2' })
          keyValues = {};
          for (const [key, value] of Object.entries(args[0])) {
            keyValues[ParameterTranslator.normalizeKey(key)] =
              ParameterTranslator.normalizeValue(value as RedisValue);
          }
        } else {
          // Array format: mset('key1', 'val1', 'key2', 'val2')
          keyValues = {};
          for (let i = 0; i < args.length; i += 2) {
            const key = ParameterTranslator.normalizeKey(args[i]);
            const value = ParameterTranslator.normalizeValue(args[i + 1]);
            keyValues[key] = value;
          }
        }
        batch.mset(keyValues);
        return adapter;
      },
      del: (...keys: RedisKey[]) => {
        batch.del(keys.map(k => ParameterTranslator.normalizeKey(k)));
        return adapter;
      },
      exists: (...keys: RedisKey[]) => {
        batch.exists(keys.map(k => ParameterTranslator.normalizeKey(k)));
        return adapter;
      },
      expire: (key: RedisKey, seconds: number) => {
        batch.expire(ParameterTranslator.normalizeKey(key), seconds);
        commandCount++;
        return adapter;
      },
      pexpire: (key: RedisKey, milliseconds: number) => {
        batch.pexpire(ParameterTranslator.normalizeKey(key), milliseconds);
        commandCount++;
        return adapter;
      },
      ttl: (key: RedisKey) => {
        batch.ttl(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      pttl: (key: RedisKey) => {
        batch.pttl(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // Hash commands
      hset: (key: RedisKey, ...args: any[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        const fieldValues = ParameterTranslator.parseHashSetArgs(args);
        batch.hset(normalizedKey, fieldValues);
        commandCount++;
        return adapter;
      },
      hget: (key: RedisKey, field: string) => {
        batch.hget(ParameterTranslator.normalizeKey(key), field);
        commandCount++;
        return adapter;
      },
      hgetall: (key: RedisKey) => {
        batch.hgetall(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // List commands
      lpush: (key: RedisKey, ...elements: RedisValue[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        const normalizedElements = elements.map(e =>
          ParameterTranslator.normalizeValue(e)
        );
        batch.lpush(normalizedKey, normalizedElements);
        commandCount++;
        return adapter;
      },
      rpop: (key: RedisKey) => {
        batch.rpop(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      rpush: (key: RedisKey, ...elements: RedisValue[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        const normalizedElements = elements.map(e =>
          ParameterTranslator.normalizeValue(e)
        );
        batch.rpush(normalizedKey, normalizedElements);
        commandCount++;
        return adapter;
      },
      lpop: (key: RedisKey) => {
        batch.lpop(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      llen: (key: RedisKey) => {
        batch.llen(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      lrange: (key: RedisKey, start: number, stop: number) => {
        batch.lrange(ParameterTranslator.normalizeKey(key), start, stop);
        commandCount++;
        return adapter;
      },
      lrem: (key: RedisKey, count: number, element: RedisValue) => {
        batch.lrem(
          ParameterTranslator.normalizeKey(key),
          count,
          ParameterTranslator.normalizeValue(element)
        );
        commandCount++;
        return adapter;
      },
      ltrim: (key: RedisKey, start: number, stop: number) => {
        batch.ltrim(ParameterTranslator.normalizeKey(key), start, stop);
        commandCount++;
        return adapter;
      },

      // Sorted Set commands (critical for BullMQ priorities/delays)
      zadd: (key: RedisKey, ...args: any[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        // Handle different zadd patterns: zadd key score member, zadd key score1 member1 score2 member2, etc.
        const scoreMembers: any = {};
        for (let i = 0; i < args.length; i += 2) {
          const score = Number(args[i]);
          const member = ParameterTranslator.normalizeValue(args[i + 1]);
          scoreMembers[member] = score;
        }
        batch.zadd(normalizedKey, scoreMembers);
        commandCount++;
        return adapter;
      },
      zrem: (key: RedisKey, ...members: RedisValue[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        const normalizedMembers = members.map(m =>
          ParameterTranslator.normalizeValue(m)
        );
        batch.zrem(normalizedKey, normalizedMembers);
        commandCount++;
        return adapter;
      },
      zrange: (key: RedisKey, start: number, stop: number) => {
        batch.zrange(ParameterTranslator.normalizeKey(key), {
          start,
          end: stop,
        });
        commandCount++;
        return adapter;
      },
      zrevrange: (key: RedisKey, start: number, stop: number) => {
        // GLIDE batch might not support zrevrange, use customCommand
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        batch.customCommand([
          'ZREVRANGE',
          normalizedKey,
          String(start),
          String(stop),
        ]);
        commandCount++;
        return adapter;
      },
      zcard: (key: RedisKey) => {
        batch.zcard(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      zcount: (key: RedisKey, min: string | number, max: string | number) => {
        batch.zcount(ParameterTranslator.normalizeKey(key), {
          min: String(min),
          max: String(max),
        });
        commandCount++;
        return adapter;
      },

      // Set commands
      sadd: (key: RedisKey, ...members: RedisValue[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        const normalizedMembers = members.map(m =>
          ParameterTranslator.normalizeValue(m)
        );
        batch.sadd(normalizedKey, normalizedMembers);
        commandCount++;
        return adapter;
      },
      srem: (key: RedisKey, ...members: RedisValue[]) => {
        const normalizedKey = ParameterTranslator.normalizeKey(key);
        const normalizedMembers = members.map(m =>
          ParameterTranslator.normalizeValue(m)
        );
        batch.srem(normalizedKey, normalizedMembers);
        commandCount++;
        return adapter;
      },
      smembers: (key: RedisKey) => {
        batch.smembers(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      scard: (key: RedisKey) => {
        batch.scard(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // Additional hash commands
      hdel: (key: RedisKey, ...fields: string[]) => {
        batch.hdel(ParameterTranslator.normalizeKey(key), fields);
        commandCount++;
        return adapter;
      },
      hlen: (key: RedisKey) => {
        batch.hlen(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      hkeys: (key: RedisKey) => {
        batch.hkeys(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      hvals: (key: RedisKey) => {
        batch.hvals(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // String commands
      incr: (key: RedisKey) => {
        batch.incr(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      decr: (key: RedisKey) => {
        batch.decr(ParameterTranslator.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      incrby: (key: RedisKey, increment: number) => {
        batch.incrby(ParameterTranslator.normalizeKey(key), increment);
        commandCount++;
        return adapter;
      },

      // Discard method for both pipelines and transactions
      discard: () => {
        discarded = true;
        return adapter;
      },

      // Execute batch
      exec: async () => {
        try {
          // Handle discarded pipeline/transaction
          if (discarded) {
            return []; // ioredis returns empty array for discarded pipeline
          }

          // Handle empty pipeline/batch
          if (commandCount === 0) {
            return []; // ioredis returns empty array for empty pipeline
          }

          const client = await this.ensureConnected();
          const result = await (client as any).exec(batch, false); // Don't raise on error

          // Convert results to ioredis format: Array<[Error | null, any]>
          if (result === null) return null; // Transaction was discarded
          if (!Array.isArray(result)) return [];

          // Note: Database transactions don't rollback on runtime errors
          // They only return null for WATCH violations or DISCARD
          // Runtime errors are returned in the results array

          return result.map((res: any) => {
            if (res instanceof Error) {
              return [res, null];
            } else {
              return [null, res];
            }
          });
        } catch (error) {
          console.error('Batch execution failed:', error);
          throw error;
        }
      },
    };

    return adapter;
  }

  // Connection info
  async ping(message?: string): Promise<string> {
    const client = await this.ensureConnected();
    const options = message ? { message } : undefined;
    const result = await client.ping(options);
    return ParameterTranslator.convertGlideString(result) || 'PONG';
  }

  async info(section?: string): Promise<string> {
    const client = await this.ensureConnected();
    let result: any;
    if (section) {
      // Use customCommand for specific sections
      result = await (client as any).customCommand(['INFO', section]);
    } else {
      result = await client.info();
    }
    return ParameterTranslator.convertGlideString(result) || '';
  }

  // CLIENT command support (critical for BullMQ)
  async client(subcommand: string, ...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    const commandArgs = [
      'CLIENT',
      subcommand.toUpperCase(),
      ...args.map(arg => String(arg)),
    ];
    const result = await (client as any).customCommand(commandArgs);

    // Handle different CLIENT subcommand return types
    if (subcommand.toUpperCase() === 'LIST') {
      return ParameterTranslator.convertGlideString(result) || '';
    } else if (subcommand.toUpperCase() === 'SETNAME') {
      return ParameterTranslator.convertGlideString(result) || 'OK';
    } else {
      return result;
    }
  }

  // Database management commands (critical for BullMQ cleanup)
  async flushall(mode?: 'SYNC' | 'ASYNC'): Promise<string> {
    const client = await this.ensureConnected();

    // GLIDE has direct flushall method - check for both GlideClient and GlideClusterClient
    if (
      'flushall' in client &&
      typeof (client as any).flushall === 'function'
    ) {
      // GLIDE uses FlushMode enum, not string
      const FlushMode = require('@valkey/valkey-glide').FlushMode;
      const flushMode = mode === 'ASYNC' ? FlushMode.ASYNC : FlushMode.SYNC;
      const result = await (client as any).flushall(flushMode);
      return ParameterTranslator.convertGlideString(result) || 'OK';
    } else {
      // Fallback to custom command
      const args = mode ? ['FLUSHALL', mode] : ['FLUSHALL'];
      const result = await (client as any).customCommand(args);
      return ParameterTranslator.convertGlideString(result) || 'OK';
    }
  }

  async flushdb(mode?: 'SYNC' | 'ASYNC'): Promise<string> {
    const client = await this.ensureConnected();

    // GLIDE has direct flushdb method - check for both GlideClient and GlideClusterClient
    if ('flushdb' in client && typeof (client as any).flushdb === 'function') {
      // GLIDE uses FlushMode enum, not string
      const FlushMode = require('@valkey/valkey-glide').FlushMode;
      const flushMode = mode === 'ASYNC' ? FlushMode.ASYNC : FlushMode.SYNC;
      const result = await (client as any).flushdb(flushMode);
      return ParameterTranslator.convertGlideString(result) || 'OK';
    } else {
      // Fallback to custom command
      const args = mode ? ['FLUSHDB', mode] : ['FLUSHDB'];
      const result = await (client as any).customCommand(args);
      return ParameterTranslator.convertGlideString(result) || 'OK';
    }
  }

  // === JSON Commands (ValkeyJSON compatible) ===
  // TODO: Implement JsonCommands directly
  async jsonSet(
    key: RedisKey,
    path: string,
    value: any,
    options?: 'NX' | 'XX'
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const jsonValue = JSON.stringify(value);
    const args = ['JSON.SET', normalizedKey, path, jsonValue];

    if (options) {
      args.push(options);
    }

    const result = await client.customCommand(args);
    return result === 'OK' ? 'OK' : null;
  }

  async jsonGet(
    key: RedisKey,
    path?: string | string[],
    options?: {
      indent?: string;
      newline?: string;
      space?: string;
    }
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.GET', normalizedKey];

    if (path) {
      if (Array.isArray(path)) {
        args.push(...path);
      } else {
        args.push(path);
      }
    }

    if (options) {
      if (options.indent !== undefined) {
        args.push('INDENT', options.indent);
      }
      if (options.newline !== undefined) {
        args.push('NEWLINE', options.newline);
      }
      if (options.space !== undefined) {
        args.push('SPACE', options.space);
      }
    }

    const result = await client.customCommand(args);
    if (result === null || result === undefined) {
      return null;
    }

    const resultStr = String(result);

    // Handle JSONPath queries that return arrays - unwrap single element arrays
    if (path && typeof path === 'string' && path.startsWith('$.')) {
      try {
        const parsed = JSON.parse(resultStr);
        // If it's an array with one element, unwrap it for ioredis compatibility
        if (Array.isArray(parsed) && parsed.length === 1) {
          return JSON.stringify(parsed[0]);
        }
        // If it's an empty array, return null for non-existent paths
        if (Array.isArray(parsed) && parsed.length === 0) {
          return null;
        }
      } catch {
        // If parsing fails, return as-is
      }
    }

    return resultStr;
  }

  async jsonDel(key: RedisKey, path?: string): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.DEL', normalizedKey];
    if (path) args.push(path);
    const result = await client.customCommand(args);
    return Number(result) || 0;
  }

  async jsonClear(key: RedisKey, path?: string): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.CLEAR', normalizedKey];
    if (path) args.push(path);
    const result = await client.customCommand(args);
    return Number(result) || 0;
  }

  async jsonType(key: RedisKey, path?: string): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.TYPE', normalizedKey];

    if (path) {
      args.push(path);
    }

    const result = await client.customCommand(args);

    // Handle all possible null/empty responses for non-existent keys
    // GLIDE may return [null], null, undefined, or empty string for non-existent keys
    if (
      result === null ||
      result === undefined ||
      result === '' ||
      result === 'null' ||
      String(result).trim() === '' ||
      (Array.isArray(result) && result.length === 1 && result[0] === null)
    ) {
      return null;
    }

    // Handle JSONPath queries that return arrays - unwrap single element arrays
    if (path && path.startsWith('$.')) {
      if (Array.isArray(result)) {
        return result.length > 0 ? String(result[0]) : null;
      }
      // Try to parse if it's a JSON string that represents an array
      try {
        const parsed = JSON.parse(String(result));
        if (Array.isArray(parsed)) {
          return parsed.length > 0 ? String(parsed[0]) : null;
        }
      } catch {
        // Not a JSON string, continue
      }
    }

    return String(result);
  }

  async jsonNumIncrBy(
    key: RedisKey,
    path: string,
    value: number
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const result = await client.customCommand([
      'JSON.NUMINCRBY',
      normalizedKey,
      path,
      value.toString(),
    ]);

    if (result === null || result === undefined) {
      return null;
    }

    // Handle JSONPath queries that return arrays - unwrap single element arrays
    if (path.startsWith('$.') && Array.isArray(result)) {
      return result.length > 0 ? String(result[0]) : null;
    }

    return String(result);
  }

  async jsonNumMultBy(
    key: RedisKey,
    path: string,
    value: number
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const result = await client.customCommand([
      'JSON.NUMMULTBY',
      normalizedKey,
      path,
      value.toString(),
    ]);
    return result as string | null;
  }

  async jsonStrAppend(
    key: RedisKey,
    path: string,
    value: string
  ): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const jsonValue = JSON.stringify(value);
    const result = await client.customCommand([
      'JSON.STRAPPEND',
      normalizedKey,
      path,
      jsonValue,
    ]);
    return Number(result) || 0;
  }

  async jsonStrLen(key: RedisKey, path?: string): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.STRLEN', normalizedKey];
    if (path) args.push(path);
    const result = await client.customCommand(args);
    return result !== null ? Number(result) : null;
  }

  async jsonArrAppend(
    key: RedisKey,
    path: string,
    ...values: any[]
  ): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);

    // Simplified approach - always JSON.stringify everything
    const jsonValues = values.map(v => JSON.stringify(v));

    const result = await client.customCommand([
      'JSON.ARRAPPEND',
      normalizedKey,
      path,
      ...jsonValues,
    ]);

    // Handle JSONPath queries that return arrays - unwrap single element arrays
    if (path.startsWith('$.') && Array.isArray(result)) {
      return result.length > 0 ? Number(result[0]) || 0 : 0;
    }

    return Number(result) || 0;
  }

  async jsonArrInsert(
    key: RedisKey,
    path: string,
    index: number,
    ...values: any[]
  ): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const jsonValues = values.map(v =>
      typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)
    );
    const result = await client.customCommand([
      'JSON.ARRINSERT',
      normalizedKey,
      path,
      index.toString(),
      ...jsonValues,
    ]);
    return Number(result) || 0;
  }

  async jsonArrLen(key: RedisKey, path?: string): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.ARRLEN', normalizedKey];

    if (path) {
      args.push(path);
    }

    try {
      const result = await client.customCommand(args);

      if (result === null || result === undefined) {
        return null;
      }

      // Handle JSONPath queries that return arrays - unwrap single element arrays
      if (path && path.startsWith('$.') && Array.isArray(result)) {
        // If the array is empty, it means the path doesn't exist or is not an array
        if (result.length === 0) {
          return null;
        }
        const value = result[0];
        return value !== null ? Number(value) : null;
      }

      return result !== null ? Number(result) : null;
    } catch (error) {
      // Return null for type mismatches or other errors
      return null;
    }
  }

  async jsonArrPop(
    key: RedisKey,
    path?: string,
    index?: number
  ): Promise<string | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.ARRPOP', normalizedKey];
    if (path) args.push(path);
    if (index !== undefined) args.push(index.toString());
    const result = await client.customCommand(args);
    return result ? String(result) : null;
  }

  async jsonArrTrim(
    key: RedisKey,
    path: string,
    start: number,
    stop: number
  ): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const result = await client.customCommand([
      'JSON.ARRTRIM',
      normalizedKey,
      path,
      start.toString(),
      stop.toString(),
    ]);
    return Number(result) || 0;
  }

  async jsonObjKeys(key: RedisKey, path?: string): Promise<string[] | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.OBJKEYS', normalizedKey];

    if (path) {
      args.push(path);
    }

    try {
      const result = await client.customCommand(args);

      if (result === null || result === undefined) {
        return null;
      }

      // Handle JSONPath queries that return arrays - unwrap single element arrays
      if (path && path.startsWith('$.') && Array.isArray(result)) {
        // If the outer array is empty, it means the path doesn't exist or is not an object
        if (result.length === 0) {
          return null;
        }
        // If the first element is an array, return it (unwrap one level)
        if (Array.isArray(result[0])) {
          // If the unwrapped array is empty, it's a type mismatch
          if (result[0].length === 0) {
            return null;
          }
          return result[0] as string[];
        }
        // If the first element is null or empty array, return null for type mismatch
        if (
          result[0] === null ||
          (Array.isArray(result[0]) && result[0].length === 0)
        ) {
          return null;
        }
        // If it's not an array but an empty result, return null for type mismatch
        return null;
      }

      // Handle regular (non-JSONPath) queries
      if (Array.isArray(result)) {
        // If it's an empty array, return null for type mismatch or non-existent key
        if (result.length === 0) {
          return null;
        }
        return result as string[];
      }

      return null;
    } catch (error) {
      // Return null for type mismatches or other errors
      return null;
    }
  }

  async jsonObjLen(key: RedisKey, path?: string): Promise<number | null> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.OBJLEN', normalizedKey];
    if (path) args.push(path);
    const result = await client.customCommand(args);
    return result !== null ? Number(result) : null;
  }

  async jsonToggle(key: RedisKey, path: string): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const result = await client.customCommand([
      'JSON.TOGGLE',
      normalizedKey,
      path,
    ]);

    // Handle JSONPath queries that return arrays - unwrap single element arrays
    if (path.startsWith('$.') && Array.isArray(result)) {
      return result.length > 0 ? Number(result[0]) || 0 : 0;
    }

    return Number(result) || 0;
  }

  async jsonDebug(
    subcommand: string,
    key: RedisKey,
    path?: string
  ): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.DEBUG', subcommand, normalizedKey];
    if (path) args.push(path);
    return await client.customCommand(args);
  }

  async jsonForget(key: RedisKey, path?: string): Promise<number> {
    const client = await this.ensureConnected();
    // JSON.FORGET is alias for JSON.DEL
    const normalizedKey = String(key);
    const args = ['JSON.DEL', normalizedKey];
    if (path) args.push(path);
    const result = await client.customCommand(args);
    return Number(result) || 0;
  }

  async jsonResp(key: RedisKey, path?: string): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = String(key);
    const args = ['JSON.RESP', normalizedKey];
    if (path) args.push(path);
    return await client.customCommand(args);
  }

  // Pub/Sub Commands - Based on proven bridge pattern from old adapters

  /**
   * Subscribe to channels - supports both GLIDE native and event-based modes
   * GLIDE mode: Uses callback mechanism (better performance, text only)
   * Event-based mode: Uses custom commands (Socket.IO compatible, binary safe)
   */
  async subscribe(...channels: string[]): Promise<number> {
    // Debug logging for Socket.IO

    // Flatten any nested arrays (Socket.IO adapter might pass arrays)
    const flatChannels = channels.flat();

    // Add new channels to our subscription set
    const newChannels = flatChannels.filter(
      channel => !this.subscribedChannels.has(channel)
    );
    newChannels.forEach(channel => this.subscribedChannels.add(channel));

    if (newChannels.length > 0) {
      if (this.options.enableEventBasedPubSub) {
        // ioredis-compatible mode: Use IoredisPubSubClient for Socket.IO compatibility
        if (!this.ioredisCompatiblePubSub) {
          this.ioredisCompatiblePubSub = new IoredisPubSubClient(this.options);
          await this.ioredisCompatiblePubSub.connect();

          // Forward events from IoredisPubSubClient to this client
          this.ioredisCompatiblePubSub.on(
            'message',
            (channel: string, message: string) => {
              this.emit('message', channel, message);
            }
          );
        }

        // Subscribe to each new channel
        for (const channel of newChannels) {
          await this.ioredisCompatiblePubSub.subscribe(channel);
        }
      } else {
        // Pure GLIDE mode: Use callback mechanism with separate subscriber client
        await this.updateSubscriberClient();
      }
    }

    // Emit subscription events for ioredis compatibility
    for (const channel of flatChannels) {
      this.emit('subscribe', channel, this.subscribedChannels.size);
    }

    this.isInSubscriberMode = true;
    return this.subscribedChannels.size;
  }

  /**
   * Subscribe to patterns - supports both GLIDE native and event-based modes
   */
  async psubscribe(...patterns: string[]): Promise<number> {
    // Socket.IO adapter debug logging

    // Add new patterns to our subscription set
    const newPatterns = patterns.filter(
      pattern => !this.subscribedPatterns.has(pattern)
    );
    newPatterns.forEach(pattern => this.subscribedPatterns.add(pattern));

    if (newPatterns.length > 0) {
      if (this.options.enableEventBasedPubSub) {
        // ioredis-compatible mode: Use IoredisPubSubClient for Socket.IO compatibility
        if (!this.ioredisCompatiblePubSub) {
          const { IoredisPubSubClient } = await import(
            './utils/IoredisPubSubClient'
          );
          this.ioredisCompatiblePubSub = new IoredisPubSubClient(this.options);
          await this.ioredisCompatiblePubSub.connect();

          // Forward events from IoredisPubSubClient to this client
          this.ioredisCompatiblePubSub.on(
            'message',
            (channel: string, message: string) => {
              this.emit('message', channel, message);
            }
          );
          this.ioredisCompatiblePubSub.on(
            'pmessage',
            (pattern: string, channel: string, message: string) => {
              this.emit('pmessage', pattern, channel, message);
            }
          );
          // Forward Socket.IO Buffer events
          this.ioredisCompatiblePubSub.on(
            'messageBuffer',
            (channel: string, message: Buffer) => {
              this.emit('messageBuffer', channel, message);
            }
          );
          this.ioredisCompatiblePubSub.on(
            'pmessageBuffer',
            (pattern: string, channel: string, message: Buffer) => {
              this.emit('pmessageBuffer', pattern, channel, message);
            }
          );
        }

        // Subscribe to each new pattern
        for (const pattern of newPatterns) {
          await this.ioredisCompatiblePubSub.psubscribe(pattern);
        }
      } else {
        // GLIDE mode: Use callback mechanism with separate subscriber client
        await this.updateSubscriberClient();
      }
    }

    // Emit subscription events for ioredis compatibility
    for (const pattern of patterns) {
      this.emit('psubscribe', pattern, this.subscribedPatterns.size);
    }

    this.isInSubscriberMode = true;
    return this.subscribedPatterns.size;
  }

  /**
   * Socket.IO adapter compatibility - pSubscribe method (capital S) for Redis v4+ detection
   * This method signature matches Redis v4+ and makes Socket.IO adapter use the callback approach
   * instead of the problematic event-based approach
   */
  async pSubscribe(
    pattern: string,
    callback: (message: string | Buffer, channel: string) => void
  ): Promise<void> {
    // Subscribe to the pattern using our existing pattern subscription mechanism
    await this.psubscribe(pattern);

    // Set up the callback - Socket.IO adapter expects (msg, channel) parameters
    // Use pmessageBuffer to get binary data for MessagePack parsing
    this.on(
      'pmessageBuffer',
      (
        receivedPattern: string,
        receivedChannel: string,
        receivedMessage: Buffer
      ) => {
        // Only call callback for messages matching the exact pattern
        if (receivedPattern === pattern) {
          // Socket.IO adapter expects (msg, channel) order with binary data
          callback(receivedMessage, receivedChannel);
        }
      }
    );
  }

  /**
   * Unsubscribe from channels - supports both modes
   */
  async unsubscribe(...channels: string[]): Promise<number> {
    if (channels.length === 0) {
      // Unsubscribe from all channels
      this.subscribedChannels.clear();
    } else {
      // Unsubscribe from specific channels
      channels.forEach(channel => this.subscribedChannels.delete(channel));
    }

    if (this.options.enableEventBasedPubSub) {
      // ioredis-compatible mode: Use IoredisPubSubClient for Socket.IO compatibility
      if (this.ioredisCompatiblePubSub) {
        if (channels.length === 0) {
          // Unsubscribe from all channels
          await this.ioredisCompatiblePubSub.unsubscribe();
        } else {
          // Unsubscribe from specific channels
          for (const channel of channels) {
            await this.ioredisCompatiblePubSub.unsubscribe(channel);
          }
        }
      }
    } else {
      // Pure GLIDE mode: Use callback mechanism with separate subscriber client
      await this.updateSubscriberClient();
    }

    // Emit unsubscription events for ioredis compatibility
    for (const channel of channels) {
      this.emit('unsubscribe', channel, this.subscribedChannels.size);
    }

    // Exit subscriber mode if no more subscriptions
    if (
      this.subscribedChannels.size === 0 &&
      this.subscribedPatterns.size === 0 &&
      this.subscribedShardedChannels.size === 0
    ) {
      this.isInSubscriberMode = false;
    }

    return this.subscribedChannels.size;
  }

  /**
   * Unsubscribe from patterns
   */
  async punsubscribe(...patterns: string[]): Promise<number> {
    if (patterns.length === 0) {
      // Unsubscribe from all patterns
      this.subscribedPatterns.clear();
    } else {
      // Unsubscribe from specific patterns
      patterns.forEach(pattern => this.subscribedPatterns.delete(pattern));
    }

    if (this.options.enableEventBasedPubSub) {
      // Event-based mode: Use GLIDE subscriber with binary-safe encoding/decoding
      await this.updateSubscriberClient();
    } else {
      // GLIDE mode: Use callback mechanism with separate subscriber client
      await this.updateSubscriberClient();
    }

    // Emit unsubscription events for ioredis compatibility
    for (const pattern of patterns) {
      this.emit('punsubscribe', pattern, this.subscribedPatterns.size);
    }

    // Exit subscriber mode if no more subscriptions
    if (
      this.subscribedChannels.size === 0 &&
      this.subscribedPatterns.size === 0 &&
      this.subscribedShardedChannels.size === 0
    ) {
      this.isInSubscriberMode = false;
    }

    return this.subscribedPatterns.size;
  }

  /**
   * Subscribe to sharded channels (cluster clients only)
   * For standalone clients, this will throw an error
   * Overridden in ClusterClient for actual implementation
   */
  async ssubscribe(..._channels: string[]): Promise<number> {
    throw new Error(
      'Sharded pub/sub is not supported in standalone mode. Use subscribe() instead.'
    );
  }

  /**
   * Unsubscribe from sharded channels (cluster clients only)
   * Overridden in ClusterClient for actual implementation
   */
  async sunsubscribe(..._channels: string[]): Promise<number> {
    throw new Error(
      'Sharded pub/sub is not supported in standalone mode. Use unsubscribe() instead.'
    );
  }

  /**
   * Update the subscriber client with current channels and patterns
   * Uses GLIDE's proven callback mechanism from DirectGlidePubSub
   */
  protected async updateSubscriberClient(): Promise<void> {
    // Close existing subscriber client
    if (this.subscriberClient) {
      try {
        await new Promise<void>(resolve => {
          this.subscriberClient!.close();
          setTimeout(resolve, 0);
        });
      } catch (error) {
        // Ignore close errors
      }
      this.subscriberClient = null;
    }

    // If we have subscriptions, create a new client with callback mechanism
    if (
      this.subscribedChannels.size > 0 ||
      this.subscribedPatterns.size > 0 ||
      this.subscribedShardedChannels.size > 0
    ) {
      this.subscriberClient = await this.createSubscriberClientWithCallback();
    }
  }

  /**
   * Create subscriber client with GLIDE's callback mechanism
   * Based on proven pattern from DirectGlidePubSub.ts
   */
  private async createSubscriberClientWithCallback(): Promise<GlideClientType> {
    const {
      GlideClientConfiguration,
      PubSubMsg,
    } = require('@valkey/valkey-glide');

    // Create subscriber config with callback mechanism
    const subscriberConfig = await this.getBaseSubscriberConfig();

    const hasChannels = this.subscribedChannels.size > 0;
    const hasPatterns = this.subscribedPatterns.size > 0;
    const hasShardedChannels = this.subscribedShardedChannels.size > 0;

    if (hasChannels || hasPatterns || hasShardedChannels) {
      subscriberConfig.pubsubSubscriptions = {
        channelsAndPatterns: {},
        callback: (msg: typeof PubSubMsg, _context: any) => {
          try {
            // Handle potential binary data in pub/sub messages (Socket.IO compatibility)
            let channel: string;
            let message: string | Buffer;
            let pattern: string | undefined;

            // Safely convert channel
            channel =
              msg.channel instanceof Buffer
                ? msg.channel.toString('utf8')
                : String(msg.channel);

            // Safely convert message, handling encoded binary data
            let rawMessage =
              msg.message instanceof Buffer
                ? msg.message.toString('utf8')
                : String(msg.message);

            // Check if message contains encoded binary data
            const BINARY_MARKER = '__GLIDE_BINARY__:';
            if (rawMessage.startsWith(BINARY_MARKER)) {
              // Decode base64 back to Buffer for binary data
              try {
                const base64Data = rawMessage.substring(BINARY_MARKER.length);
                message = Buffer.from(base64Data, 'base64');
              } catch (decodeError) {
                // If decoding fails, emit as string
                message = rawMessage;
              }
            } else {
              // Regular string message
              message = rawMessage;
            }

            if (msg.pattern) {
              // Pattern message - safely convert pattern
              pattern =
                msg.pattern instanceof Buffer
                  ? msg.pattern.toString('utf8')
                  : String(msg.pattern);
              this.emit('pmessage', pattern, channel, message);
              // Socket.IO adapter compatibility - also emit pmessageBuffer
              const messageBuffer =
                message instanceof Buffer
                  ? message
                  : Buffer.from(String(message), 'utf8');
              this.emit('pmessageBuffer', messageBuffer, pattern, channel);
            } else {
              // Regular message
              this.emit('message', channel, message);
              // Socket.IO adapter compatibility - also emit messageBuffer
              const messageBuffer =
                message instanceof Buffer
                  ? message
                  : Buffer.from(String(message), 'utf8');
              this.emit('messageBuffer', channel, messageBuffer);
            }
          } catch (error) {
            // If all else fails, emit a safe fallback message
            console.warn(
              '[ioredis-adapter] Pub/sub message processing error:',
              error
            );
            this.emit('message', 'unknown', 'binary-data-error');
          }
        },
        context: { baseClient: this },
      };

      // Add exact channels
      if (hasChannels) {
        subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
          GlideClientConfiguration.PubSubChannelModes.Exact
        ] = new Set(Array.from(this.subscribedChannels));
      }

      // Add pattern channels
      if (hasPatterns) {
        subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
          GlideClientConfiguration.PubSubChannelModes.Pattern
        ] = new Set(Array.from(this.subscribedPatterns));
      }

      // Add sharded channels (cluster only)
      if (hasShardedChannels) {
        // Check if this is a cluster configuration that supports sharded channels
        try {
          const {
            GlideClusterClientConfiguration,
          } = require('@valkey/valkey-glide');
          if (
            GlideClusterClientConfiguration?.PubSubChannelModes?.Sharded !==
            undefined
          ) {
            subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
              GlideClusterClientConfiguration.PubSubChannelModes.Sharded
            ] = new Set(Array.from(this.subscribedShardedChannels));
          }
        } catch (error) {
          // Sharded channels not supported or not in cluster mode
        }
      }
    }

    return await this.createSubscriberClientFromConfig(subscriberConfig);
  }

  // Binary-safe pub/sub implementation complete - uses GLIDE subscriber with encoding/decoding

  /**
   * Abstract methods for subclasses to implement their specific subscriber configs
   */
  protected abstract getBaseSubscriberConfig(): Promise<any>;
  protected abstract createSubscriberClientFromConfig(
    config: any
  ): Promise<GlideClientType>;

  /**
   * Public helper methods for DirectGlidePubSub to access protected methods
   */
  public async createDirectSubscriberConfig(): Promise<any> {
    return await this.getBaseSubscriberConfig();
  }

  public async createDirectSubscriberClient(
    config: any
  ): Promise<GlideClientType> {
    return await this.createSubscriberClientFromConfig(config);
  }

  /**
   * Public helper to create a new client (for DirectGlidePubSub publisher)
   */
  public async createDirectClient(): Promise<GlideClientType> {
    return await this.createClient();
  }

  /**
   * Get pub/sub status for debugging
   */
  getPubSubStatus() {
    return {
      subscribedChannels: Array.from(this.subscribedChannels),
      subscribedPatterns: Array.from(this.subscribedPatterns),
      isInSubscriberMode: this.isInSubscriberMode,
      hasSubscriberClient: !!this.subscriberClient,
    };
  }

  // Search command helper methods

  /**
   * Parse search result from FT.SEARCH
   */

  /**
   * Parse FT.INFO result
   */

  /**
   * Parse document result from FT.GET
   */

  // System and administrative commands
  async config(action: string, parameter?: string): Promise<string[]> {
    const client = await this.ensureConnected();
    const args = parameter ? [action, parameter] : [action];
    const result = await client.customCommand(['CONFIG', ...args]);

    // CONFIG GET returns key-value pairs as an array
    if (action.toUpperCase() === 'GET' && Array.isArray(result)) {
      return result.map(item => String(item));
    }

    return Array.isArray(result)
      ? result.map(item => String(item))
      : [String(result)];
  }

  async dbsize(): Promise<number> {
    const client = await this.ensureConnected();
    const result = await client.customCommand(['DBSIZE']);
    return Number(result) || 0;
  }

  async memory(subcommand: string, ...args: (string | number)[]): Promise<any> {
    const client = await this.ensureConnected();
    const commandArgs = ['MEMORY', subcommand, ...args.map(arg => String(arg))];
    return await client.customCommand(commandArgs);
  }

  async slowlog(
    subcommand: string,
    ...args: (string | number)[]
  ): Promise<any> {
    const client = await this.ensureConnected();
    const commandArgs = [
      'SLOWLOG',
      subcommand,
      ...args.map(arg => String(arg)),
    ];
    const result = await client.customCommand(commandArgs);
    return result;
  }

  async debug(subcommand: string, ...args: (string | number)[]): Promise<any> {
    const client = await this.ensureConnected();
    const commandArgs = ['DEBUG', subcommand, ...args.map(arg => String(arg))];
    return await client.customCommand(commandArgs);
  }

  async echo(message: string): Promise<string> {
    const client = await this.ensureConnected();
    const result = await client.customCommand(['ECHO', message]);
    return String(result);
  }

  async time(): Promise<[string, string]> {
    const client = await this.ensureConnected();
    const result = await client.customCommand(['TIME']);
    if (Array.isArray(result) && result.length >= 2) {
      return [String(result[0]), String(result[1])];
    }
    return ['0', '0'];
  }

  // Stream commands
  async xadd(
    key: RedisKey,
    id: string,
    ...fieldsAndValues: (string | number)[]
  ): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const args = [
      'XADD',
      normalizedKey,
      id,
      ...fieldsAndValues.map(v => String(v)),
    ];
    const result = await client.customCommand(args);
    return String(result);
  }

  async xlen(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.customCommand(['XLEN', normalizedKey]);
    return Number(result) || 0;
  }

  async xread(...args: any[]): Promise<any[]> {
    const client = await this.ensureConnected();

    // Parse ioredis-style XREAD arguments: ['STREAMS', 'stream1', 'stream2', 'id1', 'id2']
    // Convert to GLIDE format: {stream1: 'id1', stream2: 'id2'}
    let streamsIndex = args.findIndex(
      arg => String(arg).toUpperCase() === 'STREAMS'
    );
    if (streamsIndex === -1) {
      // Fallback to customCommand for non-standard usage
      const result = await client.customCommand([
        'XREAD',
        ...args.map(arg => String(arg)),
      ]);
      return Array.isArray(result) ? result : [];
    }

    const streamArgs = args.slice(streamsIndex + 1);
    const streamCount = Math.floor(streamArgs.length / 2);
    const streamNames = streamArgs.slice(0, streamCount);
    const streamIds = streamArgs.slice(streamCount);

    // Build keys_and_ids object for GLIDE
    const keysAndIds: Record<string, string> = {};
    for (let i = 0; i < streamCount; i++) {
      keysAndIds[streamNames[i]] = streamIds[i];
    }

    const result = await client.xread(keysAndIds);

    if (!result || typeof result !== 'object') {
      return [];
    }

    // Convert GLIDE format {stream1: entries, stream2: entries} to ioredis format [[stream1, entries], [stream2, entries]]
    const ioredisResult: any[] = [];
    for (const [streamName, entries] of Object.entries(result)) {
      if (entries && Array.isArray(entries)) {
        ioredisResult.push([streamName, entries]);
      }
    }

    return ioredisResult;
  }

  async xrange(
    key: RedisKey,
    start: string = '-',
    end: string = '+',
    count?: number
  ): Promise<any[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Convert ioredis boundaries to GLIDE boundary format
    const startBoundary =
      start === '-'
        ? { value: '-', isInclusive: false }
        : { value: start, isInclusive: true };
    const endBoundary =
      end === '+'
        ? { value: '+', isInclusive: false }
        : { value: end, isInclusive: true };

    const options = count !== undefined ? { count } : undefined;

    const result = await client.xrange(
      normalizedKey,
      startBoundary,
      endBoundary,
      options
    );

    // GLIDE returns StreamEntryDataType | null, we need to return array format
    if (!result || !Array.isArray(result)) {
      return [];
    }

    return result;
  }

  async xrevrange(
    key: RedisKey,
    start: string = '+',
    end: string = '-',
    count?: number
  ): Promise<any[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);

    // Convert ioredis boundaries to GLIDE boundary format (note: start/end are reversed for XREVRANGE)
    const startBoundary =
      start === '+'
        ? { value: '+', isInclusive: false }
        : { value: start, isInclusive: true };
    const endBoundary =
      end === '-'
        ? { value: '-', isInclusive: false }
        : { value: end, isInclusive: true };

    const options = count !== undefined ? { count } : undefined;

    // Use GLIDE's xrevrange method (if available) or fallback to customCommand
    try {
      const result = await (client as any).xrevrange(
        normalizedKey,
        startBoundary,
        endBoundary,
        options
      );

      if (!result || !Array.isArray(result)) {
        return [];
      }

      return result;
    } catch (error) {
      // Fallback to customCommand
      const args = ['XREVRANGE', normalizedKey, start, end];
      if (count !== undefined) {
        args.push('COUNT', String(count));
      }
      const result = await client.customCommand(args);
      return Array.isArray(result) ? result : [];
    }
  }

  async xdel(key: RedisKey, ...ids: string[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.customCommand(['XDEL', normalizedKey, ...ids]);
    return Number(result) || 0;
  }

  async xtrim(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.customCommand([
      'XTRIM',
      normalizedKey,
      ...args.map(arg => String(arg)),
    ]);
    return Number(result) || 0;
  }

  async xgroup(
    action: string,
    key: RedisKey,
    group: string,
    ...args: (string | number)[]
  ): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const commandArgs = [
      'XGROUP',
      action,
      normalizedKey,
      group,
      ...args.map(arg => String(arg)),
    ];
    return await client.customCommand(commandArgs);
  }

  async xreadgroup(...args: any[]): Promise<any[]> {
    const client = await this.ensureConnected();
    const result = await client.customCommand([
      'XREADGROUP',
      'GROUP',
      ...args.map(arg => String(arg)),
    ]);
    return Array.isArray(result) ? result : [];
  }

  async xack(key: RedisKey, group: string, ...ids: string[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.customCommand([
      'XACK',
      normalizedKey,
      group,
      ...ids,
    ]);
    return Number(result) || 0;
  }

  async xpending(
    key: RedisKey,
    group: string,
    range?: { start: string; end: string; count: number; consumer?: string }
  ): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const args = ['XPENDING', normalizedKey, group];

    if (range) {
      args.push(range.start, range.end, String(range.count));
      if (range.consumer) {
        args.push(range.consumer);
      }
    }

    return await client.customCommand(args);
  }

  async xclaim(
    key: RedisKey,
    group: string,
    consumer: string,
    minIdleTime: number,
    ...ids: string[]
  ): Promise<any[]> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const args = [
      'XCLAIM',
      normalizedKey,
      group,
      consumer,
      String(minIdleTime),
      ...ids,
    ];
    const result = await client.customCommand(args);
    return Array.isArray(result) ? result : [];
  }

  async xinfo(
    subcommand: 'STREAM' | 'GROUPS' | 'CONSUMERS',
    key: RedisKey,
    group?: string
  ): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const args = ['XINFO', subcommand, normalizedKey];

    if (group) {
      args.push(group);
    }

    return await client.customCommand(args);
  }

  // Generic command execution method (ioredis compatibility)
  async call(
    command: string,
    ...args: (string | number | Buffer)[]
  ): Promise<any> {
    const client = await this.ensureConnected();

    // Convert args to GLIDE format
    const commandArgs = args.map(arg => {
      if (typeof arg === 'string' || typeof arg === 'number') {
        return String(arg);
      }
      if (Buffer.isBuffer(arg)) {
        return arg.toString();
      }
      return String(arg);
    });

    // Execute via customCommand
    return await client.customCommand([command.toUpperCase(), ...commandArgs]);
  }

  // ioredis compatibility - sendCommand
  async sendCommand(command: any): Promise<any> {
    const client = await this.ensureConnected();

    // Ensure connection is alive
    await client.ping();

    if (Array.isArray(command)) {
      return await client.customCommand(command);
    } else {
      throw new Error('sendCommand expects array format: [command, ...args]');
    }
  }

  // TODO: Add remaining database commands as needed
  // This base class contains comprehensive database commands for complete compatibility
}

/**
 * DirectGlidePubSub - Resilient GLIDE Pub/Sub Implementation
 *
 * Uses GLIDE's native callback mechanism for message delivery.
 * This is the resilient architecture that doesn't require polling.
 */
class DirectGlidePubSub implements DirectGlidePubSubInterface {
  private baseClient: BaseClient;
  private directSubscriberClient: GlideClientType | null = null;
  private directPublisherClient: GlideClientType | null = null;

  // Separate state management for direct pub/sub
  private directChannels = new Set<string>();
  private directPatterns = new Set<string>();
  private directShardedChannels = new Set<string>();
  private directCallbacks = new Map<
    string,
    (message: DirectPubSubMessage) => void
  >();

  constructor(baseClient: BaseClient) {
    this.baseClient = baseClient;
  }

  async subscribe(
    channels: string[],
    callback: (message: DirectPubSubMessage) => void
  ): Promise<number> {
    // Store callback for these channels
    channels.forEach(channel => {
      this.directChannels.add(channel);
      this.directCallbacks.set(`channel:${channel}`, callback);
    });

    // Recreate subscriber client with callback mechanism
    await this.updateDirectSubscriberClient();

    return this.directChannels.size;
  }

  async psubscribe(
    patterns: string[],
    callback: (message: DirectPubSubMessage) => void
  ): Promise<number> {
    // Store callback for these patterns
    patterns.forEach(pattern => {
      this.directPatterns.add(pattern);
      this.directCallbacks.set(`pattern:${pattern}`, callback);
    });

    // Recreate subscriber client with callback mechanism
    await this.updateDirectSubscriberClient();

    return this.directPatterns.size;
  }

  // Sharded subscribe (cluster clients only)
  async ssubscribe(
    channels: string[],
    callback: (message: DirectPubSubMessage) => void
  ): Promise<number> {
    // Only available for cluster clients
    const ClusterClient = require('./ClusterClient').ClusterClient;
    if (!(this.baseClient instanceof ClusterClient)) {
      throw new Error(
        'Sharded pub/sub is only supported in cluster mode. Use subscribe() for standalone clients.'
      );
    }

    // Store callback for these sharded channels
    channels.forEach(channel => {
      this.directShardedChannels.add(channel);
      this.directCallbacks.set(`sharded:${channel}`, callback);
    });

    // Recreate subscriber client with callback mechanism
    await this.updateDirectSubscriberClient();

    return this.directShardedChannels.size;
  }

  async sunsubscribe(...channels: string[]): Promise<number> {
    if (channels.length === 0) {
      // Unsubscribe from all sharded channels
      this.directShardedChannels.forEach(channel => {
        this.directCallbacks.delete(`sharded:${channel}`);
      });
      this.directShardedChannels.clear();
    } else {
      // Unsubscribe from specific sharded channels
      channels.forEach(channel => {
        this.directShardedChannels.delete(channel);
        this.directCallbacks.delete(`sharded:${channel}`);
      });
    }

    await this.updateDirectSubscriberClient();
    return this.directShardedChannels.size;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    if (channels.length === 0) {
      // Unsubscribe from all channels
      this.directChannels.forEach(channel => {
        this.directCallbacks.delete(`channel:${channel}`);
      });
      this.directChannels.clear();
    } else {
      // Unsubscribe from specific channels
      channels.forEach(channel => {
        this.directChannels.delete(channel);
        this.directCallbacks.delete(`channel:${channel}`);
      });
    }

    await this.updateDirectSubscriberClient();
    return this.directChannels.size;
  }

  async punsubscribe(...patterns: string[]): Promise<number> {
    if (patterns.length === 0) {
      // Unsubscribe from all patterns
      this.directPatterns.forEach(pattern => {
        this.directCallbacks.delete(`pattern:${pattern}`);
      });
      this.directPatterns.clear();
    } else {
      // Unsubscribe from specific patterns
      patterns.forEach(pattern => {
        this.directPatterns.delete(pattern);
        this.directCallbacks.delete(`pattern:${pattern}`);
      });
    }

    await this.updateDirectSubscriberClient();
    return this.directPatterns.size;
  }

  async publish(
    channel: string,
    message: string | Buffer,
    sharded?: boolean
  ): Promise<number> {
    // For DirectGlidePubSub, we need to create our own publisher client
    // This is different from the event-based pub/sub which uses the main client
    if (!this.directPublisherClient) {
      this.directPublisherClient = await this.baseClient.createDirectClient();
    }

    // Handle binary data for Socket.IO compatibility
    let normalizedMessage: string;
    if (message instanceof Buffer) {
      // Keep Buffer as-is for GLIDE to handle
      normalizedMessage = message as any;
    } else {
      normalizedMessage = String(message);
    }

    // Use the direct publisher client
    if (
      sharded &&
      'publish' in this.directPublisherClient &&
      typeof (this.directPublisherClient as any).publish === 'function'
    ) {
      // Cluster client with sharded support
      return await (this.directPublisherClient as any).publish(
        normalizedMessage,
        channel,
        sharded
      );
    } else {
      // Standalone client or cluster without sharded
      return await (this.directPublisherClient as any).publish(
        normalizedMessage,
        channel
      );
    }
  }

  getStatus() {
    return {
      subscribedChannels: Array.from(this.directChannels),
      subscribedPatterns: Array.from(this.directPatterns),
      subscribedShardedChannels: Array.from(this.directShardedChannels),
    };
  }

  /**
   * Update the direct subscriber client using GLIDE's callback mechanism
   */
  private async updateDirectSubscriberClient(): Promise<void> {
    // Close existing client
    if (this.directSubscriberClient) {
      try {
        await new Promise<void>(resolve => {
          this.directSubscriberClient!.close();
          setTimeout(resolve, 0);
        });
      } catch (error) {
        // Ignore close errors
      }
      this.directSubscriberClient = null;
    }

    // If we have subscriptions, create new client with GLIDE callbacks
    if (
      this.directChannels.size > 0 ||
      this.directPatterns.size > 0 ||
      this.directShardedChannels.size > 0
    ) {
      this.directSubscriberClient = await this.createDirectSubscriberClient();
    }
  }

  /**
   * Create subscriber client with GLIDE's native callback mechanism
   */
  private async createDirectSubscriberClient(): Promise<GlideClientType> {
    const {
      GlideClientConfiguration,
      PubSubMsg,
    } = require('@valkey/valkey-glide');

    // Get base config from the main client
    const subscriberConfig =
      await this.baseClient.createDirectSubscriberConfig();

    const hasChannels = this.directChannels.size > 0;
    const hasPatterns = this.directPatterns.size > 0;
    const hasShardedChannels = this.directShardedChannels.size > 0;

    if (hasChannels || hasPatterns || hasShardedChannels) {
      subscriberConfig.pubsubSubscriptions = {
        channelsAndPatterns: {},
        callback: (msg: typeof PubSubMsg, _context: any) => {
          // Convert GLIDE message to DirectPubSubMessage
          const directMessage: DirectPubSubMessage = {
            channel: String(msg.channel),
            message: String(msg.message),
          };

          if (msg.pattern) {
            directMessage.pattern = String(msg.pattern);
          }

          // Find and call the appropriate callback
          const channelCallback = this.directCallbacks.get(
            `channel:${directMessage.channel}`
          );
          const patternCallback = directMessage.pattern
            ? this.directCallbacks.get(`pattern:${directMessage.pattern}`)
            : null;
          const shardedCallback = this.directCallbacks.get(
            `sharded:${directMessage.channel}`
          );

          if (channelCallback) {
            channelCallback(directMessage);
          } else if (patternCallback) {
            patternCallback(directMessage);
          } else if (shardedCallback) {
            shardedCallback(directMessage);
          }
        },
        context: { directPubSub: this },
      };

      // Add exact channels
      if (hasChannels) {
        subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
          GlideClientConfiguration.PubSubChannelModes.Exact
        ] = new Set(Array.from(this.directChannels));
      }

      // Add pattern channels
      if (hasPatterns) {
        subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
          GlideClientConfiguration.PubSubChannelModes.Pattern
        ] = new Set(Array.from(this.directPatterns));
      }

      // Add sharded channels (cluster only)
      if (
        hasShardedChannels &&
        subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![2] !==
          undefined
      ) {
        subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![2] = new Set(
          Array.from(this.directShardedChannels)
        );
      }
    }

    return await this.baseClient.createDirectSubscriberClient(subscriberConfig);
  }

  // Transaction Commands for Bull/BullMQ compatibility
  async multi(): Promise<any> {
    // Returns a transaction object that collects commands
    const commands: Array<{ command: string; args: any[] }> = [];
    const self = this;

    // Create a proxy object that captures commands
    const multiObj = {
      commands,

      // Add common database commands to the multi object
      set: (key: string, value: any, ...args: any[]) => {
        commands.push({ command: 'SET', args: [key, value, ...args] });
        return multiObj;
      },
      get: (key: string) => {
        commands.push({ command: 'GET', args: [key] });
        return multiObj;
      },
      del: (...keys: string[]) => {
        commands.push({ command: 'DEL', args: keys });
        return multiObj;
      },
      hset: (key: string, ...args: any[]) => {
        commands.push({ command: 'HSET', args: [key, ...args] });
        return multiObj;
      },
      hget: (key: string, field: string) => {
        commands.push({ command: 'HGET', args: [key, field] });
        return multiObj;
      },
      lpush: (key: string, ...values: any[]) => {
        commands.push({ command: 'LPUSH', args: [key, ...values] });
        return multiObj;
      },
      rpush: (key: string, ...values: any[]) => {
        commands.push({ command: 'RPUSH', args: [key, ...values] });
        return multiObj;
      },
      zadd: (key: string, ...args: any[]) => {
        commands.push({ command: 'ZADD', args: [key, ...args] });
        return multiObj;
      },

      // Execute the transaction
      exec: async () => {
        const client = await (self as any).ensureConnected();
        const results = [];

        // Execute each command in sequence
        for (const { command, args } of commands) {
          try {
            const result = await client.customCommand([command, ...args]);
            results.push([null, result]);
          } catch (error) {
            results.push([error, null]);
          }
        }

        return results;
      },
    };

    return multiObj;
  }

  async exec(): Promise<any[]> {
    // This is called on the multi object, not the client directly
    throw new Error(
      'EXEC should be called on the multi object returned by multi()'
    );
  }

  async watch(...keys: string[]): Promise<string> {
    const client = await (this as any).ensureConnected();
    await client.customCommand(['WATCH', ...keys]);
    return 'OK';
  }

  async unwatch(): Promise<string> {
    const client = await (this as any).ensureConnected();
    await client.customCommand(['UNWATCH']);
    return 'OK';
  }

  // ioredis compatibility - sendCommand
  async sendCommand(command: any): Promise<any> {
    const client = await (this as any).ensureConnected();

    // Ensure connection is alive
    await client.ping();

    if (Array.isArray(command)) {
      return await client.customCommand(command);
    } else {
      throw new Error('sendCommand expects array format: [command, ...args]');
    }
  }
}
