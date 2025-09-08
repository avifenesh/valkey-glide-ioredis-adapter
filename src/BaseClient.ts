/**
 * BaseClient - Core database client implementation
 *
 * Base class providing comprehensive database operations for both standalone
 * and cluster clients. Maintains complete ioredis API compatibility while
 * leveraging Valkey GLIDE's high-performance core.
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';
import { RedisOptions, RedisKey, RedisValue, Multi, Pipeline } from './types';
import { ParameterTranslator } from './utils/ParameterTranslator';
import { TimeUnit, InfBoundary } from '@valkey/valkey-glide';
import * as stringCommands from './commands/strings';
import { IoredisPubSubClient } from './utils/IoredisPubSubClient';
import * as keyCommands from './commands/keys';
import * as streamCommands from './commands/streams';
import * as serverCommands from './commands/server';
import * as scriptingCommands from './commands/scripting';
import * as geoCommands from './commands/geo';
import * as bitmapCommands from './commands/bitmaps';
import * as hllCommands from './commands/hll';
import * as hashCommands from './commands/hashes';
import * as listCommands from './commands/lists';
import * as setCommands from './commands/sets';
import * as zsetCommands from './commands/zsets';

export type GlideClientType = GlideClient | GlideClusterClient;

// Direct GLIDE Pub/Sub Interface - High-Performance Native Callbacks
export interface DirectPubSubMessage {
  channel: string;
  message: string;
  pattern?: string;
}

export interface DirectGlidePubSubInterface {
  // High-performance subscriptions with native GLIDE callbacks (text only)
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

  // Unsubscribe operations
  unsubscribe(...channels: string[]): Promise<number>;
  punsubscribe(...patterns: string[]): Promise<number>;
  sunsubscribe?(...channels: string[]): Promise<number>; // Cluster only

  // Publishing (automatically detects cluster vs standalone)
  publish(
    channel: string,
    message: string | Buffer,
    sharded?: boolean
  ): Promise<number>;

  // Subscription status
  getStatus(): {
    subscribedChannels: string[];
    subscribedPatterns: string[];
    subscribedShardedChannels?: string[];
  };
}

export abstract class BaseClient extends EventEmitter {
  protected glideClient!: GlideClientType; // Always initialized in constructor
  protected subscriberClient?: GlideClientType; // Only created when needed for subscriptions
  protected ioredisCompatiblePubSub?: IoredisPubSubClient; // Only created when needed
  protected connectionStatus: string = 'disconnected';
  protected options: RedisOptions;
  // Track shutdown/teardown state to avoid racing auto-connect
  protected isClosing: boolean = false;
  // Track an in-flight connect so we can coordinate teardown
  private pendingConnect?: Promise<void>;
  // ioredis compatibility properties
  public blocked: boolean = false;

  // All command families are now function-based

  // Dual Pub/Sub Architecture State Management
  protected subscribedChannels = new Set<string>();
  protected subscribedPatterns = new Set<string>();
  protected subscribedShardedChannels = new Set<string>(); // Cluster only
  protected isInSubscriberMode = false;

  // Direct GLIDE Pub/Sub - High-Performance Native Callbacks
  public directPubSub: DirectGlidePubSubInterface;

  constructor(options: RedisOptions = {}) {
    super();
    this.options = {
      host: 'localhost',
      port: 6379,
      ...options,
    };

    // ioredis compatibility - expose options as _options
    (this as any)._options = this.options;

    // Initialize Direct GLIDE Pub/Sub (High-Performance Architecture)
    this.directPubSub = new DirectGlidePubSub(this);

    // Command family instances will be initialized after glideClient is created

    // Expose only explicitly implemented API; no dynamic stubs

    // Handle lazyConnect option for ioredis compatibility
    if (this.options.lazyConnect === true) {
      // Lazy connection: stay disconnected until first command
      this.connectionStatus = 'disconnected';
      // Don't create client or emit any events yet
    } else {
      // Immediate connection (default behavior)
      // Initialize in next tick to allow event listeners to be attached
      this.connectionStatus = 'disconnected'; // Start as disconnected, will connect in next tick
      process.nextTick(() => {
        // Skip auto-connect if we're already closing
        if (this.isClosing) return;
        this.connect().catch((error: Error) => {
          this.emit('error', error);
        });
      });
    }
  }

  // Instance-aware key normalization with ioredis keyPrefix support
  protected normalizeKey(key: RedisKey): string {
    const base = ParameterTranslator.normalizeKey(key);
    return this.options.keyPrefix ? `${this.options.keyPrefix}${base}` : base;
  }

  // Intentionally no dynamic command attachment; only implemented API is exposed

  // Lazy connection helper: initialize client when first command is executed
  protected async ensureConnection(): Promise<void> {
    // If already connected, return immediately
    if (this.glideClient && this.connectionStatus === 'connected') {
      return;
    }

    // For any disconnected client, start connecting
    if (this.connectionStatus === 'disconnected') {
      await this.connect();
      return;
    }

    // For connections in progress, wait for completion
    if (this.connectionStatus === 'connecting') {
      await this.waitUntilReady();
      return;
    }

    // If we get here, something is wrong
    throw new Error(
      `Cannot ensure connection. Status: ${this.connectionStatus}, lazyConnect: ${this.options.lazyConnect}`
    );
  }

  // Abstract method for subclasses to implement their specific GLIDE client creation
  protected abstract createClient(
    options: RedisOptions
  ): Promise<GlideClientType>;
  protected abstract createSubscriberClient(
    options: RedisOptions
  ): Promise<GlideClientType>;

  // Connection method for ioredis compatibility - idempotent and safe
  async connect(): Promise<void> {
    // If a prior shutdown completed, allow reconnection by clearing closing flag
    if (
      this.connectionStatus === 'end' ||
      this.connectionStatus === 'disconnected'
    ) {
      this.isClosing = false;
    }
    // If already connected, return immediately
    if (this.connectionStatus === 'connected' && this.glideClient) {
      return;
    }

    // If a shutdown is in progress, wait briefly for it to finish
    if (this.isClosing) {
      await new Promise(resolve => {
        const t = setTimeout(resolve, 20);
        (t as any).unref?.();
      });
      if (this.isClosing) return; // still closing; caller can retry
    }

    // If already connecting, wait for that connection
    if (this.connectionStatus === 'connecting') {
      await this.waitUntilReady();
      return;
    }

    // Start new connection
    this.connectionStatus = 'connecting';
    this.isClosing = false; // Reset closing flag when explicitly connecting
    this.emit('connecting');

    this.pendingConnect = (async () => {
      try {
        const client = await this.createClient(this.options);
        // If a shutdown began while connecting, close immediately and skip exposing client
        if (this.isClosing) {
          try {
            (client as any)?.close?.();
          } catch {}
          this.connectionStatus = 'disconnected';
          return;
        }
        this.glideClient = client;
        this.connectionStatus = 'connected';
        this.emit('connect');
        this.emit('ready');
      } catch (error) {
        this.connectionStatus = 'disconnected';
        this.emit('error', error as Error);
        throw error;
      } finally {
        this.pendingConnect = Promise.resolve(undefined);
      }
    })();

    await this.pendingConnect;
  }

  /**
   * Internal cleanup helper - closes all connections and clears resources
   */
  private async cleanupConnections(): Promise<void> {
    // Close main GLIDE client
    try {
      this.glideClient?.close?.();
    } catch (error) {
      // Ignore errors when closing - connection might already be closed
    }

    // Close subscriber client
    if (this.subscriberClient) {
      try {
        (this.subscriberClient as any)?.close?.();
      } catch (error) {
        // Ignore errors when closing - connection might already be closed
      }
      // Do not recreate a subscriber client during cleanup
      this.subscriberClient = undefined as unknown as GlideClientType;
    }

    // Clean up ioredis-compatible pub/sub client
    if (this.ioredisCompatiblePubSub) {
      this.ioredisCompatiblePubSub.disconnect();
      this.ioredisCompatiblePubSub =
        undefined as unknown as IoredisPubSubClient;
    }

    // Ensure Direct GLIDE pub/sub auxiliary clients are closed
    try {
      const maybeDirect = this.directPubSub as any;
      if (maybeDirect && typeof maybeDirect.shutdown === 'function') {
        await maybeDirect.shutdown();
      }
    } catch {}

    // Clear main client reference after closing
    this.glideClient = undefined as unknown as GlideClientType;
  }

  async disconnect(): Promise<void> {
    if (
      this.connectionStatus === 'end' ||
      this.connectionStatus === 'disconnected'
    )
      return;

    // Wait for any pending auto-connect promise before disconnecting
    if ((this as any)._autoConnectPromise) {
      try {
        await (this as any)._autoConnectPromise;
      } catch {
        // Ignore errors from auto-connect
      }
      delete (this as any)._autoConnectPromise;
    }

    // Signal that we are shutting down to avoid racing with auto-connect
    this.isClosing = true;
    this.connectionStatus = 'disconnecting';
    this.emit('close');

    // Clean up all connections
    // If a connect is currently in flight, let it settle then clean up
    try {
      if (this.pendingConnect) {
        await Promise.race([
          this.pendingConnect.catch(() => {}),
          new Promise(resolve => {
            const t = setTimeout(resolve, 50);
            (t as any).unref?.();
          }),
        ]);
      }
    } catch {}
    await this.cleanupConnections();
    // Give underlying transports a short moment to finish closing
    await new Promise<void>(resolve => {
      const t = setTimeout(resolve, 100);
      (t as any).unref?.();
    });

    // Set final status and emit end event
    this.connectionStatus = 'end';
    this.emit('end');
    // Keep isClosing = true to prevent any reconnection attempts
    // Only reset isClosing when explicitly calling connect()
  }

  async quit(): Promise<void> {
    // quit() is permanent termination - same as disconnect() in our implementation
    if (this.connectionStatus === 'end') return;

    this.isClosing = true;
    this.connectionStatus = 'disconnecting';
    this.emit('close');

    // Clean up all connections
    try {
      if (this.pendingConnect) {
        await Promise.race([
          this.pendingConnect.catch(() => {}),
          new Promise(resolve => {
            const t = setTimeout(resolve, 50);
            (t as any).unref?.();
          }),
        ]);
      }
    } catch {}
    await this.cleanupConnections();
    await new Promise<void>(resolve => {
      const t = setTimeout(resolve, 100);
      (t as any).unref?.();
    });

    // Set final status and emit end event
    this.connectionStatus = 'end';
    this.emit('end');
    // Keep isClosing = true to prevent any reconnection attempts
    // Only reset isClosing when explicitly calling connect()
  }

  async close(): Promise<void> {
    // close() is an alias for disconnect() - allows reconnection
    await this.disconnect();
  }

  async waitUntilReady(): Promise<GlideClientType> {
    // If already connected, return immediately
    if (this.connectionStatus === 'connected' && this.glideClient) {
      return this.glideClient;
    }

    // If currently connecting, wait for the connection to complete
    if (this.connectionStatus === 'connecting') {
      return new Promise((resolve, reject) => {
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

    // If disconnected, this method should not auto-connect
    // Instead, it should wait for an external connect() call
    throw new Error('Client is disconnected. Call connect() first.');
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
      // Auto-connect if not connected (ioredis behavior)
      if (!this.glideClient) {
        await this.connect();
      }
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

      // Normalize parameters for GLIDE - apply keyPrefix to keys
      const normalizedKeys = keys.map(k => {
        if (k === null || k === undefined) return '';
        // Apply keyPrefix to keys for Lua scripts (ioredis behavior)
        const keyStr = k instanceof Buffer ? k.toString() : String(k);
        return this.normalizeKey(keyStr);
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
        if ('invokeScript' in this.glideClient) {
          const Script = require('@valkey/valkey-glide').Script;
          const script = new Script(lua);
          const result = await (this.glideClient as any).invokeScript(script, {
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
          const result = await (this.glideClient as any).customCommand(
            commandArgs
          );
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
          const result = await (this.glideClient as any).customCommand(
            commandArgs
          );
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

  // ALL Database Commands - Complete Implementation

  // === String Commands ===
  async get(
    key: RedisKey,
    cb?: (err: any, value: string | null) => void
  ): Promise<string | null> {
    const value = await stringCommands.get(this, key);
    if (typeof cb === 'function') {
      try {
        cb(null, value);
      } catch {}
    }
    return value;
  }

  async set(
    key: RedisKey,
    value: RedisValue,
    ...args: any[]
  ): Promise<string | null> {
    let cb: ((err: any, result: string | null) => void) | undefined;
    if (args.length && typeof args[args.length - 1] === 'function') {
      cb = args.pop() as any;
    }
    const result = await stringCommands.set(this, key, value, ...args);
    if (typeof cb === 'function') {
      try {
        cb(null, result);
      } catch {}
    }
    return result;
  }

  async mget(...keysOrArray: any[]): Promise<(string | null)[]> {
    return await stringCommands.mget(this, ...keysOrArray);
  }

  async mset(...argsOrHash: any[]): Promise<string> {
    return await stringCommands.mset(this, ...argsOrHash);
  }
  async msetnx(...argsOrHash: any[]): Promise<number> {
    const keyValuePairs: Record<string, string> = {};
    if (
      argsOrHash.length === 1 &&
      typeof argsOrHash[0] === 'object' &&
      !Array.isArray(argsOrHash[0])
    ) {
      const obj = argsOrHash[0];
      for (const [key, value] of Object.entries(obj)) {
        keyValuePairs[this.normalizeKey(key)] =
          ParameterTranslator.normalizeValue(value as any);
      }
    } else {
      for (let i = 0; i < argsOrHash.length; i += 2) {
        const key = this.normalizeKey(argsOrHash[i]);
        const value = ParameterTranslator.normalizeValue(argsOrHash[i + 1]);
        keyValuePairs[key] = value;
      }
    }

    if ('msetnx' in this.glideClient) {
      const ok = await (this.glideClient as any).msetnx(keyValuePairs);
      return ok ? 1 : 0;
    }
    const result = await (this.glideClient as any).customCommand([
      'MSETNX',
      ...Object.entries(keyValuePairs).flatMap(([k, v]) => [k, v]),
    ]);
    return Number(result) || 0;
  }

  async incr(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    return await this.glideClient.incr(normalizedKey);
  }

  async decr(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    return await this.glideClient.decr(normalizedKey);
  }

  async incrby(key: RedisKey, increment: number): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    return await this.glideClient.incrBy(normalizedKey, increment);
  }

  async decrby(key: RedisKey, decrement: number): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    return await this.glideClient.decrBy(normalizedKey, decrement);
  }

  async incrbyfloat(key: RedisKey, increment: number): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const result = await this.glideClient.incrByFloat(normalizedKey, increment);
    return parseFloat(result.toString());
  }

  async append(key: RedisKey, value: RedisValue): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await this.glideClient.append(normalizedKey, normalizedValue);
  }

  async strlen(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    return await this.glideClient.strlen(normalizedKey);
  }

  async getrange(key: RedisKey, start: number, end: number): Promise<string> {
    const normalizedKey = this.normalizeKey(key);
    const result = await this.glideClient.getrange(normalizedKey, start, end);
    return ParameterTranslator.convertGlideString(result) || '';
  }

  async setrange(
    key: RedisKey,
    offset: number,
    value: RedisValue
  ): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await this.glideClient.setrange(
      normalizedKey,
      offset,
      normalizedValue
    );
  }

  async setex(
    key: RedisKey,
    seconds: number,
    value: RedisValue
  ): Promise<string> {
    await this.ensureConnection();
    const normalizedKey = this.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await this.glideClient.set(normalizedKey, normalizedValue, {
      expiry: { type: TimeUnit.Seconds, count: seconds },
    });
    return 'OK';
  }

  async setnx(key: RedisKey, value: RedisValue): Promise<number> {
    await this.ensureConnection();
    const normalizedKey = this.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    const result = await this.glideClient.set(normalizedKey, normalizedValue, {
      conditionalSet: 'onlyIfDoesNotExist',
    });
    return result === 'OK' ? 1 : 0;
  }

  async psetex(
    key: RedisKey,
    milliseconds: number,
    value: RedisValue
  ): Promise<string> {
    await this.ensureConnection();
    const normalizedKey = this.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await this.glideClient.set(normalizedKey, normalizedValue, {
      expiry: { type: TimeUnit.Milliseconds, count: milliseconds },
    });
    return 'OK';
  }

  // === Bit Operations ===
  async setbit(key: RedisKey, offset: number, value: number): Promise<number> {
    return await bitmapCommands.setbit(this, key, offset, value);
  }

  async getbit(key: RedisKey, offset: number): Promise<number> {
    return await bitmapCommands.getbit(this, key, offset);
  }

  async bitcount(key: RedisKey, start?: number, end?: number): Promise<number> {
    return await bitmapCommands.bitcount(this, key, start, end);
  }
  async bitpos(
    key: RedisKey,
    bit: number,
    start?: number,
    end?: number
  ): Promise<number> {
    return await bitmapCommands.bitpos(this, key, bit, start, end);
  }

  async bitop(
    operation: 'AND' | 'OR' | 'XOR' | 'NOT',
    destkey: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    return await bitmapCommands.bitop(this, operation, destkey, ...keys);
  }

  // === Key Commands ===
  async del(...keys: RedisKey[]): Promise<number> {
    return await keyCommands.del(this, ...keys);
  }

  async exists(...keys: RedisKey[]): Promise<number> {
    return await keyCommands.exists(this, ...keys);
  }

  async persist(key: RedisKey): Promise<number> {
    return await keyCommands.persist(this, key);
  }

  async type(key: RedisKey): Promise<string> {
    return await keyCommands.type(this, key);
  }

  // === Script Commands ===
  // Script cache is managed in src/commands/scripting.ts

  async eval(
    script: string,
    numKeys: number,
    ...keysAndArgs: any[]
  ): Promise<any> {
    return await scriptingCommands.evalScript(
      this,
      script,
      numKeys,
      ...keysAndArgs
    );
  }

  async evalsha(
    sha1: string,
    numKeys: number,
    ...keysAndArgs: any[]
  ): Promise<any> {
    return await scriptingCommands.evalsha(this, sha1, numKeys, ...keysAndArgs);
  }

  async scriptLoad(script: string): Promise<string> {
    return await scriptingCommands.scriptLoad(this, script);
  }

  async expire(key: RedisKey, seconds: number): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const result = await this.glideClient.expire(normalizedKey, seconds);
    return result ? 1 : 0;
  }

  async pexpire(key: RedisKey, milliseconds: number): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const result = await this.glideClient.pexpire(normalizedKey, milliseconds);
    return result ? 1 : 0;
  }

  async ttl(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const result = await this.glideClient.ttl(normalizedKey);
    return Number(result);
  }

  async pttl(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKey(key);
    const result = await this.glideClient.pttl(normalizedKey);
    return Number(result);
  }

  async scan(cursor: string, ...args: string[]): Promise<[string, string[]]> {
    const scanArgs = [cursor, ...args];
    const result = await this.glideClient.customCommand(['SCAN', ...scanArgs]);

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
    const normalizedKey = this.normalizeKey(key);
    const scanArgs = [normalizedKey, cursor, ...args];
    const result = await this.glideClient.customCommand(['HSCAN', ...scanArgs]);

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
    const normalizedKey = this.normalizeKey(key);
    const scanArgs = [normalizedKey, cursor, ...args];
    const result = await this.glideClient.customCommand(['SSCAN', ...scanArgs]);

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
    const normalizedKey = this.normalizeKey(key);
    const scanArgs = [normalizedKey, cursor, ...args];
    const result = await this.glideClient.customCommand(['ZSCAN', ...scanArgs]);

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
    return await hashCommands.hget(this, key, field);
  }

  async hset(key: RedisKey, ...args: any[]): Promise<number> {
    return await hashCommands.hset(this, key, ...args);
  }

  async hgetall(key: RedisKey): Promise<Record<string, string>> {
    return await hashCommands.hgetall(this, key);
  }

  async hmset(key: RedisKey, ...args: any[]): Promise<string> {
    return await hashCommands.hmset(this, key, ...args);
  }

  async hmget(
    key: RedisKey,
    ...fieldsOrArray: any[]
  ): Promise<(string | null)[]> {
    return await hashCommands.hmget(this, key, ...fieldsOrArray);
  }

  async hdel(key: RedisKey, ...fields: string[]): Promise<number> {
    return await hashCommands.hdel(this, key, ...fields);
  }

  async hexists(key: RedisKey, field: string): Promise<number> {
    return await hashCommands.hexists(this, key, field);
  }

  async hkeys(key: RedisKey): Promise<string[]> {
    return await hashCommands.hkeys(this, key);
  }

  async hvals(key: RedisKey): Promise<string[]> {
    return await hashCommands.hvals(this, key);
  }
  async hstrlen(key: RedisKey, field: string): Promise<number> {
    return await hashCommands.hstrlen(this, key, field);
  }

  async hrandfield(
    key: RedisKey,
    count?: number,
    withValues?: 'WITHVALUES'
  ): Promise<string | string[] | Array<string | number> | null> {
    return await hashCommands.hrandfield(this, key, count, withValues as any);
  }

  async hlen(key: RedisKey): Promise<number> {
    return await hashCommands.hlen(this, key);
  }

  async hincrby(
    key: RedisKey,
    field: string,
    increment: number
  ): Promise<number> {
    return await hashCommands.hincrby(this, key, field, increment);
  }

  async hincrbyfloat(
    key: RedisKey,
    field: string,
    increment: number
  ): Promise<number> {
    return await hashCommands.hincrbyfloat(this, key, field, increment);
  }

  async hsetnx(
    key: RedisKey,
    field: string,
    value: RedisValue
  ): Promise<number> {
    return await hashCommands.hsetnx(this, key, field, value);
  }

  // === ZSet Commands ===
  async zadd(key: RedisKey, ...args: any[]): Promise<number> {
    return await zsetCommands.zadd(this, key, ...args);
  }

  async zrem(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    return await zsetCommands.zrem(this, key, ...members);
  }

  async zcard(key: RedisKey): Promise<number> {
    return await zsetCommands.zcard(this, key);
  }

  async zscore(key: RedisKey, member: RedisValue): Promise<string | null> {
    return await zsetCommands.zscore(this, key, member);
  }

  async zmscore(
    key: RedisKey,
    members: RedisValue[]
  ): Promise<(string | null)[]> {
    return await zsetCommands.zmscore(this, key, members);
  }

  async zrank(key: RedisKey, member: RedisValue): Promise<number | null> {
    return await zsetCommands.zrank(this, key, member);
  }

  async zrevrank(key: RedisKey, member: RedisValue): Promise<number | null> {
    return await zsetCommands.zrevrank(this, key, member);
  }

  async zrange(
    key: RedisKey,
    start: number,
    stop: number,
    withScores?: boolean
  ): Promise<string[]> {
    return await zsetCommands.zrange(this, key, start, stop, withScores);
  }

  async zrevrange(
    key: RedisKey,
    start: number,
    stop: number,
    withScores?: boolean
  ): Promise<string[]> {
    return await zsetCommands.zrevrange(this, key, start, stop, withScores);
  }

  async zrangebyscore(
    key: RedisKey,
    min: string | number,
    max: string | number,
    ...args: string[]
  ): Promise<string[]> {
    const normalizedKey = this.normalizeKey(key);

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
        ? await this.glideClient.zrangeWithScores(normalizedKey, rangeQuery)
        : await this.glideClient.zrange(normalizedKey, rangeQuery);

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
      throw error;
    }
  }

  async zrevrangebyscore(
    key: RedisKey,
    max: string | number,
    min: string | number,
    ...args: string[]
  ): Promise<string[]> {
    const normalizedKey = this.normalizeKey(key);

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
        ? await this.glideClient.zrangeWithScores(normalizedKey, rangeQuery)
        : await this.glideClient.zrange(normalizedKey, rangeQuery);

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
      throw error;
    }
  }

  async zrangebylex(
    key: RedisKey,
    min: string,
    max: string,
    ...args: string[]
  ): Promise<string[]> {
    return await zsetCommands.zrangebylex(this, key, min, max, ...args);
  }

  async zrevrangebylex(
    key: RedisKey,
    max: string,
    min: string,
    ...args: string[]
  ): Promise<string[]> {
    return await zsetCommands.zrevrangebylex(this, key, max, min, ...args);
  }

  async zpopmin(key: RedisKey, count?: number): Promise<string[]> {
    return await zsetCommands.zpopmin(this, key, count);
  }

  async zpopmax(key: RedisKey, count?: number): Promise<string[]> {
    return await zsetCommands.zpopmax(this, key, count);
  }

  async zrandmember(
    key: RedisKey,
    count?: number,
    withScores?: 'WITHSCORES'
  ): Promise<string | string[]> {
    return await zsetCommands.zrandmember(
      this,
      key,
      count,
      withScores === 'WITHSCORES'
    );
  }

  async zunionstore(
    destination: RedisKey,
    numKeys: number,
    ...args: any[]
  ): Promise<number> {
    return await zsetCommands.zunionstore(this, destination, numKeys, ...args);
  }

  async zinterstore(
    destination: RedisKey,
    numKeys: number,
    ...args: any[]
  ): Promise<number> {
    return await zsetCommands.zinterstore(this, destination, numKeys, ...args);
  }

  async zdiffstore(
    destination: RedisKey,
    numKeys: number,
    ...args: any[]
  ): Promise<number> {
    return await zsetCommands.zdiffstore(this, destination, numKeys, ...args);
  }

  async zunion(...args: any[]): Promise<string[] | string[]> {
    return await zsetCommands.zunion(this, ...args);
  }

  async zinter(...args: any[]): Promise<string[] | string[]> {
    return await zsetCommands.zinter(this, ...args);
  }

  async zdiff(...args: any[]): Promise<string[] | string[]> {
    return await zsetCommands.zdiff(this, ...args);
  }

  // BullMQ-critical blocking commands
  async bzpopmin(...args: any[]): Promise<[string, string, string] | null> {
    let keys: RedisKey[];
    let timeout: number;

    // Handle parameter order: keys first, timeout last
    if (typeof args[args.length - 1] === 'number') {
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else {
      throw new Error('Invalid bzpopmin arguments: timeout must be provided');
    }

    const normalizedKeys = keys.map(k => this.normalizeKey(k));

    // Use native GLIDE method instead of customCommand
    const result = await this.glideClient.bzpopmin(normalizedKeys, timeout);

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
    let keys: RedisKey[];
    let timeout: number;

    if (typeof args[args.length - 1] === 'number') {
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else {
      throw new Error('Invalid bzpopmax arguments: timeout must be provided');
    }

    const normalizedKeys = keys.map(k => this.normalizeKey(k));
    const result = await (this.glideClient as any).bzpopmax(
      normalizedKeys,
      timeout
    );

    if (Array.isArray(result) && result.length === 3) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || '',
        result[2].toString(),
      ];
    }

    return null;
  }

  async zremrangebyscore(
    key: RedisKey,
    min: string | number,
    max: string | number
  ): Promise<number> {
    return await zsetCommands.zremrangebyscore(this, key, min, max);
  }

  async zincrby(
    key: RedisKey,
    increment: number,
    member: RedisValue
  ): Promise<string> {
    return await zsetCommands.zincrby(this, key, increment, member);
  }

  async zcount(
    key: RedisKey,
    min: number | string,
    max: number | string
  ): Promise<number> {
    return await zsetCommands.zcount(this, key, min, max);
  }

  async zremrangebyrank(
    key: RedisKey,
    start: number,
    stop: number
  ): Promise<number> {
    return await zsetCommands.zremrangebyrank(this, key, start, stop);
  }

  // === Set Commands ===
  async sadd(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    return await setCommands.sadd(this, key, ...members);
  }

  async srem(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    return await setCommands.srem(this, key, ...members);
  }

  async scard(key: RedisKey): Promise<number> {
    return await setCommands.scard(this, key);
  }

  async sismember(key: RedisKey, member: RedisValue): Promise<number> {
    return await setCommands.sismember(this, key, member);
  }

  async smismember(key: RedisKey, members: RedisValue[]): Promise<number[]> {
    return await setCommands.smismember(this, key, members);
  }

  async smembers(key: RedisKey): Promise<string[]> {
    return await setCommands.smembers(this, key);
  }

  async sinter(...keys: RedisKey[]): Promise<string[]> {
    return await setCommands.sinter(this, ...keys);
  }

  async sinterstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    return await setCommands.sinterstore(this, destination, ...keys);
  }

  async sdiff(...keys: RedisKey[]): Promise<string[]> {
    return await setCommands.sdiff(this, ...keys);
  }

  async sdiffstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    return await setCommands.sdiffstore(this, destination, ...keys);
  }

  async sunion(...keys: RedisKey[]): Promise<string[]> {
    return await setCommands.sunion(this, ...keys);
  }

  async sunionstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    return await setCommands.sunionstore(this, destination, ...keys);
  }

  async spop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    return await setCommands.spop(this, key, count);
  }

  async srandmember(
    key: RedisKey,
    count?: number
  ): Promise<string | string[] | null> {
    return await setCommands.srandmember(this, key, count);
  }

  // SORT (basic mapping using GLIDE options)
  async sort(key: RedisKey, ...args: any[]): Promise<(string | null)[]> {
    const normalizedKey = this.normalizeKey(key);
    // Parse ioredis style: [BY pattern] [LIMIT offset count] [GET pattern ...] [ASC|DESC] [ALPHA]
    const options: any = {};
    for (let i = 0; i < args.length; i++) {
      const token = String(args[i]).toUpperCase();
      if (token === 'BY' && i + 1 < args.length) {
        options.byPattern = String(args[++i]);
      } else if (token === 'LIMIT' && i + 2 < args.length) {
        options.limit = { offset: Number(args[++i]), count: Number(args[++i]) };
      } else if (token === 'GET' && i + 1 < args.length) {
        const pattern = String(args[++i]);
        options.getPatterns = options.getPatterns || [];
        options.getPatterns.push(pattern);
      } else if (token === 'ASC') {
        options.orderBy = 'ASC';
      } else if (token === 'DESC') {
        options.orderBy = 'DESC';
      } else if (token === 'ALPHA') {
        options.isAlpha = true;
      }
    }
    const res = await (this.glideClient as any).sort(normalizedKey, options);
    return res.map((v: any) => ParameterTranslator.convertGlideString(v));
  }

  // === List Commands ===
  async lpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, ...args: any[]): Promise<number> {
    return await listCommands.lpush(this, key, ...args);
  }

  async rpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, ...args: any[]): Promise<number> {
    return await listCommands.rpush(this, key, ...args);
  }

  async lpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    return await listCommands.lpop(this, key, count);
  }

  async rpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    return await listCommands.rpop(this, key, count);
  }

  async llen(key: RedisKey): Promise<number> {
    return await listCommands.llen(this, key);
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    return await listCommands.lrange(this, key, start, stop);
  }

  async ltrim(key: RedisKey, start: number, stop: number): Promise<string> {
    return await listCommands.ltrim(this, key, start, stop);
  }

  async lindex(key: RedisKey, index: number): Promise<string | null> {
    return await listCommands.lindex(this, key, index);
  }

  async lset(key: RedisKey, index: number, value: RedisValue): Promise<string> {
    return await listCommands.lset(this, key, index, value);
  }

  async lrem(key: RedisKey, count: number, value: RedisValue): Promise<number> {
    return await listCommands.lrem(this, key, count, value);
  }

  async lpushx(key: RedisKey, ...elements: RedisValue[]): Promise<number> {
    return await listCommands.lpushx(this, key, ...elements);
  }

  async rpushx(key: RedisKey, ...elements: RedisValue[]): Promise<number> {
    return await listCommands.rpushx(this, key, ...elements);
  }

  async linsert(
    key: RedisKey,
    direction: 'BEFORE' | 'AFTER',
    pivot: RedisValue,
    element: RedisValue
  ): Promise<number> {
    return await listCommands.linsert(this, key, direction, pivot, element);
  }

  async rpoplpush(
    source: RedisKey,
    destination: RedisKey
  ): Promise<string | null> {
    return await listCommands.rpoplpush(this, source, destination);
  }

  // Blocking operations - critical for queue systems
  async blpop(...args: any[]): Promise<[string, string] | null> {
    await this.ensureConnection();
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

    const result = await this.glideClient.blpop(normalizedKeys, timeout);

    if (Array.isArray(result) && result.length === 2) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || '',
      ];
    }

    return null;
  }

  async brpop(...args: any[]): Promise<[string, string] | null> {
    await this.ensureConnection();
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

    const result = await this.glideClient.brpop(normalizedKeys, timeout);

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
    await this.ensureConnection();
    const normalizedSource = this.normalizeKey(source);
    const normalizedDestination = this.normalizeKey(destination);

    // BRPOPLPUSH is not available in GLIDE, must use customCommand
    const result = await this.glideClient.customCommand([
      'BRPOPLPUSH',
      normalizedSource,
      normalizedDestination,
      timeout.toString(),
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  // === Transaction/Script Commands ===
  async script(subcommand: string, ...args: any[]): Promise<any> {
    return await scriptingCommands.script(this, subcommand, ...args);
  }

  // WATCH method - both GlideClient and GlideClusterClient inherit from BaseClient with same signature
  async watch(...keys: RedisKey[]): Promise<string> {
    const normalizedKeys = keys.map(k => this.normalizeKey(k));
    return await this.glideClient.watch(normalizedKeys);
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
          this.normalizeKey(key),
          ParameterTranslator.normalizeValue(value)
        );
        commandCount++;
        return adapter;
      },
      get: (key: RedisKey) => {
        batch.get(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      mget: (...keys: RedisKey[]) => {
        const normalizedKeys = Array.isArray(keys[0])
          ? (keys[0] as any).map((k: RedisKey) => this.normalizeKey(k))
          : keys.map(k => this.normalizeKey(k));
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
            keyValues[this.normalizeKey(key)] =
              ParameterTranslator.normalizeValue(value as RedisValue);
          }
        } else {
          // Array format: mset('key1', 'val1', 'key2', 'val2')
          keyValues = {};
          for (let i = 0; i < args.length; i += 2) {
            const key = this.normalizeKey(args[i]);
            const value = ParameterTranslator.normalizeValue(args[i + 1]);
            keyValues[key] = value;
          }
        }
        batch.mset(keyValues);
        commandCount++;
        return adapter;
      },
      del: (...keys: RedisKey[]) => {
        batch.del(keys.map(k => this.normalizeKey(k)));
        commandCount++;
        return adapter;
      },
      exists: (...keys: RedisKey[]) => {
        batch.exists(keys.map(k => this.normalizeKey(k)));
        commandCount++;
        return adapter;
      },
      expire: (key: RedisKey, seconds: number) => {
        batch.expire(this.normalizeKey(key), seconds);
        commandCount++;
        return adapter;
      },
      pexpire: (key: RedisKey, milliseconds: number) => {
        batch.pexpire(this.normalizeKey(key), milliseconds);
        commandCount++;
        return adapter;
      },
      ttl: (key: RedisKey) => {
        batch.ttl(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      pttl: (key: RedisKey) => {
        batch.pttl(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // Hash commands
      hset: (key: RedisKey, ...args: any[]) => {
        const normalizedKey = this.normalizeKey(key);
        const fieldValues = ParameterTranslator.parseHashSetArgs(args);
        batch.hset(normalizedKey, fieldValues);
        commandCount++;
        return adapter;
      },
      hget: (key: RedisKey, field: string) => {
        batch.hget(this.normalizeKey(key), field);
        commandCount++;
        return adapter;
      },
      hgetall: (key: RedisKey) => {
        batch.hgetall(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // List commands
      lpush: (key: RedisKey, ...elements: RedisValue[]) => {
        const normalizedKey = this.normalizeKey(key);
        const normalizedElements = elements.map(e =>
          ParameterTranslator.normalizeValue(e)
        );
        batch.lpush(normalizedKey, normalizedElements);
        commandCount++;
        return adapter;
      },
      lpushx: (key: RedisKey, ...elements: RedisValue[]) => {
        const normalizedKey = this.normalizeKey(key);
        const normalizedElements = elements.map(e =>
          ParameterTranslator.normalizeValue(e)
        );
        batch.customCommand(['LPUSHX', normalizedKey, ...normalizedElements]);
        commandCount++;
        return adapter;
      },
      rpop: (key: RedisKey) => {
        batch.rpop(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      rpush: (key: RedisKey, ...elements: RedisValue[]) => {
        const normalizedKey = this.normalizeKey(key);
        const normalizedElements = elements.map(e =>
          ParameterTranslator.normalizeValue(e)
        );
        batch.rpush(normalizedKey, normalizedElements);
        commandCount++;
        return adapter;
      },
      rpushx: (key: RedisKey, ...elements: RedisValue[]) => {
        const normalizedKey = this.normalizeKey(key);
        const normalizedElements = elements.map(e =>
          ParameterTranslator.normalizeValue(e)
        );
        batch.customCommand(['RPUSHX', normalizedKey, ...normalizedElements]);
        commandCount++;
        return adapter;
      },
      lpop: (key: RedisKey) => {
        batch.lpop(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      llen: (key: RedisKey) => {
        batch.llen(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      lrange: (key: RedisKey, start: number, stop: number) => {
        batch.lrange(this.normalizeKey(key), start, stop);
        commandCount++;
        return adapter;
      },
      lrem: (key: RedisKey, count: number, element: RedisValue) => {
        batch.lrem(
          this.normalizeKey(key),
          count,
          ParameterTranslator.normalizeValue(element)
        );
        commandCount++;
        return adapter;
      },
      ltrim: (key: RedisKey, start: number, stop: number) => {
        batch.ltrim(this.normalizeKey(key), start, stop);
        commandCount++;
        return adapter;
      },

      // Sorted Set commands (critical for BullMQ priorities/delays)
      zadd: (key: RedisKey, ...args: any[]) => {
        const normalizedKey = this.normalizeKey(key);
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
        const normalizedKey = this.normalizeKey(key);
        const normalizedMembers = members.map(m =>
          ParameterTranslator.normalizeValue(m)
        );
        batch.zrem(normalizedKey, normalizedMembers);
        commandCount++;
        return adapter;
      },
      zremrangebyscore: (
        key: RedisKey,
        min: string | number,
        max: string | number
      ) => {
        const normalizedKey = this.normalizeKey(key);

        // Parse min boundary
        let minBoundary: any;
        if (typeof min === 'string') {
          if (min.startsWith('(')) {
            minBoundary = {
              value: parseFloat(min.slice(1)),
              isInclusive: false,
            };
          } else if (min === '-inf') {
            minBoundary = InfBoundary.NegativeInfinity;
          } else {
            minBoundary = { value: parseFloat(min), isInclusive: true };
          }
        } else {
          minBoundary = { value: min, isInclusive: true };
        }

        // Parse max boundary
        let maxBoundary: any;
        if (typeof max === 'string') {
          if (max.startsWith('(')) {
            maxBoundary = {
              value: parseFloat(max.slice(1)),
              isInclusive: false,
            };
          } else if (max === '+inf' || max === 'inf') {
            maxBoundary = InfBoundary.PositiveInfinity;
          } else {
            maxBoundary = { value: parseFloat(max), isInclusive: true };
          }
        } else {
          maxBoundary = { value: max, isInclusive: true };
        }

        batch.zremRangeByScore(normalizedKey, minBoundary, maxBoundary);
        commandCount++;
        return adapter;
      },
      zremrangebyrank: (key: RedisKey, start: number, stop: number) => {
        const normalizedKey = this.normalizeKey(key);
        batch.zremRangeByRank(normalizedKey, start, stop);
        commandCount++;
        return adapter;
      },
      zrange: (key: RedisKey, start: number, stop: number) => {
        batch.zrange(this.normalizeKey(key), {
          start,
          end: stop,
        });
        commandCount++;
        return adapter;
      },
      zrevrange: (key: RedisKey, start: number, stop: number) => {
        // GLIDE batch might not support zrevrange, use customCommand
        const normalizedKey = this.normalizeKey(key);
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
        batch.zcard(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      zcount: (key: RedisKey, min: string | number, max: string | number) => {
        batch.zcount(this.normalizeKey(key), {
          min: String(min),
          max: String(max),
        });
        commandCount++;
        return adapter;
      },

      // Set commands
      sadd: (key: RedisKey, ...members: RedisValue[]) => {
        const normalizedKey = this.normalizeKey(key);
        const normalizedMembers = members.map(m =>
          ParameterTranslator.normalizeValue(m)
        );
        batch.sadd(normalizedKey, normalizedMembers);
        commandCount++;
        return adapter;
      },
      srem: (key: RedisKey, ...members: RedisValue[]) => {
        const normalizedKey = this.normalizeKey(key);
        const normalizedMembers = members.map(m =>
          ParameterTranslator.normalizeValue(m)
        );
        batch.srem(normalizedKey, normalizedMembers);
        commandCount++;
        return adapter;
      },
      smembers: (key: RedisKey) => {
        batch.smembers(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      scard: (key: RedisKey) => {
        batch.scard(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // Additional hash commands
      hdel: (key: RedisKey, ...fields: string[]) => {
        batch.hdel(this.normalizeKey(key), fields);
        commandCount++;
        return adapter;
      },
      hlen: (key: RedisKey) => {
        batch.hlen(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      hkeys: (key: RedisKey) => {
        batch.hkeys(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      hvals: (key: RedisKey) => {
        batch.hvals(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },

      // String commands
      incr: (key: RedisKey) => {
        batch.incr(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      decr: (key: RedisKey) => {
        batch.decr(this.normalizeKey(key));
        commandCount++;
        return adapter;
      },
      incrby: (key: RedisKey, increment: number) => {
        batch.incrby(this.normalizeKey(key), increment);
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
          // Ensure connection before executing
          await this.ensureConnection();

          // Handle discarded pipeline/transaction
          if (discarded) {
            return []; // ioredis returns empty array for discarded pipeline
          }

          // Handle empty pipeline/batch
          if (commandCount === 0) {
            return []; // ioredis returns empty array for empty pipeline
          }

          const result = await this.glideClient.exec(batch, false); // Don't raise on error

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
          throw error;
        }
      },
    };

    return adapter;
  }

  // Connection info
  async ping(message?: string): Promise<string> {
    await this.ensureConnection();
    const options = message ? { message } : undefined;
    const result = await this.glideClient.ping(options);
    return ParameterTranslator.convertGlideString(result) || 'PONG';
  }

  // Database selection (ioredis compatibility) without customCommand
  async select(db: number): Promise<'OK'> {
    // Update options and reconnect to apply the databaseId
    (this.options as any).db = db;
    try {
      await this.quit();
    } catch {}
    await this.connect();
    return 'OK';
  }

  async info(section?: string): Promise<string> {
    return await serverCommands.info(this, section);
  }

  // XINFO dispatcher for ioredis-compatible API
  async xinfo(subcommand: string, ...args: any[]): Promise<any> {
    const sub = String(subcommand).toUpperCase();
    if (sub === 'STREAM') {
      const [key, full] = args;
      const info = await streamCommands.xinfoStream(this, key, full);
      // Convert object map to array of [field, value] pairs for ioredis compatibility
      if (info && typeof info === 'object' && !Array.isArray(info)) {
        const arr: any[] = [];
        for (const [k, v] of Object.entries(info)) arr.push(k, v as any);
        return arr;
      }
      return info;
    } else if (sub === 'GROUPS') {
      const [key] = args;
      const groups = await streamCommands.xinfoGroups(this, key);
      // ioredis returns each group as an array of [field, value]
      return (groups || []).map((g: any) => {
        const obj: any = {
          name: g.name || g.groupName || g.id || g.GroupName || 'group',
          ...g,
        };
        const arr: any[] = [];
        for (const [k, v] of Object.entries(obj)) arr.push(k, v as any);
        return arr;
      });
    } else if (sub === 'CONSUMERS') {
      const [key, group] = args;
      const consumers = await streamCommands.xinfoConsumers(this, key, group);
      // ioredis returns each consumer as an array of [field, value]
      return (consumers || []).map((c: any) => {
        const arr: any[] = [];
        for (const [k, v] of Object.entries(c)) arr.push(k, v as any);
        return arr;
      });
    }
    // Fallback to raw command
    const command = ['XINFO', sub, ...args.map(a => String(a))];
    return await (this.glideClient as any).customCommand(command);
  }

  // CLIENT command support (critical for BullMQ)
  async client(subcommand: string, ...args: any[]): Promise<any> {
    return await serverCommands.client(this, subcommand, ...args);
  }

  async clientId(): Promise<number> {
    return await serverCommands.clientId(this);
  }

  async configGet(parameter: string | string[]): Promise<string[]> {
    return await serverCommands.configGet(this, parameter);
  }

  async configSet(map: Record<string, string>): Promise<'OK'> {
    return await serverCommands.configSet(this, map);
  }

  async configRewrite(): Promise<'OK'> {
    return await serverCommands.configRewrite(this);
  }

  async configResetStat(): Promise<'OK'> {
    return await serverCommands.configResetStat(this);
  }

  // Database management commands (critical for BullMQ cleanup)
  async flushall(mode?: 'SYNC' | 'ASYNC'): Promise<string> {
    return await serverCommands.flushall(this, mode);
  }

  async flushdb(mode?: 'SYNC' | 'ASYNC'): Promise<string> {
    return await serverCommands.flushdb(this, mode);
  }

  // === JSON Commands (ValkeyJSON compatible) ===
  async jsonSet(
    key: RedisKey,
    path: string,
    value: any,
    options?: 'NX' | 'XX'
  ): Promise<string | null> {
    const normalizedKey = this.normalizeKey(String(key));
    const jsonValue = JSON.stringify(value);
    const args = ['JSON.SET', normalizedKey, path, jsonValue];

    if (options) {
      args.push(options);
    }

    const result = await this.glideClient.customCommand(args);
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
    const normalizedKey = this.normalizeKey(String(key));
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

    const result = await this.glideClient.customCommand(args);
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
    const normalizedKey = this.normalizeKey(String(key));
    const args = ['JSON.DEL', normalizedKey];
    if (path) args.push(path);
    const result = await this.glideClient.customCommand(args);
    return Number(result) || 0;
  }

  async jsonClear(key: RedisKey, path?: string): Promise<number> {
    const normalizedKey = this.normalizeKey(String(key));
    const args = ['JSON.CLEAR', normalizedKey];
    if (path) args.push(path);
    const result = await this.glideClient.customCommand(args);
    return Number(result) || 0;
  }

  async jsonType(key: RedisKey, path?: string): Promise<string | null> {
    const normalizedKey = this.normalizeKey(String(key));
    const args = ['JSON.TYPE', normalizedKey];

    if (path) {
      args.push(path);
    }

    const result = await this.glideClient.customCommand(args);

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
    const normalizedKey = this.normalizeKey(String(key));
    const result = await this.glideClient.customCommand([
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
    const normalizedKey = this.normalizeKey(String(key));
    const result = await this.glideClient.customCommand([
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
    const normalizedKey = this.normalizeKey(String(key));
    const jsonValue = JSON.stringify(value);
    const result = await (this.glideClient as any).customCommand([
      'JSON.STRAPPEND',
      normalizedKey,
      path,
      jsonValue,
    ]);
    return Number(result) || 0;
  }

  async jsonStrLen(key: RedisKey, path?: string): Promise<number | null> {
    const normalizedKey = this.normalizeKey(String(key));
    const args = ['JSON.STRLEN', normalizedKey];
    if (path) args.push(path);
    const result = await (this.glideClient as any).customCommand(args);
    return result !== null ? Number(result) : null;
  }

  async jsonArrAppend(
    key: RedisKey,
    path: string,
    ...values: any[]
  ): Promise<number | null> {
    const normalizedKey = this.normalizeKey(String(key));

    // Simplified approach - always JSON.stringify everything
    const jsonValues = values.map(v => JSON.stringify(v));

    const result = await (this.glideClient as any).customCommand([
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
    const normalizedKey = String(key);
    const jsonValues = values.map(v =>
      typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)
    );
    const result = await this.glideClient.customCommand([
      'JSON.ARRINSERT',
      normalizedKey,
      path,
      index.toString(),
      ...jsonValues,
    ]);
    return Number(result) || 0;
  }

  async jsonArrLen(key: RedisKey, path?: string): Promise<number | null> {
    const normalizedKey = String(key);
    const args = ['JSON.ARRLEN', normalizedKey];

    if (path) {
      args.push(path);
    }

    try {
      const result = await this.glideClient.customCommand(args);

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
    const normalizedKey = String(key);
    const args = ['JSON.ARRPOP', normalizedKey];
    if (path) args.push(path);
    if (index !== undefined) args.push(index.toString());
    const result = await this.glideClient.customCommand(args);
    return result ? String(result) : null;
  }

  async jsonArrTrim(
    key: RedisKey,
    path: string,
    start: number,
    stop: number
  ): Promise<number | null> {
    const normalizedKey = String(key);
    const result = await this.glideClient.customCommand([
      'JSON.ARRTRIM',
      normalizedKey,
      path,
      start.toString(),
      stop.toString(),
    ]);
    return Number(result) || 0;
  }

  async jsonObjKeys(key: RedisKey, path?: string): Promise<string[] | null> {
    const normalizedKey = String(key);
    const args = ['JSON.OBJKEYS', normalizedKey];

    if (path) {
      args.push(path);
    }

    try {
      const result = await this.glideClient.customCommand(args);

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
    const normalizedKey = String(key);
    const args = ['JSON.OBJLEN', normalizedKey];
    if (path) args.push(path);
    const result = await this.glideClient.customCommand(args);
    return result !== null ? Number(result) : null;
  }

  async jsonToggle(key: RedisKey, path: string): Promise<number> {
    const normalizedKey = String(key);
    const result = await this.glideClient.customCommand([
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
    const normalizedKey = String(key);
    const args = ['JSON.DEBUG', subcommand, normalizedKey];
    if (path) args.push(path);
    return await this.glideClient.customCommand(args);
  }

  async jsonForget(key: RedisKey, path?: string): Promise<number> {
    // JSON.FORGET is alias for JSON.DEL
    const normalizedKey = String(key);
    const args = ['JSON.DEL', normalizedKey];
    if (path) args.push(path);
    const result = await this.glideClient.customCommand(args);
    return Number(result) || 0;
  }

  async jsonResp(key: RedisKey, path?: string): Promise<any> {
    const normalizedKey = String(key);
    const args = ['JSON.RESP', normalizedKey];
    if (path) args.push(path);
    return await this.glideClient.customCommand(args);
  }

  // === Pub/Sub Commands - Dual Architecture ===

  /**
   * Setup event forwarding from IoredisPubSubClient (only once)
   * @private
   */
  private setupPubSubEventForwarding(): void {
    if (!this.ioredisCompatiblePubSub) return;
    
    // Check if we've already set up forwarding
    if ((this.ioredisCompatiblePubSub as any)._forwardingSetup) return;
    
    // Forward events from IoredisPubSubClient to this client
    this.ioredisCompatiblePubSub.on(
      'message',
      (channel: string, message: string) => {
        this.emit('message', channel, message);
      }
    );
    
    // Forward binary message events for Socket.IO compatibility
    this.ioredisCompatiblePubSub.on(
      'messageBuffer',
      (channel: string, message: Buffer) => {
        this.emit('messageBuffer', channel, message);
      }
    );
    
    // Forward pattern message events
    this.ioredisCompatiblePubSub.on(
      'pmessage',
      (pattern: string, channel: string, message: string) => {
        this.emit('pmessage', pattern, channel, message);
      }
    );
    
    this.ioredisCompatiblePubSub.on(
      'pmessageBuffer',
      (pattern: string, channel: string, message: Buffer) => {
        this.emit('pmessageBuffer', pattern, channel, message);
      }
    );
    
    // Mark as set up to prevent duplicate forwarding
    (this.ioredisCompatiblePubSub as any)._forwardingSetup = true;
  }

  /**
   * Subscribe to channels using dual pub/sub architecture:
   *
   * 1. Direct GLIDE Mode (default): High-performance native callbacks, text messages only
   * 2. ioredis-Compatible Mode: Full binary support via direct TCP, Socket.IO compatible
   *
   * Mode is controlled by `options.enableEventBasedPubSub` flag
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

          this.setupPubSubEventForwarding();
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
   * Subscribe to patterns using dual pub/sub architecture
   * Same architecture as subscribe() - uses GLIDE native or ioredis-compatible mode
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

          this.setupPubSubEventForwarding();
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
          const t = setTimeout(resolve, 0);
          (t as any).unref?.();
        });
      } catch (error) {
        // Ignore close errors
      }
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
              // ioredis-compatible: pmessageBuffer(pattern, channel, message)
              this.emit('pmessageBuffer', pattern, channel, messageBuffer);
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
    return await this.createClient(this.options);
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
    return await serverCommands.config(this, action, parameter);
  }

  async dbsize(): Promise<number> {
    return await serverCommands.dbsize(this);
  }

  async memory(subcommand: string, ...args: (string | number)[]): Promise<any> {
    return await serverCommands.memory(this, subcommand, ...args);
  }

  async slowlog(
    subcommand: string,
    ...args: (string | number)[]
  ): Promise<any> {
    return await serverCommands.slowlog(this, subcommand, ...args);
  }

  async debug(subcommand: string, ...args: (string | number)[]): Promise<any> {
    return await serverCommands.debug(this, subcommand, ...args);
  }

  async echo(message: string): Promise<string> {
    return await serverCommands.echo(this, message);
  }

  async time(): Promise<[string, string]> {
    return await serverCommands.time(this);
  }

  async lastsave(): Promise<number> {
    return await serverCommands.lastsave(this);
  }

  // monitor is a special streaming command; expose basic passthrough to maintain compatibility
  async monitor(): Promise<'OK'> {
    return await serverCommands.monitor(this);
  }

  async save(): Promise<'OK'> {
    return await serverCommands.save(this);
  }

  async bgsave(): Promise<string> {
    return await serverCommands.bgsave(this);
  }

  // Stream commands
  async xadd(key: RedisKey, ...args: any[]): Promise<string | null> {
    return await streamCommands.xadd(this, key, ...args);
  }

  async xlen(key: RedisKey): Promise<number> {
    return await streamCommands.xlen(this, key);
  }

  async xread(...args: any[]): Promise<any[] | null> {
    return await streamCommands.xread(this, ...args);
  }

  async xrange(
    key: RedisKey,
    start: string = '-',
    end: string = '+',
    ...args: any[]
  ): Promise<any[]> {
    // Handle both xrange(key, start, end, count) and xrange(key, start, end, 'COUNT', count)
    let count: number | undefined;
    if (args.length === 1 && typeof args[0] === 'number') {
      count = args[0];
    } else if (args.length === 2 && String(args[0]).toUpperCase() === 'COUNT') {
      count = Number(args[1]);
    }
    return await streamCommands.xrange(this, key, start, end, count);
  }

  async xrevrange(
    key: RedisKey,
    start: string = '+',
    end: string = '-',
    ...args: any[]
  ): Promise<any[]> {
    // Handle both xrevrange(key, start, end, count) and xrevrange(key, start, end, 'COUNT', count)
    let count: number | undefined;
    if (args.length === 1 && typeof args[0] === 'number') {
      count = args[0];
    } else if (args.length === 2 && String(args[0]).toUpperCase() === 'COUNT') {
      count = Number(args[1]);
    }
    return await streamCommands.xrevrange(this, key, start, end, count);
  }

  // === HyperLogLog Commands ===
  async pfadd(key: RedisKey, ...elements: RedisValue[]): Promise<number> {
    return await hllCommands.pfadd(this, key, ...elements);
  }

  async pfcount(...keys: RedisKey[]): Promise<number> {
    return await hllCommands.pfcount(this, ...keys);
  }

  async pfmerge(destination: RedisKey, ...keys: RedisKey[]): Promise<'OK'> {
    return await hllCommands.pfmerge(this, destination, ...keys);
  }

  async xdel(key: RedisKey, ...ids: string[]): Promise<number> {
    return await streamCommands.xdel(this, key, ...ids);
  }

  async xtrim(key: RedisKey, ...args: any[]): Promise<number> {
    return await streamCommands.xtrim(this, key, ...args);
  }

  async xgroup(
    action: string,
    key: RedisKey,
    group: string,
    ...args: (string | number)[]
  ): Promise<any> {
    return await streamCommands.xgroup(this, action, key, group, ...args);
  }

  async xreadgroup(
    group: string,
    consumer: string,
    ...args: any[]
  ): Promise<any[] | null> {
    return await streamCommands.xreadgroup(this, group, consumer, ...args);
  }

  async xack(key: RedisKey, group: string, ...ids: string[]): Promise<number> {
    return await streamCommands.xack(this, key, group, ...ids);
  }

  async xclaim(
    key: RedisKey,
    group: string,
    consumer: string,
    minIdleTime: number,
    ids: string[] | string,
    ...args: any[]
  ): Promise<any> {
    // Parse ioredis-style options from variadic arguments
    let justId = false;
    let options: any = {};

    for (const arg of args) {
      const upperArg = String(arg).toUpperCase();
      if (upperArg === 'JUSTID') {
        justId = true;
      } else if (upperArg === 'FORCE') {
        options.isForce = true;
      } else if (upperArg === 'IDLE') {
        // Next arg should be the idle time
        const idx = args.indexOf(arg);
        if (idx < args.length - 1) {
          options.idle = Number(args[idx + 1]);
        }
      } else if (upperArg === 'TIME') {
        // Next arg should be the unix time
        const idx = args.indexOf(arg);
        if (idx < args.length - 1) {
          options.idleUnixTime = Number(args[idx + 1]);
        }
      } else if (upperArg === 'RETRYCOUNT') {
        // Next arg should be the retry count
        const idx = args.indexOf(arg);
        if (idx < args.length - 1) {
          options.retryCount = Number(args[idx + 1]);
        }
      }
    }

    if (justId) {
      return await streamCommands.xclaimJustId(
        this,
        key,
        group,
        consumer,
        minIdleTime,
        ids,
        Object.keys(options).length > 0 ? options : undefined
      );
    }

    return await streamCommands.xclaim(
      this,
      key,
      group,
      consumer,
      minIdleTime,
      ids,
      Object.keys(options).length > 0 ? options : undefined
    );
  }

  async xclaimJustId(
    key: RedisKey,
    group: string,
    consumer: string,
    minIdleTime: number,
    ids: string[] | string,
    options?: {
      idle?: number;
      idleUnixTime?: number;
      retryCount?: number;
      isForce?: boolean;
    }
  ): Promise<string[]> {
    return await streamCommands.xclaimJustId(
      this,
      key,
      group,
      consumer,
      minIdleTime,
      ids,
      options
    );
  }

  async xautoclaim(
    key: RedisKey,
    group: string,
    consumer: string,
    minIdleTime: number,
    start: string,
    ...rest: any[]
  ): Promise<any> {
    // Accept (key, group, consumer, minIdleTime, start, 'JUSTID') or (.., start, 'JUSTID', 'COUNT', n)
    const upper = rest.map(a => (typeof a === 'string' ? a.toUpperCase() : a));
    if (upper.includes('JUSTID')) {
      const countIdx = upper.findIndex(a => a === 'COUNT');
      const count =
        countIdx !== -1 && countIdx + 1 < rest.length
          ? Number(rest[countIdx + 1])
          : undefined;
      return await streamCommands.xautoclaimJustId(
        this,
        key,
        group,
        consumer,
        minIdleTime,
        start,
        count
      );
    }
    const countIdx = upper.findIndex(a => a === 'COUNT');
    const count =
      countIdx !== -1 && countIdx + 1 < rest.length
        ? Number(rest[countIdx + 1])
        : undefined;
    return await streamCommands.xautoclaim(
      this,
      key,
      group,
      consumer,
      minIdleTime,
      start,
      count
    );
  }

  async xautoclaimJustId(
    key: RedisKey,
    group: string,
    consumer: string,
    minIdleTime: number,
    start: string,
    count?: number
  ): Promise<[string, string[], string[]?]> {
    return await streamCommands.xautoclaimJustId(
      this,
      key,
      group,
      consumer,
      minIdleTime,
      start,
      count
    );
  }

  async xpending(key: RedisKey, group: string, ...args: any[]): Promise<any> {
    return await streamCommands.xpending(this, key, group, ...args);
  }

  async xinfoConsumers(
    key: RedisKey,
    group: string
  ): Promise<Record<string, any>[]> {
    return await streamCommands.xinfoConsumers(this, key, group);
  }

  async xinfoGroups(key: RedisKey): Promise<Record<string, any>[]> {
    return await streamCommands.xinfoGroups(this, key);
  }

  async xinfoStream(key: RedisKey, full?: boolean | number): Promise<any> {
    return await streamCommands.xinfoStream(this, key, full);
  }

  // === GEO Commands (mapped to GLIDE GEO APIs) ===
  async geoadd(
    key: RedisKey,
    ...args: Array<string | number>
  ): Promise<number> {
    return await geoCommands.geoadd(this, key, ...args);
  }

  async geopos(
    key: RedisKey,
    ...members: string[]
  ): Promise<([number, number] | null)[]> {
    return await geoCommands.geopos(this, key, ...members);
  }

  async geodist(
    key: RedisKey,
    member1: string,
    member2: string,
    unit?: 'm' | 'km' | 'mi' | 'ft'
  ): Promise<string | null> {
    return await geoCommands.geodist(this, key, member1, member2, unit as any);
  }

  async geohash(
    key: RedisKey,
    ...members: string[]
  ): Promise<(string | null)[]> {
    return await geoCommands.geohash(this, key, ...members);
  }

  async geosearch(key: RedisKey, ...args: any[]): Promise<any[]> {
    // Overload to support both token-based Redis syntax and structured options
    if (typeof args[0] === 'string') {
      // Token-based: FROMMEMBER <member> | FROMLONLAT <lon> <lat>, BYRADIUS r unit | BYBOX w h unit, [WITHCOORD] [WITHDIST] [WITHHASH] [COUNT n [ANY]] [ASC|DESC]
      const upper = args.map(a =>
        typeof a === 'string' ? a.toUpperCase() : a
      );
      let idx = 0;
      const fromToken = upper[idx++];
      let from: any = {};
      if (fromToken === 'FROMMEMBER') {
        from.member = String(args[idx++]);
      } else if (fromToken === 'FROMLONLAT') {
        const longitude = Number(args[idx++]);
        const latitude = Number(args[idx++]);
        from = { longitude, latitude };
      } else {
        throw new Error('Invalid geosearch origin');
      }

      const byToken = upper[idx++];
      let by: any = {};
      if (byToken === 'BYRADIUS') {
        by.radius = Number(args[idx++]);
        by.unit = String(args[idx++]);
      } else if (byToken === 'BYBOX') {
        by.width = Number(args[idx++]);
        by.height = Number(args[idx++]);
        by.unit = String(args[idx++]);
      } else {
        throw new Error('Invalid geosearch shape');
      }

      const options: any = {};
      while (idx < args.length) {
        const token = upper[idx];
        if (token === 'WITHCOORD') {
          options.withCoord = true;
          idx++;
        } else if (token === 'WITHDIST') {
          options.withDist = true;
          idx++;
        } else if (token === 'WITHHASH') {
          options.withHash = true;
          idx++;
        } else if (token === 'COUNT') {
          options.count = Number(args[idx + 1]);
          idx += 2;
          if (upper[idx] === 'ANY') {
            options.any = true;
            idx++;
          }
        } else if (token === 'ASC' || token === 'DESC') {
          options.order = token as 'ASC' | 'DESC';
          idx++;
        } else {
          // Unknown token; stop
          break;
        }
      }
      const fromObj = from.member
        ? { member: from.member }
        : { longitude: from.longitude, latitude: from.latitude };
      return await geoCommands.geosearch(this, key, fromObj, by, options);
    }

    // Structured form
    const [from, by, options] = args;
    return await geoCommands.geosearch(this, key, from, by, options);
  }

  async geosearchstore(
    destination: RedisKey,
    source: RedisKey,
    ...args: any[]
  ): Promise<number> {
    if (typeof args[0] === 'string') {
      // Token-based
      const upper = args.map(a =>
        typeof a === 'string' ? a.toUpperCase() : a
      );
      let idx = 0;
      const fromToken = upper[idx++];
      let from: any = {};
      if (fromToken === 'FROMMEMBER') {
        from.member = String(args[idx++]);
      } else if (fromToken === 'FROMLONLAT') {
        from.longitude = Number(args[idx++]);
        from.latitude = Number(args[idx++]);
      } else {
        throw new Error('Invalid geosearchstore origin');
      }
      const byToken = upper[idx++];
      const by: any = {};
      if (byToken === 'BYRADIUS') {
        by.radius = Number(args[idx++]);
        by.unit = String(args[idx++]);
      } else if (byToken === 'BYBOX') {
        by.width = Number(args[idx++]);
        by.height = Number(args[idx++]);
        by.unit = String(args[idx++]);
      } else {
        throw new Error('Invalid geosearchstore shape');
      }
      const options: any = {};
      while (idx < args.length) {
        const token = upper[idx];
        if (token === 'COUNT') {
          options.count = Number(args[idx + 1]);
          idx += 2;
          if (upper[idx] === 'ANY') {
            options.any = true;
            idx++;
          }
        } else if (token === 'ASC' || token === 'DESC') {
          options.order = token as 'ASC' | 'DESC';
          idx++;
        } else if (token === 'STOREDIST') {
          options.storeDist = true;
          idx++;
        } else {
          idx++;
        }
      }
      const fromObj = from.member
        ? { member: from.member }
        : { longitude: from.longitude, latitude: from.latitude };
      return await geoCommands.geosearchstore(
        this,
        destination,
        source,
        fromObj,
        by,
        options
      );
    }
    const [from, by, options] = args;
    return await geoCommands.geosearchstore(
      this,
      destination,
      source,
      from,
      by,
      options
    );
  }

  // Redis-compat GEORADIUS mapped to GEOSEARCH
  async georadius(
    key: RedisKey,
    longitude: number,
    latitude: number,
    radius: number,
    unit: 'm' | 'km' | 'mi' | 'ft',
    ...rest: any[]
  ): Promise<any> {
    // Handle STORE/STOREDIST variants
    const upper = rest.map(a => (typeof a === 'string' ? a.toUpperCase() : a));
    const storeIdx = upper.indexOf('STORE');
    const storeDistIdx = upper.indexOf('STOREDIST');
    const options: any = {};
    if (upper.includes('WITHCOORD')) options.withCoord = true;
    if (upper.includes('WITHDIST')) options.withDist = true;
    if (upper.includes('WITHHASH')) options.withHash = true;
    const countIdx = upper.indexOf('COUNT');
    if (countIdx !== -1 && countIdx + 1 < rest.length) {
      options.count = Number(rest[countIdx + 1]);
    }
    if (upper.includes('ANY')) options.any = true;
    if (upper.includes('ASC')) options.order = 'ASC';
    if (upper.includes('DESC')) options.order = 'DESC';

    if (storeIdx !== -1 || storeDistIdx !== -1) {
      const dest = String(
        rest[(storeIdx !== -1 ? storeIdx : storeDistIdx) + 1]
      );
      const storeOptions = { ...options, storeDist: storeDistIdx !== -1 };
      return await this.geosearchstore(
        dest,
        key,
        'FROMLONLAT',
        longitude,
        latitude,
        'BYRADIUS',
        radius,
        unit,
        ...(storeOptions.order ? [storeOptions.order] : []),
        ...(storeOptions.count
          ? ([
              'COUNT',
              storeOptions.count,
              storeOptions.any ? 'ANY' : undefined,
            ].filter(Boolean) as any[])
          : []),
        storeOptions.storeDist ? 'STOREDIST' : undefined
      );
    }

    return await this.geosearch(
      key,
      'FROMLONLAT',
      longitude,
      latitude,
      'BYRADIUS',
      radius,
      unit,
      ...(options.withDist ? ['WITHDIST'] : []),
      ...(options.withCoord ? ['WITHCOORD'] : []),
      ...(options.withHash ? ['WITHHASH'] : []),
      ...(options.count
        ? (['COUNT', options.count, options.any ? 'ANY' : undefined].filter(
            Boolean
          ) as any[])
        : []),
      options.order ? options.order : undefined
    );
  }

  // Redis-compat GEORADIUSBYMEMBER mapped to GEOSEARCH
  async georadiusbymember(
    key: RedisKey,
    member: string,
    radius: number,
    unit: 'm' | 'km' | 'mi' | 'ft',
    ...rest: any[]
  ): Promise<any> {
    const upper = rest.map(a => (typeof a === 'string' ? a.toUpperCase() : a));
    const storeIdx = upper.indexOf('STORE');
    const storeDistIdx = upper.indexOf('STOREDIST');
    const options: any = {};
    if (upper.includes('WITHCOORD')) options.withCoord = true;
    if (upper.includes('WITHDIST')) options.withDist = true;
    if (upper.includes('WITHHASH')) options.withHash = true;
    const countIdx = upper.indexOf('COUNT');
    if (countIdx !== -1 && countIdx + 1 < rest.length)
      options.count = Number(rest[countIdx + 1]);
    if (upper.includes('ANY')) options.any = true;
    if (upper.includes('ASC')) options.order = 'ASC';
    if (upper.includes('DESC')) options.order = 'DESC';

    if (storeIdx !== -1 || storeDistIdx !== -1) {
      const dest = String(
        rest[(storeIdx !== -1 ? storeIdx : storeDistIdx) + 1]
      );
      const storeOptions = { ...options, storeDist: storeDistIdx !== -1 };
      return await this.geosearchstore(
        dest,
        key,
        'FROMMEMBER',
        member,
        'BYRADIUS',
        radius,
        unit,
        ...(storeOptions.order ? [storeOptions.order] : []),
        ...(storeOptions.count
          ? ([
              'COUNT',
              storeOptions.count,
              storeOptions.any ? 'ANY' : undefined,
            ].filter(Boolean) as any[])
          : []),
        storeOptions.storeDist ? 'STOREDIST' : undefined
      );
    }

    return await this.geosearch(
      key,
      'FROMMEMBER',
      member,
      'BYRADIUS',
      radius,
      unit,
      ...(options.withDist ? ['WITHDIST'] : []),
      ...(options.withCoord ? ['WITHCOORD'] : []),
      ...(options.withHash ? ['WITHHASH'] : []),
      ...(options.count
        ? (['COUNT', options.count, options.any ? 'ANY' : undefined].filter(
            Boolean
          ) as any[])
        : []),
      options.order ? options.order : undefined
    );
  }

  // === Scripting/Server wrappers ===
  async scriptExists(...sha1s: string[]): Promise<number[]> {
    return await scriptingCommands.scriptExists(this, ...sha1s);
  }

  async scriptFlush(mode?: 'SYNC' | 'ASYNC'): Promise<string> {
    return await scriptingCommands.scriptFlush(this, mode);
  }

  async scriptKill(): Promise<string> {
    return await scriptingCommands.scriptKill(this);
  }

  async clientGetName(): Promise<string | null> {
    if ((this.glideClient as any).clientGetName) {
      const res = await (this.glideClient as any).clientGetName();
      return ParameterTranslator.convertGlideString(res);
    }
    const result = await (this.glideClient as any).customCommand([
      'CLIENT',
      'GETNAME',
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  // Generic command execution method (ioredis compatibility)
  async call(
    command: string,
    ...args: (string | number | Buffer)[]
  ): Promise<any> {
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
    return await this.glideClient.customCommand([
      command.toUpperCase(),
      ...commandArgs,
    ]);
  }

  // ioredis compatibility - sendCommand
  async sendCommand(command: any): Promise<any> {
    // Ensure connection is alive
    await this.glideClient.ping();

    // Accept ioredis Command object or raw array
    if (Array.isArray(command)) {
      return await this.glideClient.customCommand(command);
    }

    if (command && typeof command === 'object') {
      const name: string | undefined = command.name || command.command;
      const args: any[] = command.args || command.argv || [];
      if (!name) {
        throw new Error('sendCommand: missing command name');
      }
      const flatArgs = [String(name).toUpperCase(), ...args.map(String)];
      return await this.glideClient.customCommand(flatArgs);
    }

    throw new Error('sendCommand expects an array or a Command-like object');
  }

  // Additional database commands can be added here
  // This base class contains comprehensive database commands for complete compatibility
}

/**
 * DirectGlidePubSub - High-Performance GLIDE Native Pub/Sub
 *
 * Primary implementation of the dual pub/sub architecture using GLIDE's native
 * callback mechanism for maximum performance. Suitable for high-throughput
 * applications with text-only messaging requirements.
 *
 * Features:
 * - Zero-copy message delivery via native callbacks
 * - No polling or event loop overhead
 * - Automatic cluster/standalone detection
 * - Text-only messages (use IoredisPubSubClient for binary data)
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
  glideClient: any;

  constructor(baseClient: BaseClient) {
    this.baseClient = baseClient;
  }

  /**
   * Gracefully shutdown any auxiliary GLIDE clients created for direct pub/sub
   */
  async shutdown(): Promise<void> {
    // Close subscriber client
    if (this.directSubscriberClient) {
      try {
        await new Promise<void>(resolve => {
          this.directSubscriberClient!.close();
          const t = setTimeout(resolve, 0);
          (t as any).unref?.();
        });
      } catch {}
      this.directSubscriberClient = null;
    }

    // Close publisher client
    if (this.directPublisherClient) {
      try {
        (this.directPublisherClient as any)?.close?.();
      } catch {}
      this.directPublisherClient = null;
    }

    // Clear subscription state and callbacks
    this.directChannels.clear();
    this.directPatterns.clear();
    this.directShardedChannels.clear();
    this.directCallbacks.clear();
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
          const t = setTimeout(resolve, 0);
          (t as any).unref?.();
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

  // No transaction methods here; transactions should be performed via BaseClient pipeline/multi

  // ioredis compatibility - sendCommand
  async sendCommand(command: any): Promise<any> {
    // Ensure connection is alive
    await this.glideClient.ping();

    if (Array.isArray(command)) {
      return await this.glideClient.sendCommand(command);
    } else {
      throw new Error('sendCommand expects array format: [command, ...args]');
    }
  }
}
