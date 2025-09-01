/**
 * Type definitions for ioredis adapter
 */

import { EventEmitter } from 'events';

// Basic types
export type RedisValue = string | number | Buffer;
export type RedisKey = string | Buffer;

// Import GLIDE's ReadFrom type directly to ensure compatibility
import { ReadFrom } from '@valkey/valkey-glide';

// Re-export for convenience
export type { ReadFrom };

// Connection options (ioredis compatible + GLIDE extensions)
export interface RedisOptions {
  port?: number;
  host?: string;
  username?: string;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number | null;
  connectTimeout?: number;
  commandTimeout?: number;
  requestTimeout?: number;
  clientName?: string;
  tls?: boolean;
  useTLS?: boolean;
  family?: number;
  keepAlive?: boolean;
  enableReadyCheck?: boolean;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  maxLoadingTimeout?: number;
  keyPrefix?: string;
  lazyConnect?: boolean;
  
  // GLIDE-specific features
  readFrom?: ReadFrom;
  clientAz?: string; // Availability Zone for AZ affinity
  
  // Pub/Sub configuration
  enableEventBasedPubSub?: boolean; // Enable custom command pub/sub for binary data compatibility
}

// Connection status
export type ConnectionStatus = 'wait' | 'connecting' | 'connected' | 'ready' | 'disconnecting' | 'disconnected' | 'reconnecting' | 'end' | 'error';

// Pipeline and Multi interfaces
export interface Pipeline {
  // String commands
  set(key: RedisKey, value: RedisValue, ...args: any[]): Pipeline;
  get(key: RedisKey): Pipeline;
  mget(...keys: RedisKey[]): Pipeline;
  mget(keys: RedisKey[]): Pipeline;
  mset(...args: any[]): Pipeline;
  mset(hash: Record<string, RedisValue>): Pipeline;
  incr(key: RedisKey): Pipeline;
  decr(key: RedisKey): Pipeline;
  incrby(key: RedisKey, increment: number): Pipeline;
  decrby(key: RedisKey, decrement: number): Pipeline;
  incrbyfloat(key: RedisKey, increment: number): Pipeline;
  append(key: RedisKey, value: RedisValue): Pipeline;
  strlen(key: RedisKey): Pipeline;
  getrange(key: RedisKey, start: number, end: number): Pipeline;
  setrange(key: RedisKey, offset: number, value: RedisValue): Pipeline;
  setex(key: RedisKey, seconds: number, value: RedisValue): Pipeline;
  setnx(key: RedisKey, value: RedisValue): Pipeline;
  psetex(key: RedisKey, milliseconds: number, value: RedisValue): Pipeline;

  // Hash commands
  hset(key: RedisKey, ...args: any[]): Pipeline;
  hset(key: RedisKey, hash: Record<string, RedisValue>): Pipeline;
  hget(key: RedisKey, field: string): Pipeline;
  hmset(key: RedisKey, ...args: any[]): Pipeline;
  hmset(key: RedisKey, hash: Record<string, RedisValue>): Pipeline;
  hmget(key: RedisKey, ...fields: string[]): Pipeline;
  hmget(key: RedisKey, fields: string[]): Pipeline;
  hgetall(key: RedisKey): Pipeline;
  hdel(key: RedisKey, ...fields: string[]): Pipeline;
  hexists(key: RedisKey, field: string): Pipeline;
  hkeys(key: RedisKey): Pipeline;
  hvals(key: RedisKey): Pipeline;
  hlen(key: RedisKey): Pipeline;
  hincrby(key: RedisKey, field: string, increment: number): Pipeline;
  hincrbyfloat(key: RedisKey, field: string, increment: number): Pipeline;
  hsetnx(key: RedisKey, field: string, value: RedisValue): Pipeline;

  // List commands
  lpush(key: RedisKey, ...elements: RedisValue[]): Pipeline;
  lpush(key: RedisKey, elements: RedisValue[]): Pipeline;
  rpush(key: RedisKey, ...elements: RedisValue[]): Pipeline;
  rpush(key: RedisKey, elements: RedisValue[]): Pipeline;
  lpop(key: RedisKey, count?: number): Pipeline;
  rpop(key: RedisKey, count?: number): Pipeline;
  lrange(key: RedisKey, start: number, stop: number): Pipeline;
  llen(key: RedisKey): Pipeline;
  lindex(key: RedisKey, index: number): Pipeline;
  lset(key: RedisKey, index: number, element: RedisValue): Pipeline;
  ltrim(key: RedisKey, start: number, stop: number): Pipeline;
  lrem(key: RedisKey, count: number, element: RedisValue): Pipeline;
  lpushx(key: RedisKey, ...elements: RedisValue[]): Pipeline;
  rpushx(key: RedisKey, ...elements: RedisValue[]): Pipeline;

  // Set commands
  sadd(key: RedisKey, ...members: RedisValue[]): Pipeline;
  srem(key: RedisKey, ...members: RedisValue[]): Pipeline;
  smembers(key: RedisKey): Pipeline;
  scard(key: RedisKey): Pipeline;
  sismember(key: RedisKey, member: RedisValue): Pipeline;
  spop(key: RedisKey, count?: number): Pipeline;
  srandmember(key: RedisKey, count?: number): Pipeline;
  sunion(...keys: RedisKey[]): Pipeline;
  sinter(...keys: RedisKey[]): Pipeline;
  sdiff(...keys: RedisKey[]): Pipeline;
  sunionstore(destination: RedisKey, ...keys: RedisKey[]): Pipeline;
  sinterstore(destination: RedisKey, ...keys: RedisKey[]): Pipeline;
  sdiffstore(destination: RedisKey, ...keys: RedisKey[]): Pipeline;

  // Sorted Set commands
  zadd(key: RedisKey, ...scoreMembers: (number | string)[]): Pipeline;
  zrem(key: RedisKey, ...members: RedisValue[]): Pipeline;
  zrange(key: RedisKey, start: number, stop: number, options?: any): Pipeline;
  zrevrange(key: RedisKey, start: number, stop: number, options?: any): Pipeline;
  zscore(key: RedisKey, member: RedisValue): Pipeline;
  zcard(key: RedisKey): Pipeline;
  zrank(key: RedisKey, member: RedisValue): Pipeline;
  zrevrank(key: RedisKey, member: RedisValue): Pipeline;
  zincrby(key: RedisKey, increment: number, member: RedisValue): Pipeline;
  zcount(key: RedisKey, min: number | string, max: number | string): Pipeline;
  zremrangebyrank(key: RedisKey, start: number, stop: number): Pipeline;
  zremrangebyscore(key: RedisKey, min: number | string, max: number | string): Pipeline;

  // Key commands
  del(...keys: RedisKey[]): Pipeline;
  exists(...keys: RedisKey[]): Pipeline;
  expire(key: RedisKey, seconds: number): Pipeline;
  ttl(key: RedisKey): Pipeline;
  type(key: RedisKey): Pipeline;

  // Control
  exec(): Promise<Array<[Error | null, any]>>;
  discard(): void;
}

export interface Multi {
  // String commands
  set(key: RedisKey, value: RedisValue, ...args: any[]): Multi;
  get(key: RedisKey): Multi;
  mget(...keys: RedisKey[]): Multi;
  mget(keys: RedisKey[]): Multi;
  mset(...args: any[]): Multi;
  mset(hash: Record<string, RedisValue>): Multi;
  incr(key: RedisKey): Multi;
  decr(key: RedisKey): Multi;
  incrby(key: RedisKey, increment: number): Multi;
  decrby(key: RedisKey, decrement: number): Multi;
  incrbyfloat(key: RedisKey, increment: number): Multi;
  append(key: RedisKey, value: RedisValue): Multi;
  strlen(key: RedisKey): Multi;
  getrange(key: RedisKey, start: number, end: number): Multi;
  setrange(key: RedisKey, offset: number, value: RedisValue): Multi;
  setex(key: RedisKey, seconds: number, value: RedisValue): Multi;
  setnx(key: RedisKey, value: RedisValue): Multi;
  psetex(key: RedisKey, milliseconds: number, value: RedisValue): Multi;

  // Hash commands
  hset(key: RedisKey, ...args: any[]): Multi;
  hset(key: RedisKey, hash: Record<string, RedisValue>): Multi;
  hget(key: RedisKey, field: string): Multi;
  hmset(key: RedisKey, ...args: any[]): Multi;
  hmset(key: RedisKey, hash: Record<string, RedisValue>): Multi;
  hmget(key: RedisKey, ...fields: string[]): Multi;
  hmget(key: RedisKey, fields: string[]): Multi;
  hgetall(key: RedisKey): Multi;
  hdel(key: RedisKey, ...fields: string[]): Multi;
  hexists(key: RedisKey, field: string): Multi;
  hkeys(key: RedisKey): Multi;
  hvals(key: RedisKey): Multi;
  hlen(key: RedisKey): Multi;
  hincrby(key: RedisKey, field: string, increment: number): Multi;
  hincrbyfloat(key: RedisKey, field: string, increment: number): Multi;
  hsetnx(key: RedisKey, field: string, value: RedisValue): Multi;

  // List commands
  lpush(key: RedisKey, ...elements: RedisValue[]): Multi;
  lpush(key: RedisKey, elements: RedisValue[]): Multi;
  rpush(key: RedisKey, ...elements: RedisValue[]): Multi;
  rpush(key: RedisKey, elements: RedisValue[]): Multi;
  lpop(key: RedisKey, count?: number): Multi;
  rpop(key: RedisKey, count?: number): Multi;
  lrange(key: RedisKey, start: number, stop: number): Multi;
  llen(key: RedisKey): Multi;
  lindex(key: RedisKey, index: number): Multi;
  lset(key: RedisKey, index: number, element: RedisValue): Multi;
  ltrim(key: RedisKey, start: number, stop: number): Multi;
  lrem(key: RedisKey, count: number, element: RedisValue): Multi;
  lpushx(key: RedisKey, ...elements: RedisValue[]): Multi;
  rpushx(key: RedisKey, ...elements: RedisValue[]): Multi;

  // Set commands
  sadd(key: RedisKey, ...members: RedisValue[]): Multi;
  srem(key: RedisKey, ...members: RedisValue[]): Multi;
  smembers(key: RedisKey): Multi;
  scard(key: RedisKey): Multi;
  sismember(key: RedisKey, member: RedisValue): Multi;
  spop(key: RedisKey, count?: number): Multi;
  srandmember(key: RedisKey, count?: number): Multi;
  sunion(...keys: RedisKey[]): Multi;
  sinter(...keys: RedisKey[]): Multi;
  sdiff(...keys: RedisKey[]): Multi;
  sunionstore(destination: RedisKey, ...keys: RedisKey[]): Multi;
  sinterstore(destination: RedisKey, ...keys: RedisKey[]): Multi;
  sdiffstore(destination: RedisKey, ...keys: RedisKey[]): Multi;

  // Sorted Set commands
  zadd(key: RedisKey, ...scoreMembers: (number | string)[]): Multi;
  zrem(key: RedisKey, ...members: RedisValue[]): Multi;
  zrange(key: RedisKey, start: number, stop: number, options?: any): Multi;
  zrevrange(key: RedisKey, start: number, stop: number, options?: any): Multi;
  zscore(key: RedisKey, member: RedisValue): Multi;
  zcard(key: RedisKey): Multi;
  zrank(key: RedisKey, member: RedisValue): Multi;
  zrevrank(key: RedisKey, member: RedisValue): Multi;
  zincrby(key: RedisKey, increment: number, member: RedisValue): Multi;
  zcount(key: RedisKey, min: number | string, max: number | string): Multi;
  zremrangebyrank(key: RedisKey, start: number, stop: number): Multi;
  zremrangebyscore(key: RedisKey, min: number | string, max: number | string): Multi;

  // Key commands
  del(...keys: RedisKey[]): Multi;
  exists(...keys: RedisKey[]): Multi;
  expire(key: RedisKey, seconds: number): Multi;
  ttl(key: RedisKey): Multi;
  type(key: RedisKey): Multi;

  // Multi-specific methods
  watch(...keys: RedisKey[]): Promise<string>;
  unwatch(): Promise<string>;
  
  // Override exec to allow null return (when transaction is discarded)
  exec(): Promise<Array<[Error | null, any]> | null>;
  discard(): void;
}

// Cluster node definition
export interface ClusterNode {
  host: string;
  port: number;
}

export interface ClusterOptions {
  enableReadyCheck?: boolean;
  redisOptions?: RedisOptions;
  maxRedirections?: number;
  retryDelayOnFailover?: number;
  retryDelayOnClusterDown?: number;
  retryDelayOnTimeout?: number;
  slotsRefreshTimeout?: number;
  slotsRefreshInterval?: number;
  lazyConnect?: boolean;
  nodes?: ClusterNode[];
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  enableReadFromReplicas?: boolean;
  scaleReads?: string;
  enableOfflineQueue?: boolean;
  readOnly?: boolean;
  
  // Connection and retry options
  maxRetriesPerRequest?: number | null;
  connectTimeout?: number;
  commandTimeout?: number;
  requestTimeout?: number;
  clientName?: string;
  tls?: boolean;
  useTLS?: boolean;
  
  // GLIDE-specific features
  readFrom?: ReadFrom;
  clientAz?: string;
}

// Events interface
export interface RedisEvents {
  'connect': () => void;
  'ready': () => void;
  'error': (error: Error) => void;
  'close': () => void;
  'reconnecting': () => void;
  'end': () => void;
  'wait': () => void;
  'message': (channel: string, message: string) => void;
  'messageBuffer': (channel: Buffer, message: Buffer) => void;
  'pmessage': (pattern: string, channel: string, message: string) => void;
  'pmessageBuffer': (pattern: Buffer, channel: Buffer, message: Buffer) => void;
  'subscribe': (channel: string, count: number) => void;
  'unsubscribe': (channel: string, count: number) => void;
  'psubscribe': (pattern: string, count: number) => void;
  'punsubscribe': (pattern: string, count: number) => void;
}

// Main interfaces
export interface IRedisAdapter extends EventEmitter {
  readonly status: ConnectionStatus;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  quit(): Promise<void>; // Bull v3 compatibility alias
  ping(message?: string): Promise<string>;
  info(section?: string): Promise<string>;
  sendCommand(command: any): Promise<any>;
  call(commandName: string, ...args: any[]): Promise<any>;
  client(subcommand: string, ...args: any[]): Promise<any>;
  duplicate(override?: any): Promise<IRedisAdapter>;

  // String commands
  set(key: RedisKey, value: RedisValue, ...args: any[]): Promise<string | null>;
  get(key: RedisKey): Promise<string | null>;
  mget(...keys: RedisKey[]): Promise<(string | null)[]>;
  mget(keys: RedisKey[]): Promise<(string | null)[]>;
  mset(...args: any[]): Promise<string>;
  mset(hash: Record<string, RedisValue>): Promise<string>;
  incr(key: RedisKey): Promise<number>;
  decr(key: RedisKey): Promise<number>;
  incrby(key: RedisKey, increment: number): Promise<number>;
  decrby(key: RedisKey, decrement: number): Promise<number>;
  incrbyfloat(key: RedisKey, increment: number): Promise<number>;
  append(key: RedisKey, value: RedisValue): Promise<number>;
  strlen(key: RedisKey): Promise<number>;
  getrange(key: RedisKey, start: number, end: number): Promise<string>;
  setrange(key: RedisKey, offset: number, value: RedisValue): Promise<number>;
  setex(key: RedisKey, seconds: number, value: RedisValue): Promise<string>;
  setnx(key: RedisKey, value: RedisValue): Promise<number>;
  psetex(
    key: RedisKey,
    milliseconds: number,
    value: RedisValue
  ): Promise<string>;

  // Hash commands
  hset(key: RedisKey, ...args: any[]): Promise<number>;
  hset(key: RedisKey, hash: Record<string, RedisValue>): Promise<number>;
  hget(key: RedisKey, field: string): Promise<string | null>;
  hmset(key: RedisKey, ...args: any[]): Promise<string>;
  hmset(key: RedisKey, hash: Record<string, RedisValue>): Promise<string>;
  hmget(key: RedisKey, ...fields: string[]): Promise<(string | null)[]>;
  hmget(key: RedisKey, fields: string[]): Promise<(string | null)[]>;
  hgetall(key: RedisKey): Promise<Record<string, string>>;
  hdel(key: RedisKey, ...fields: string[]): Promise<number>;
  hexists(key: RedisKey, field: string): Promise<number>;
  hkeys(key: RedisKey): Promise<string[]>;
  hvals(key: RedisKey): Promise<string[]>;
  hlen(key: RedisKey): Promise<number>;
  hincrby(key: RedisKey, field: string, increment: number): Promise<number>;
  hincrbyfloat(
    key: RedisKey,
    field: string,
    increment: number
  ): Promise<number>;
  hsetnx(key: RedisKey, field: string, value: RedisValue): Promise<number>;

  // List commands
  lpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  lpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  rpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  rpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  lpop(key: RedisKey, count?: number): Promise<string | string[] | null>;
  rpop(key: RedisKey, count?: number): Promise<string | string[] | null>;
  lrange(key: RedisKey, start: number, stop: number): Promise<string[]>;
  llen(key: RedisKey): Promise<number>;
  lindex(key: RedisKey, index: number): Promise<string | null>;
  lset(key: RedisKey, index: number, element: RedisValue): Promise<string>;
  ltrim(key: RedisKey, start: number, stop: number): Promise<string>;
  lrem(key: RedisKey, count: number, element: RedisValue): Promise<number>;
  lpushx(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  rpushx(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  
  // Blocking list operations - critical for queue systems (BullMQ compatible)
  blpop(...args: any[]): Promise<[string, string] | null>;
  brpop(...args: any[]): Promise<[string, string] | null>;
  brpoplpush(source: RedisKey, destination: RedisKey, timeout: number): Promise<string | null>;
  
  // BullMQ-critical blocking sorted set operations
  bzpopmin(...args: any[]): Promise<[string, string, string] | null>;
  bzpopmax(...args: any[]): Promise<[string, string, string] | null>;
  
  // Stream commands for BullMQ
  xadd(key: RedisKey, id: string, ...fieldsAndValues: any[]): Promise<string>;
  xread(...args: any[]): Promise<any>;
  xreadgroup(group: string, consumer: string, ...args: any[]): Promise<any>;
  xack(key: RedisKey, group: string, ...ids: string[]): Promise<number>;
  xgroup(subcommand: string, ...args: any[]): Promise<any>;
  xpending(key: RedisKey, group: string, ...args: any[]): Promise<any>;
  xclaim(key: RedisKey, group: string, consumer: string, minIdleTime: number, ...ids: string[]): Promise<any>;

  // Set commands
  sadd(key: RedisKey, ...members: RedisValue[]): Promise<number>;
  srem(key: RedisKey, ...members: RedisValue[]): Promise<number>;
  smembers(key: RedisKey): Promise<string[]>;
  scard(key: RedisKey): Promise<number>;
  sismember(key: RedisKey, member: RedisValue): Promise<number>;
  spop(key: RedisKey, count?: number): Promise<string | string[] | null>;
  srandmember(key: RedisKey, count?: number): Promise<string | string[] | null>;
  sunion(...keys: RedisKey[]): Promise<string[]>;
  sinter(...keys: RedisKey[]): Promise<string[]>;
  sdiff(...keys: RedisKey[]): Promise<string[]>;
  sunionstore(destination: RedisKey, ...keys: RedisKey[]): Promise<number>;
  sinterstore(destination: RedisKey, ...keys: RedisKey[]): Promise<number>;
  sdiffstore(destination: RedisKey, ...keys: RedisKey[]): Promise<number>;

  // Sorted Set commands
  zadd(key: RedisKey, ...scoreMembers: (number | string)[]): Promise<number>;
  zrem(key: RedisKey, ...members: RedisValue[]): Promise<number>;
  zrange(key: RedisKey, start: number, stop: number, options?: any): Promise<string[]>;
  zrevrange(key: RedisKey, start: number, stop: number, options?: any): Promise<string[]>;
  zscore(key: RedisKey, member: RedisValue): Promise<string | null>;
  zcard(key: RedisKey): Promise<number>;
  zrank(key: RedisKey, member: RedisValue): Promise<number | null>;
  zrevrank(key: RedisKey, member: RedisValue): Promise<number | null>;
  zincrby(key: RedisKey, increment: number, member: RedisValue): Promise<string>;
  zcount(key: RedisKey, min: number | string, max: number | string): Promise<number>;
  zremrangebyrank(key: RedisKey, start: number, stop: number): Promise<number>;
  zremrangebyscore(key: RedisKey, min: number | string, max: number | string): Promise<number>;

  // Key commands
  del(...keys: RedisKey[]): Promise<number>;
  exists(...keys: RedisKey[]): Promise<number>;
  expire(key: RedisKey, seconds: number): Promise<number>;
  ttl(key: RedisKey): Promise<number>;
  type(key: RedisKey): Promise<string>;
  keys(pattern?: string): Promise<string[]>;

  // Scan commands
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>;
  hscan(key: RedisKey, cursor: string, ...args: string[]): Promise<[string, string[]]>;
  sscan(key: RedisKey, cursor: string, ...args: string[]): Promise<[string, string[]]>;
  zscan(key: RedisKey, cursor: string, ...args: string[]): Promise<[string, string[]]>;

  // Generic command execution
  call(command: string, ...args: (string | number | Buffer)[]): Promise<any>;

  // System and administrative commands
  config(action: string, parameter?: string): Promise<string[]>;
  dbsize(): Promise<number>;
  memory(subcommand: string, ...args: (string | number)[]): Promise<any>;
  slowlog(subcommand: string, ...args: (string | number)[]): Promise<any>;
  debug(subcommand: string, ...args: (string | number)[]): Promise<any>;
  echo(message: string): Promise<string>;
  time(): Promise<[string, string]>;

  // Stream commands
  xadd(key: RedisKey, id: string, ...fieldsAndValues: (string | number)[]): Promise<string>;
  xlen(key: RedisKey): Promise<number>;
  xread(...args: any[]): Promise<any[]>;
  xrange(key: RedisKey, start?: string, end?: string, count?: number): Promise<any[]>;
  xrevrange(key: RedisKey, start?: string, end?: string, count?: number): Promise<any[]>;
  xdel(key: RedisKey, ...ids: string[]): Promise<number>;
  xtrim(key: RedisKey, ...args: any[]): Promise<number>;
  xgroup(action: string, key: RedisKey, group: string, ...args: (string | number)[]): Promise<any>;
  xreadgroup(...args: any[]): Promise<any[]>;
  xack(key: RedisKey, group: string, ...ids: string[]): Promise<number>;
  xpending(key: RedisKey, group: string, range?: { start: string; end: string; count: number; consumer?: string }): Promise<any>;
  xclaim(key: RedisKey, group: string, consumer: string, minIdleTime: number, ...ids: string[]): Promise<any[]>;
  xinfo(subcommand: 'STREAM' | 'GROUPS' | 'CONSUMERS', key: RedisKey, group?: string): Promise<any>;

  // Pipeline and transactions
  pipeline(): Pipeline;
  multi(): Multi;

  // Pub/Sub
  publish(channel: string, message: RedisValue): Promise<number>;
  subscribe(...channels: string[]): Promise<number>;
  unsubscribe(...channels: string[]): Promise<number>;
  psubscribe(...patterns: string[]): Promise<number>;
  punsubscribe(...patterns: string[]): Promise<number>;

  // Add watch method to match ioredis API
  watch(...keys: RedisKey[]): Promise<string>;
  unwatch(): Promise<string>;

  // Script methods to match ioredis API (enhanced for BullMQ)
  scriptLoad(script: string): Promise<string>;
  scriptExists(...scripts: string[]): Promise<boolean[]>;
  scriptFlush(): Promise<string>;
  eval(script: string, numkeys: number, ...keysAndArgs: any[]): Promise<any>;
  evalsha(sha1: string, numkeys: number, ...keysAndArgs: any[]): Promise<any>;
  defineCommand(name: string, options: { lua: string; numberOfKeys?: number }): void;
  script(subcommand: string, ...args: any[]): Promise<any>;

  // Event emitter methods (inherited from EventEmitter)
  on<K extends keyof RedisEvents>(event: K, listener: RedisEvents[K]): this;
  emit<K extends keyof RedisEvents>(
    event: K,
    ...args: Parameters<RedisEvents[K]>
  ): boolean;
}

export interface IClusterAdapter extends IRedisAdapter {
  nodes(): ClusterNode[];
  // Cluster-specific methods would be added here
}