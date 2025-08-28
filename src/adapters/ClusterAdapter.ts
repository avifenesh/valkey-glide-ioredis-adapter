/**
 * ClusterAdapter Implementation
 * ioredis-compatible cluster client built on valkey-glide with modular command structure
 */

import { BaseClusterAdapter, ClusterOptions } from './BaseClusterAdapter';
import { ClusterStringCommands } from './commands/ClusterStringCommands';
import { ListCommands } from './commands/ListCommands';
import { HashCommands } from './commands/HashCommands';
import { ZSetCommands } from './commands/ZSetCommands';
import { PubSubCommands } from './commands/PubSubCommands';
import { TransactionCommands } from './commands/TransactionCommands';
import {
  Multi,
  Pipeline,
  RedisKey,
  RedisValue,
} from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { MultiAdapter, PipelineAdapter } from './RedisAdapter'; // Import from original for now

export class ClusterAdapter extends BaseClusterAdapter {
  private stringCommands: ClusterStringCommands;
  private listCommands: ListCommands;
  private hashCommands: HashCommands;
  private zsetCommands: ZSetCommands;
  private pubsubCommands: PubSubCommands;
  private transactionCommands: TransactionCommands;

  constructor(options: ClusterOptions = {}) {
    super(options);
    
    // Initialize command modules - note: we reuse the single-node command modules
    // for most operations since they work the same way, just with different client types
    this.stringCommands = new ClusterStringCommands(() => this.ensureConnected());
    this.listCommands = new ListCommands(() => this.ensureConnected() as any);
    this.hashCommands = new HashCommands(() => this.ensureConnected() as any);
    this.zsetCommands = new ZSetCommands(() => this.ensureConnected() as any);
    this.pubsubCommands = new PubSubCommands(() => this.ensureConnected() as any, this.options);
    this.transactionCommands = new TransactionCommands(() => this.ensureConnected() as any);

    // Forward pub/sub events
    this.pubsubCommands.on('message', (channel, message) => this.emit('message', channel, message));
    this.pubsubCommands.on('pmessage', (pattern, channel, message) => this.emit('pmessage', pattern, channel, message));
    this.pubsubCommands.on('subscribe', (channel, count) => this.emit('subscribe', channel, count));
    this.pubsubCommands.on('unsubscribe', (channel, count) => this.emit('unsubscribe', channel, count));
    this.pubsubCommands.on('psubscribe', (pattern, count) => this.emit('psubscribe', pattern, count));
    this.pubsubCommands.on('punsubscribe', (pattern, count) => this.emit('punsubscribe', pattern, count));
  }

  // Factory method for Bull compatibility
  static createClient(type: 'client' | 'subscriber' | 'bclient', options?: ClusterOptions): ClusterAdapter {
    const adapter = new ClusterAdapter(options || {});
    (adapter as any).clientType = type;
    
    if (type === 'bclient') {
      (adapter as any).enableBlockingOps = true;
    }
    
    // For Bull compatibility: return immediately, connect in background
    setImmediate(() => {
      (adapter as any).suppressBackgroundErrors = true;
      adapter.connect().catch(err => {
        adapter.emit('error', err);
      });
    });
    
    return adapter;
  }

  async duplicate(override?: Partial<ClusterOptions>): Promise<ClusterAdapter> {
    const newOptions = { ...this.options, ...override };
    const newAdapter = new ClusterAdapter(newOptions);
    
    // Enable blocking operations if this adapter has them enabled
    if ((this as any).enableBlockingOps) {
      (newAdapter as any).enableBlockingOps = true;
    }
    
    return newAdapter;
  }

  // Pipeline and transactions
  pipeline(): Pipeline {
    // TODO: Implement proper cluster pipeline adapter
    return new PipelineAdapter(this as any);
  }

  multi(): Multi {
    // TODO: Implement proper cluster multi adapter
    return new MultiAdapter(this as any, new Set(this.watchedKeys));
  }

  // Define command method
  defineCommand(name: string, options: { lua: string; numberOfKeys?: number }): void {
    this.transactionCommands.defineCommand(name, options, this);
  }

  // String Commands
  async set(key: RedisKey, value: RedisValue, ...args: any[]): Promise<string | null> {
    return this.stringCommands.set(key, value, ...args);
  }

  async get(key: RedisKey): Promise<string | null> {
    return this.stringCommands.get(key);
  }

  async mget(...keysOrArray: any[]): Promise<(string | null)[]> {
    return this.stringCommands.mget(...keysOrArray);
  }

  async mset(...argsOrHash: any[]): Promise<string> {
    return this.stringCommands.mset(...argsOrHash);
  }

  async incr(key: RedisKey): Promise<number> {
    return this.stringCommands.incr(key);
  }

  async decr(key: RedisKey): Promise<number> {
    return this.stringCommands.decr(key);
  }

  async incrby(key: RedisKey, increment: number): Promise<number> {
    return this.stringCommands.incrby(key, increment);
  }

  async decrby(key: RedisKey, decrement: number): Promise<number> {
    return this.stringCommands.decrby(key, decrement);
  }

  async incrbyfloat(key: RedisKey, increment: number): Promise<number> {
    return this.stringCommands.incrbyfloat(key, increment);
  }

  async append(key: RedisKey, value: RedisValue): Promise<number> {
    return this.stringCommands.append(key, value);
  }

  async strlen(key: RedisKey): Promise<number> {
    return this.stringCommands.strlen(key);
  }

  async getrange(key: RedisKey, start: number, end: number): Promise<string> {
    return this.stringCommands.getrange(key, start, end);
  }

  async setrange(key: RedisKey, offset: number, value: RedisValue): Promise<number> {
    return this.stringCommands.setrange(key, offset, value);
  }

  async setex(key: RedisKey, seconds: number, value: RedisValue): Promise<string> {
    return this.stringCommands.setex(key, seconds, value);
  }

  async setnx(key: RedisKey, value: RedisValue): Promise<number> {
    return this.stringCommands.setnx(key, value);
  }

  async psetex(key: RedisKey, milliseconds: number, value: RedisValue): Promise<string> {
    return this.stringCommands.psetex(key, milliseconds, value);
  }

  // Key commands
  async del(...keys: RedisKey[]): Promise<number> {
    const client = await this.ensureConnected();
    const keyStrings = ParameterTranslator.translateDelArgs(keys);
    return await (client as any).del(keyStrings);
  }

  async exists(...keys: RedisKey[]): Promise<number> {
    const client = await this.ensureConnected();
    const keyStrings = ParameterTranslator.translateExistsArgs(keys);
    return await (client as any).exists(keyStrings);
  }

  async expire(key: RedisKey, seconds: number): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await (client as any).expire(normalizedKey, seconds);
    return result ? 1 : 0;
  }

  async ttl(key: RedisKey): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await (client as any).ttl(normalizedKey);
    return typeof result === 'number' ? result : -2;
  }

  // Hash Commands
  async hset(key: RedisKey, ...args: any[]): Promise<number> {
    return this.hashCommands.hset(key, ...args);
  }

  async hget(key: RedisKey, field: string): Promise<string | null> {
    return this.hashCommands.hget(key, field);
  }

  async hmset(key: RedisKey, ...args: any[]): Promise<string> {
    return this.hashCommands.hmset(key, ...args);
  }

  async hmget(key: RedisKey, ...fieldsOrArray: any[]): Promise<(string | null)[]> {
    return this.hashCommands.hmget(key, ...fieldsOrArray);
  }

  async hgetall(key: RedisKey): Promise<Record<string, string>> {
    return this.hashCommands.hgetall(key);
  }

  async hdel(key: RedisKey, ...fields: string[]): Promise<number> {
    return this.hashCommands.hdel(key, ...fields);
  }

  async hexists(key: RedisKey, field: string): Promise<number> {
    return this.hashCommands.hexists(key, field);
  }

  async hkeys(key: RedisKey): Promise<string[]> {
    return this.hashCommands.hkeys(key);
  }

  async hvals(key: RedisKey): Promise<string[]> {
    return this.hashCommands.hvals(key);
  }

  async hlen(key: RedisKey): Promise<number> {
    return this.hashCommands.hlen(key);
  }

  async hincrby(key: RedisKey, field: string, increment: number): Promise<number> {
    return this.hashCommands.hincrby(key, field, increment);
  }

  async hincrbyfloat(key: RedisKey, field: string, increment: number): Promise<number> {
    return this.hashCommands.hincrbyfloat(key, field, increment);
  }

  async hsetnx(key: RedisKey, field: string, value: RedisValue): Promise<number> {
    return this.hashCommands.hsetnx(key, field, value);
  }

  // List Commands
  async lpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, ...args: any[]): Promise<number> {
    return this.listCommands.lpush(key, ...args);
  }

  async rpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, ...args: any[]): Promise<number> {
    return this.listCommands.rpush(key, ...args);
  }

  async lpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    return this.listCommands.lpop(key, count);
  }

  async rpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    return this.listCommands.rpop(key, count);
  }

  async llen(key: RedisKey): Promise<number> {
    return this.listCommands.llen(key);
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    return this.listCommands.lrange(key, start, stop);
  }

  async ltrim(key: RedisKey, start: number, stop: number): Promise<string> {
    return this.listCommands.ltrim(key, start, stop);
  }

  async lindex(key: RedisKey, index: number): Promise<string | null> {
    return this.listCommands.lindex(key, index);
  }

  async lset(key: RedisKey, index: number, value: RedisValue): Promise<string> {
    return this.listCommands.lset(key, index, value);
  }

  async lrem(key: RedisKey, count: number, value: RedisValue): Promise<number> {
    return this.listCommands.lrem(key, count, value);
  }

  async linsert(key: RedisKey, direction: 'BEFORE' | 'AFTER', pivot: RedisValue, element: RedisValue): Promise<number> {
    return this.listCommands.linsert(key, direction, pivot, element);
  }

  async rpoplpush(source: RedisKey, destination: RedisKey): Promise<string | null> {
    return this.listCommands.rpoplpush(source, destination);
  }

  async blpop(...args: any[]): Promise<[string, string] | null> {
    return this.listCommands.blpop(...args);
  }

  async brpop(...args: any[]): Promise<[string, string] | null> {
    return this.listCommands.brpop(...args);
  }

  async brpoplpush(source: RedisKey, destination: RedisKey, timeout: number): Promise<string | null> {
    return this.listCommands.brpoplpush(source, destination, timeout);
  }

  // Sorted Set Commands
  async zadd(key: RedisKey, ...args: any[]): Promise<number> {
    return this.zsetCommands.zadd(key, ...args);
  }

  async zrem(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    return this.zsetCommands.zrem(key, ...members);
  }

  async zcard(key: RedisKey): Promise<number> {
    return this.zsetCommands.zcard(key);
  }

  async zscore(key: RedisKey, member: RedisValue): Promise<string | null> {
    return this.zsetCommands.zscore(key, member);
  }

  async zrank(key: RedisKey, member: RedisValue): Promise<number | null> {
    return this.zsetCommands.zrank(key, member);
  }

  async zrevrank(key: RedisKey, member: RedisValue): Promise<number | null> {
    return this.zsetCommands.zrevrank(key, member);
  }

  async zrange(key: RedisKey, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    return this.zsetCommands.zrange(key, start, stop, withScores);
  }

  async zrevrange(key: RedisKey, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    return this.zsetCommands.zrevrange(key, start, stop, withScores);
  }

  async zrangebyscore(key: RedisKey, min: string | number, max: string | number, ...args: string[]): Promise<string[]> {
    return this.zsetCommands.zrangebyscore(key, min, max, ...args);
  }

  async zrevrangebyscore(key: RedisKey, max: string | number, min: string | number, ...args: string[]): Promise<string[]> {
    return this.zsetCommands.zrevrangebyscore(key, max, min, ...args);
  }

  async zpopmin(key: RedisKey, count?: number): Promise<string[]> {
    return this.zsetCommands.zpopmin(key, count);
  }

  async zpopmax(key: RedisKey, count?: number): Promise<string[]> {
    return this.zsetCommands.zpopmax(key, count);
  }

  async bzpopmin(...args: any[]): Promise<[string, string, string] | null> {
    return this.zsetCommands.bzpopmin(...args);
  }

  async bzpopmax(...args: any[]): Promise<[string, string, string] | null> {
    return this.zsetCommands.bzpopmax(...args);
  }

  async zremrangebyscore(key: RedisKey, min: string | number, max: string | number): Promise<number> {
    return this.zsetCommands.zremrangebyscore(key, min, max);
  }

  // Pub/Sub Commands
  async publish(channel: string, message: RedisValue): Promise<number> {
    return this.pubsubCommands.publish(channel, message);
  }

  async subscribe(...channels: string[]): Promise<number> {
    return this.pubsubCommands.subscribe(...channels);
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    return this.pubsubCommands.unsubscribe(...channels);
  }

  async psubscribe(...patterns: string[]): Promise<number> {
    return this.pubsubCommands.psubscribe(...patterns);
  }

  async punsubscribe(...patterns: string[]): Promise<number> {
    return this.pubsubCommands.punsubscribe(...patterns);
  }

  // Transaction Commands
  async script(subcommand: string, ...args: any[]): Promise<any> {
    return this.transactionCommands.script(subcommand, ...args);
  }

  async watch(...keys: RedisKey[]): Promise<string> {
    keys.forEach(key => this.watchedKeys.add(ParameterTranslator.normalizeKey(key)));
    return this.transactionCommands.watch(...keys);
  }

  async unwatch(): Promise<string> {
    this.watchedKeys.clear();
    return this.transactionCommands.unwatch();
  }

  async eval(script: string, numKeys: number, ...keysAndArgs: any[]): Promise<any> {
    return this.transactionCommands.eval(script, numKeys, ...keysAndArgs);
  }

  async evalsha(sha: string, numKeys: number, ...keysAndArgs: any[]): Promise<any> {
    return this.transactionCommands.evalsha(sha, numKeys, ...keysAndArgs);
  }

  async exec(): Promise<Array<[Error | null, any]> | null> {
    await this.ensureConnected();
    // Reuse MultiAdapter batching if present on this instance
    if (typeof (this as any).commands !== 'undefined') {
      // If this instance is actually acting as a Multi, delegate to its exec
      return (this as any).exec();
    }
    // For ClusterAdapter top-level exec just return null (ioredis exec is for MULTI context)
    return null;
  }

  // Additional compatibility methods
  async call(command: string, ...args: (string | number | Buffer)[]): Promise<any> {
    const client = await this.ensureConnected();
    const stringArgs = args.map(arg => arg.toString());
    return await client.customCommand([command, ...stringArgs]);
  }

  // Stream operations for Bull compatibility
  async xadd(key: RedisKey, id: string, ...fieldsAndValues: any[]): Promise<string> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    // Convert ioredis format to GLIDE format [[field1, value1], [field2, value2]]
    const values: [string, string][] = [];
    for (let i = 0; i < fieldsAndValues.length; i += 2) {
      if (i + 1 < fieldsAndValues.length) {
        values.push([String(fieldsAndValues[i]), String(fieldsAndValues[i + 1])]);
      }
    }
    
    // Use native GLIDE method
    const options = id !== '*' ? { id } : undefined;
    const result = await client.xadd(normalizedKey, values, options);
    return ParameterTranslator.convertGlideString(result) || '';
  }

  async xread(...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    
    // Parse ioredis XREAD format and convert to GLIDE format
    let countValue: number | undefined;
    let blockValue: number | undefined;
    let streamsIndex = -1;
    
    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'COUNT' && i + 1 < args.length) {
        countValue = parseInt(String(args[i + 1]));
        i++;
      } else if (arg === 'BLOCK' && i + 1 < args.length) {
        blockValue = parseInt(String(args[i + 1]));
        i++;
      } else if (arg === 'STREAMS') {
        streamsIndex = i + 1;
        break;
      }
    }
    
    if (streamsIndex === -1) {
      throw new Error('XREAD requires STREAMS keyword');
    }
    
    const streamArgs = args.slice(streamsIndex);
    const numStreams = Math.floor(streamArgs.length / 2);
    const keys = streamArgs.slice(0, numStreams);
    const ids = streamArgs.slice(numStreams);
    
    const keys_and_ids: Record<string, string> = {};
    for (let i = 0; i < numStreams; i++) {
      const normalizedKey = ParameterTranslator.normalizeKey(keys[i]);
      keys_and_ids[normalizedKey] = String(ids[i]);
    }
    
    const options: any = {};
    if (countValue !== undefined) options.count = countValue;
    if (blockValue !== undefined) options.block = blockValue;
    
    // Use native GLIDE method
    return await client.xread(keys_and_ids, options);
  }

  async xreadgroup(group: string, consumer: string, ...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    
    // Parse ioredis XREADGROUP arguments: [COUNT, count, BLOCK, timeout, NOACK, STREAMS, key1, key2, ..., id1, id2, ...]
    // Convert to GLIDE format: group, consumer, keys_and_ids: Record<string, string>, options?: StreamReadGroupOptions
    
    let countValue: number | undefined;
    let blockValue: number | undefined;
    let noAck = false;
    let streamsIndex = -1;
    
    // Find STREAMS keyword and parse options
    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'COUNT' && i + 1 < args.length) {
        countValue = parseInt(String(args[i + 1]));
        i++; // Skip the count value
      } else if (arg === 'BLOCK' && i + 1 < args.length) {
        blockValue = parseInt(String(args[i + 1]));
        i++; // Skip the block value
      } else if (arg === 'NOACK') {
        noAck = true;
      } else if (arg === 'STREAMS') {
        streamsIndex = i + 1;
        break;
      }
    }
    
    if (streamsIndex === -1) {
      throw new Error('XREADGROUP requires STREAMS keyword');
    }
    
    // Split streams arguments into keys and IDs
    const streamArgs = args.slice(streamsIndex);
    const numStreams = Math.floor(streamArgs.length / 2);
    const keys = streamArgs.slice(0, numStreams);
    const ids = streamArgs.slice(numStreams);
    
    // Build GLIDE keys_and_ids object
    const keys_and_ids: Record<string, string> = {};
    for (let i = 0; i < numStreams; i++) {
      const normalizedKey = ParameterTranslator.normalizeKey(keys[i]);
      keys_and_ids[normalizedKey] = String(ids[i]);
    }
    
    // Build GLIDE options
    const options: any = {};
    if (countValue !== undefined) options.count = countValue;
    if (blockValue !== undefined) options.block = blockValue;
    if (noAck) options.noAck = true;
    
    // Use native GLIDE method
    return await client.xreadgroup(group, consumer, keys_and_ids, options);
  }

  async xack(key: RedisKey, group: string, ...ids: string[]): Promise<number> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    // Use native GLIDE method
    return await client.xack(normalizedKey, group, ids);
  }

  async xgroup(subcommand: string, ...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    return await client.customCommand(['XGROUP', subcommand, ...args.map(String)]);
  }

  async xpending(key: RedisKey, group: string, ...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.customCommand(['XPENDING', normalizedKey, group, ...args.map(String)]);
  }

  async xclaim(key: RedisKey, group: string, consumer: string, minIdleTime: number, ...ids: string[]): Promise<any> {
    const client = await this.ensureConnected();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.customCommand(['XCLAIM', normalizedKey, group, consumer, minIdleTime.toString(), ...ids]);
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.pubsubCommands.closeSubscriber();
    await super.disconnect();
  }
}
