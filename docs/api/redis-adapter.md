# RedisAdapter API Reference

Complete API reference for the RedisAdapter class - the main interface for Redis operations.

## Constructor

### `new RedisAdapter(options?)`

Creates a new Redis adapter instance.

```typescript
import { RedisAdapter } from 'valkey-glide-ioredis-adapter';

const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  password: 'secret'
});
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options` | `RedisOptions` | `{}` | Connection configuration |

#### RedisOptions

```typescript
interface RedisOptions {
  host?: string;                    // Redis host (default: 'localhost')
  port?: number;                    // Redis port (default: 6379)  
  password?: string;                // Authentication password
  username?: string;                // Redis ACL username
  db?: number;                      // Database number (default: 0)
  keyPrefix?: string;               // Key prefix for all operations
  lazyConnect?: boolean;            // Connect on first operation (default: true)
  maxRetriesPerRequest?: number;    // Max retries per command (default: 3)
  retryDelayOnFailover?: number;    // Failover retry delay (ms)
  enableAutoPipelining?: boolean;   // Automatic command batching
  maxCommandsInFlight?: number;     // Concurrent command limit
}
```

## Connection Management

### `connect(): Promise<void>`

Explicitly connect to Redis server.

```typescript
await redis.connect();
```

### `disconnect(): Promise<void>`

Close the connection and cleanup resources.

```typescript
await redis.disconnect();
```

### `isReady(): Promise<RedisAdapter>`

Wait for connection to be ready and return the adapter instance.

```typescript
const readyRedis = await redis.isReady();
```

## String Operations

### `set(key, value, ...args): Promise<string | null>`

Set a key-value pair with optional parameters.

```typescript
// Basic set
await redis.set('key', 'value');

// With expiration
await redis.set('key', 'value', 'EX', 60);

// With conditional set
await redis.set('key', 'value', 'NX'); // Only if key doesn't exist
await redis.set('key', 'value', 'XX'); // Only if key exists
```

### `get(key): Promise<string | null>`

Get the value of a key.

```typescript
const value = await redis.get('key');
console.log(value); // 'value' or null
```

### `mset(...args): Promise<string>`

Set multiple key-value pairs.

```typescript
await redis.mset('key1', 'value1', 'key2', 'value2');
// or
await redis.mset({ key1: 'value1', key2: 'value2' });
```

### `mget(...keys): Promise<(string | null)[]>`

Get multiple values by keys.

```typescript
const values = await redis.mget('key1', 'key2', 'key3');
console.log(values); // ['value1', 'value2', null]
```

### `incr(key): Promise<number>`

Increment a numeric value.

```typescript
const newValue = await redis.incr('counter'); // Returns new value
```

### `decr(key): Promise<number>`

Decrement a numeric value.

```typescript
const newValue = await redis.decr('counter'); // Returns new value
```

### `incrby(key, increment): Promise<number>`

Increment by a specific amount.

```typescript
const newValue = await redis.incrby('counter', 5); // Increment by 5
```

### `decrby(key, decrement): Promise<number>`

Decrement by a specific amount.

```typescript
const newValue = await redis.decrby('counter', 3); // Decrement by 3
```

## Hash Operations

### `hset(key, ...args): Promise<number>`

Set hash field-value pairs.

```typescript
// Single field
await redis.hset('user:1', 'name', 'John');

// Multiple fields
await redis.hset('user:1', 'name', 'John', 'age', '30');

// Object syntax
await redis.hset('user:1', { name: 'John', age: '30' });
```

### `hget(key, field): Promise<string | null>`

Get a hash field value.

```typescript
const name = await redis.hget('user:1', 'name');
console.log(name); // 'John' or null
```

### `hgetall(key): Promise<Record<string, string>>`

Get all hash fields and values.

```typescript
const user = await redis.hgetall('user:1');
console.log(user); // { name: 'John', age: '30' }
```

### `hmset(key, ...args): Promise<string>`

Set multiple hash fields (legacy method, use `hset`).

```typescript
await redis.hmset('user:1', 'name', 'John', 'age', '30');
```

### `hmget(key, ...fields): Promise<(string | null)[]>`

Get multiple hash field values.

```typescript
const values = await redis.hmget('user:1', 'name', 'age', 'email');
console.log(values); // ['John', '30', null]
```

### `hdel(key, ...fields): Promise<number>`

Delete hash fields.

```typescript
const deletedCount = await redis.hdel('user:1', 'age', 'email');
console.log(deletedCount); // Number of deleted fields
```

### `hexists(key, field): Promise<number>`

Check if hash field exists.

```typescript
const exists = await redis.hexists('user:1', 'name');
console.log(exists); // 1 if exists, 0 if not
```

### `hkeys(key): Promise<string[]>`

Get all hash field names.

```typescript
const fields = await redis.hkeys('user:1');
console.log(fields); // ['name', 'age']
```

### `hvals(key): Promise<string[]>`

Get all hash field values.

```typescript
const values = await redis.hvals('user:1');
console.log(values); // ['John', '30']
```

### `hlen(key): Promise<number>`

Get number of fields in hash.

```typescript
const count = await redis.hlen('user:1');
console.log(count); // 2
```

## List Operations

### `lpush(key, ...values): Promise<number>`

Push values to the left (head) of list.

```typescript
const length = await redis.lpush('list', 'value1', 'value2');
console.log(length); // New list length
```

### `rpush(key, ...values): Promise<number>`

Push values to the right (tail) of list.

```typescript
const length = await redis.rpush('list', 'value1', 'value2');
```

### `lpop(key): Promise<string | null>`

Pop value from left (head) of list.

```typescript
const value = await redis.lpop('list');
console.log(value); // First value or null
```

### `rpop(key): Promise<string | null>`

Pop value from right (tail) of list.

```typescript
const value = await redis.rpop('list');
console.log(value); // Last value or null
```

### `lrange(key, start, stop): Promise<string[]>`

Get range of list elements.

```typescript
const elements = await redis.lrange('list', 0, -1); // Get all
const first3 = await redis.lrange('list', 0, 2);    // Get first 3
```

### `llen(key): Promise<number>`

Get list length.

```typescript
const length = await redis.llen('list');
console.log(length); // Number of elements
```

### `brpoplpush(source, destination, timeout): Promise<string | null>`

Blocking version of RPOPLPUSH with timeout.

```typescript
// Block for up to 30 seconds
const value = await redis.brpoplpush('source', 'dest', 30);
```

## Set Operations

### `sadd(key, ...members): Promise<number>`

Add members to set.

```typescript
const added = await redis.sadd('myset', 'member1', 'member2');
console.log(added); // Number of new members added
```

### `srem(key, ...members): Promise<number>`

Remove members from set.

```typescript
const removed = await redis.srem('myset', 'member1', 'member2');
console.log(removed); // Number of members removed
```

### `smembers(key): Promise<string[]>`

Get all set members.

```typescript
const members = await redis.smembers('myset');
console.log(members); // Array of members
```

### `sismember(key, member): Promise<number>`

Check if member is in set.

```typescript
const isMember = await redis.sismember('myset', 'member1');
console.log(isMember); // 1 if member, 0 if not
```

### `scard(key): Promise<number>`

Get set cardinality (size).

```typescript
const size = await redis.scard('myset');
console.log(size); // Number of members
```

## Sorted Set Operations

### `zadd(key, ...args): Promise<number>`

Add members with scores to sorted set.

```typescript
// Single member
await redis.zadd('leaderboard', 100, 'player1');

// Multiple members
await redis.zadd('leaderboard', 100, 'player1', 200, 'player2');

// With options
await redis.zadd('leaderboard', 'NX', 100, 'player1'); // Only if doesn't exist
```

### `zrange(key, start, stop, ...args): Promise<string[]>`

Get range of sorted set members.

```typescript
// Get members by rank
const members = await redis.zrange('leaderboard', 0, 2);

// Get members with scores
const withScores = await redis.zrange('leaderboard', 0, 2, 'WITHSCORES');
console.log(withScores); // ['player1', '100', 'player2', '200']
```

### `zrangebyscore(key, min, max, ...args): Promise<string[]>`

Get members by score range.

```typescript
// Get members with scores 100-200
const members = await redis.zrangebyscore('leaderboard', 100, 200);

// With scores and limit
const result = await redis.zrangebyscore(
  'leaderboard', 100, 200, 'WITHSCORES', 'LIMIT', 0, 10
);
```

### `zrem(key, ...members): Promise<number>`

Remove members from sorted set.

```typescript
const removed = await redis.zrem('leaderboard', 'player1', 'player2');
```

### `zscore(key, member): Promise<string | null>`

Get member score.

```typescript
const score = await redis.zscore('leaderboard', 'player1');
console.log(score); // '100' or null
```

### `zcard(key): Promise<number>`

Get sorted set size.

```typescript
const size = await redis.zcard('leaderboard');
```

### `zrank(key, member): Promise<number | null>`

Get member rank (0-based, lowest to highest).

```typescript
const rank = await redis.zrank('leaderboard', 'player1');
console.log(rank); // 0 for lowest score, null if not found
```

## Key Management

### `del(...keys): Promise<number>`

Delete keys.

```typescript
const deleted = await redis.del('key1', 'key2', 'key3');
console.log(deleted); // Number of deleted keys
```

### `exists(...keys): Promise<number>`

Check if keys exist.

```typescript
const count = await redis.exists('key1', 'key2');
console.log(count); // Number of existing keys
```

### `expire(key, seconds): Promise<number>`

Set key expiration in seconds.

```typescript
const success = await redis.expire('key', 60); // Expire in 60 seconds
console.log(success); // 1 if set, 0 if key doesn't exist
```

### `pexpire(key, milliseconds): Promise<number>`

Set key expiration in milliseconds.

```typescript
await redis.pexpire('key', 5000); // Expire in 5 seconds
```

### `ttl(key): Promise<number>`

Get key time-to-live in seconds.

```typescript
const ttl = await redis.ttl('key');
// Returns: positive number (seconds), -1 (no expiration), -2 (doesn't exist)
```

### `pttl(key): Promise<number>`

Get key time-to-live in milliseconds.

```typescript
const pttl = await redis.pttl('key');
```

### `keys(pattern): Promise<string[]>`

Find keys by pattern.

```typescript
const keys = await redis.keys('user:*');
console.log(keys); // All keys starting with 'user:'
```

### `scan(cursor, ...args): Promise<[string, string[]]>`

Iterate over keys.

```typescript
let cursor = '0';
let allKeys = [];

do {
  const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'user:*', 'COUNT', 100);
  cursor = newCursor;
  allKeys.push(...keys);
} while (cursor !== '0');
```

## Transactions

### `multi(): MultiAdapter`

Create transaction pipeline.

```typescript
const multi = redis.multi();
multi.set('key1', 'value1');
multi.set('key2', 'value2');
multi.incr('counter');

const results = await multi.exec();
console.log(results); // Array of command results
```

### `pipeline(): MultiAdapter`

Create command pipeline (no transaction).

```typescript
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.get('key1');
pipeline.del('old-key');

const results = await pipeline.exec();
```

## Lua Scripts

### `defineCommand(name, definition): void`

Define custom Lua script command.

```typescript
redis.defineCommand('mycommand', {
  numberOfKeys: 2,
  lua: `
    local key1 = KEYS[1]
    local key2 = KEYS[2]
    local value = ARGV[1]
    
    redis.call('set', key1, value)
    redis.call('set', key2, value)
    
    return 'OK'
  `
});

// Use the custom command
await redis.mycommand('key1', 'key2', 'shared-value');
```

### `eval(script, numKeys, ...args): Promise<any>`

Execute Lua script directly.

```typescript
const result = await redis.eval(
  'return redis.call("get", KEYS[1])',
  1,
  'mykey'
);
```

### `evalsha(sha1, numKeys, ...args): Promise<any>`

Execute cached Lua script by SHA1 hash.

```typescript
const result = await redis.evalsha(sha1Hash, 1, 'mykey');
```

## Information & Monitoring

### `ping(): Promise<string>`

Ping the server.

```typescript
const response = await redis.ping();
console.log(response); // 'PONG'
```

### `info(section?): Promise<string>`

Get server information.

```typescript
const info = await redis.info();           // All sections
const memory = await redis.info('memory'); // Memory section only
```

### `dbsize(): Promise<number>`

Get database size (number of keys).

```typescript
const keyCount = await redis.dbsize();
```

## Properties

### `status: string`

Current connection status.

```typescript
console.log(redis.status); // 'disconnected', 'connecting', 'connected', 'ready', 'error', 'end'
```

### `options: RedisOptions`

Current connection options.

```typescript
console.log(redis.options.host); // 'localhost'
```

## Events

The adapter extends EventEmitter and emits these events:

```typescript
redis.on('connect', () => console.log('Connected'));
redis.on('ready', () => console.log('Ready for commands'));
redis.on('error', (err) => console.error('Error:', err));
redis.on('close', () => console.log('Connection closed'));
redis.on('end', () => console.log('Connection ended'));
```

## Type Definitions

```typescript
// Main adapter class
class RedisAdapter extends EventEmitter {
  constructor(options?: RedisOptions);
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isReady(): Promise<RedisAdapter>;
  
  // All Redis commands...
}

// Configuration interface
interface RedisOptions {
  host?: string;
  port?: number;
  password?: string;
  username?: string;
  db?: number;
  keyPrefix?: string;
  lazyConnect?: boolean;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableAutoPipelining?: boolean;
  maxCommandsInFlight?: number;
}

// Multi/pipeline interface
interface MultiAdapter {
  exec(): Promise<any[]>;
  // All Redis commands for chaining...
}
```