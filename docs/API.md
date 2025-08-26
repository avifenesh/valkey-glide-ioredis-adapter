# ioredis Adapter API Documentation

Complete API reference for the ioredis adapter for valkey-glide.

## Table of Contents

- [RedisAdapter Class](#redisadapter-class)
- [Connection Management](#connection-management)
- [String Commands](#string-commands)
- [Hash Commands](#hash-commands)
- [List Commands](#list-commands)
- [Set Commands](#set-commands)
- [Key Management](#key-management)
- [Pipeline Operations](#pipeline-operations)
- [Pub/Sub Operations](#pubsub-operations)
- [Cluster Operations](#cluster-operations)
- [Events](#events)
- [Error Handling](#error-handling)

## RedisAdapter Class

The main adapter class that provides ioredis-compatible API.

### Constructor

```
new RedisAdapter()
new RedisAdapter(port: number, host?: string)
new RedisAdapter(options: RedisOptions)
new RedisAdapter(url: string)
```

### Connection Options

```typescript
interface RedisOptions {
  port?: number;
  host?: string;
  username?: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectTimeout?: number;
  commandTimeout?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
}
```

### Methods

#### Connection Management
- `connect(): Promise<void>` - Establish connection
- `disconnect(): Promise<void>` - Close connection
- `ping(message?: string): Promise<string>` - Ping server

#### String Commands
- `set(key, value, ...args): Promise<string | null>`
- `get(key): Promise<string | null>`
- `mget(...keys): Promise<(string | null)[]>`
- `mset(...args): Promise<string>`
- `incr(key): Promise<number>`
- `decr(key): Promise<number>`
- `del(...keys): Promise<number>`

#### Hash Commands
- `hset(key, field, value): Promise<number>`
- `hget(key, field): Promise<string | null>`
- `hmset(key, hash): Promise<string>`
- `hmget(key, ...fields): Promise<(string | null)[]>`
- `hgetall(key): Promise<Record<string, string>>`
- `hdel(key, ...fields): Promise<number>`

#### List Commands
- `lpush(key, ...elements): Promise<number>`
- `rpush(key, ...elements): Promise<number>`
- `lpop(key): Promise<string | null>`
- `rpop(key): Promise<string | null>`
- `lrange(key, start, stop): Promise<string[]>`
- `llen(key): Promise<number>`

#### Key Commands
- `exists(...keys): Promise<number>`
- `expire(key, seconds): Promise<number>`
- `ttl(key): Promise<number>`
- `type(key): Promise<string>`
- `keys(pattern?: string): Promise<string[]>`

#### Pipeline Operations
- `pipeline(): Pipeline` - Create pipeline
- `multi(): Multi` - Create transaction

#### Pub/Sub
- `publish(channel, message): Promise<number>`
- `subscribe(...channels): Promise<number>`
- `unsubscribe(...channels): Promise<number>`

#### Generic Commands
- `call(command, ...args): Promise<any>` - Execute arbitrary Redis command

### Events

The adapter extends EventEmitter and supports these events:

- `connect` - Connection established
- `ready` - Client ready for commands
- `error` - Connection or command error
- `close` - Connection closed
- `reconnecting` - Attempting to reconnect
- `end` - Connection ended

### Example Usage

```
import { RedisAdapter } from '@valkey/valkey-glide-ioredis-adapter';

const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  password: 'secret'
});

// Connect
await redis.connect();

// Basic operations
await redis.set('key', 'value');
const value = await redis.get('key');

// Pipeline
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.get('key1');
const results = await pipeline.exec();

// Cleanup
await redis.disconnect();
```

For complete examples with real-world libraries, see the [README](README.md).

## Connection Management

### connect()

Manually connect to Redis server.

```
await redis.connect(): Promise<void>
```

#### Example

```
const redis = new RedisAdapter({ lazyConnect: true });
await redis.connect();
console.log('Connected to Redis');
```

### disconnect()

Disconnect from Redis server.

```
await redis.disconnect(): Promise<void>
```

#### Example

```
await redis.disconnect();
console.log('Disconnected from Redis');
```

### ping()

Test connection to Redis server.

```
await redis.ping(message?: string): Promise<string>
```

#### Parameters

- `message` - Optional message to echo back

#### Example

```
const pong = await redis.ping();
console.log(pong); // 'PONG'

const echo = await redis.ping('Hello Redis');
console.log(echo); // 'Hello Redis'
```

## String Commands

### get()

Get the value of a key.

```
await redis.get(key: string): Promise<string | null>
```

#### Parameters

- `key` - The key to retrieve

#### Example

```
await redis.set('mykey', 'Hello World');
const value = await redis.get('mykey');
console.log(value); // 'Hello World'

const missing = await redis.get('nonexistent');
console.log(missing); // null
```

### set()

Set the value of a key.

```
await redis.set(key: string, value: string | number | Buffer, ...args: any[]): Promise<string>
```

#### Parameters

- `key` - The key to set
- `value` - The value to set
- `args` - Additional arguments (EX, PX, NX, XX, etc.)

#### Example

```
// Basic set
await redis.set('key', 'value');

// Set with expiration (10 seconds)
await redis.set('key', 'value', 'EX', 10);
await redis.set('key', 'value', 'PX', 10000); // 10000 milliseconds

// Set only if key doesn't exist
await redis.set('key', 'value', 'NX');

// Set only if key exists
await redis.set('key', 'newvalue', 'XX');

// ioredis-style object syntax
await redis.set('key', 'value', { ex: 10 });
await redis.set('key', 'value', { px: 10000 });
await redis.set('key', 'value', { nx: true });
```

### mget()

Get values of multiple keys.

```
await redis.mget(...keys: string[]): Promise<(string | null)[]>
await redis.mget(keys: string[]): Promise<(string | null)[]>
```

#### Parameters

- `keys` - Array of keys or individual key arguments

#### Example

```
await redis.set('key1', 'value1');
await redis.set('key2', 'value2');

const values = await redis.mget('key1', 'key2', 'key3');
console.log(values); // ['value1', 'value2', null]

// Array syntax
const values2 = await redis.mget(['key1', 'key2']);
console.log(values2); // ['value1', 'value2']
```

### mset()

Set multiple key-value pairs.

```
await redis.mset(...args: (string | number)[]): Promise<string>
await redis.mset(object: Record<string, string | number>): Promise<string>
```

#### Parameters

- `args` - Alternating keys and values
- `object` - Object with key-value pairs

#### Example

```
// Argument syntax
await redis.mset('key1', 'value1', 'key2', 'value2');

// Object syntax
await redis.mset({
  key1: 'value1',
  key2: 'value2',
  key3: 123
});
```

### incr() / decr()

Increment or decrement a numeric value.

```
await redis.incr(key: string): Promise<number>
await redis.decr(key: string): Promise<number>
await redis.incrby(key: string, increment: number): Promise<number>
await redis.decrby(key: string, decrement: number): Promise<number>
await redis.incrbyfloat(key: string, increment: number): Promise<string>
```

#### Example

```
await redis.set('counter', '10');

const result1 = await redis.incr('counter');
console.log(result1); // 11

const result2 = await redis.incrby('counter', 5);
console.log(result2); // 16

const result3 = await redis.incrbyfloat('counter', 2.5);
console.log(result3); // '18.5'
```

## Hash Commands

### hget() / hset()

Get or set hash field values.

```
await redis.hget(key: string, field: string): Promise<string | null>
await redis.hset(key: string, field: string, value: string | number): Promise<number>
await redis.hset(key: string, object: Record<string, string | number>): Promise<number>
```

#### Example

```
// Set single field
await redis.hset('user:1', 'name', 'John Doe');
await redis.hset('user:1', 'age', 30);

// Set multiple fields with object
await redis.hset('user:1', {
  email: 'john@example.com',
  city: 'New York'
});

// Get field value
const name = await redis.hget('user:1', 'name');
console.log(name); // 'John Doe'
```

### hmget() / hmset()

Get or set multiple hash fields.

```
await redis.hmget(key: string, ...fields: string[]): Promise<(string | null)[]>
await redis.hmset(key: string, ...args: (string | number)[]): Promise<string>
await redis.hmset(key: string, object: Record<string, string | number>): Promise<string>
```

#### Example

```
// Set multiple fields
await redis.hmset('user:2', 'name', 'Jane Doe', 'age', 25);
await redis.hmset('user:2', { email: 'jane@example.com' });

// Get multiple fields
const values = await redis.hmget('user:2', 'name', 'age', 'email');
console.log(values); // ['Jane Doe', '25', 'jane@example.com']
```

### hgetall()

Get all fields and values of a hash.

```
await redis.hgetall(key: string): Promise<Record<string, string>>
```

#### Example

```
const user = await redis.hgetall('user:1');
console.log(user);
// {
//   name: 'John Doe',
//   age: '30',
//   email: 'john@example.com',
//   city: 'New York'
// }
```

## List Commands

### lpush() / rpush()

Add elements to the beginning or end of a list.

```
await redis.lpush(key: string, ...values: (string | number)[]): Promise<number>
await redis.rpush(key: string, ...values: (string | number)[]): Promise<number>
```

#### Example

```
// Add to beginning
await redis.lpush('mylist', 'first', 'second');

// Add to end
await redis.rpush('mylist', 'third', 'fourth');

// List is now: ['second', 'first', 'third', 'fourth']
```

### lpop() / rpop()

Remove and return elements from the beginning or end of a list.

```
await redis.lpop(key: string, count?: number): Promise<string | string[] | null>
await redis.rpop(key: string, count?: number): Promise<string | string[] | null>
```

#### Example

```
const first = await redis.lpop('mylist');
console.log(first); // 'second'

const last = await redis.rpop('mylist');
console.log(last); // 'fourth'

// Pop multiple elements
const multiple = await redis.lpop('mylist', 2);
console.log(multiple); // ['first', 'third'] or just 'first' if only one element
```

### lrange()

Get a range of elements from a list.

```
await redis.lrange(key: string, start: number, stop: number): Promise<string[]>
```

#### Example

```
await redis.rpush('numbers', '1', '2', '3', '4', '5');

const all = await redis.lrange('numbers', 0, -1);
console.log(all); // ['1', '2', '3', '4', '5']

const subset = await redis.lrange('numbers', 1, 3);
console.log(subset); // ['2', '3', '4']
```

## Pipeline Operations

### pipeline()

Create a pipeline for batching commands.

```
redis.pipeline(): Pipeline
```

#### Example

```
const pipeline = redis.pipeline();

pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.get('key1');
pipeline.incr('counter');
pipeline.expire('key1', 60);

const results = await pipeline.exec();
console.log(results);
// [
//   [null, 'OK'],        // set key1
//   [null, 'OK'],        // set key2
//   [null, 'value1'],    // get key1
//   [null, 1],           // incr counter
//   [null, 1]            // expire key1
// ]
```

### multi()

Create a transaction block.

```
redis.multi(): Multi
```

#### Example

```
const multi = redis.multi();

multi.set('key1', 'value1');
multi.set('key2', 'value2');
multi.incr('counter');

const results = await multi.exec();
console.log(results);
// [
//   [null, 'OK'],
//   [null, 'OK'], 
//   [null, 1]
// ]
```

## Pub/Sub Operations

### subscribe() / unsubscribe()

Subscribe to channels.

```
await redis.subscribe(...channels: string[]): Promise<void>
await redis.unsubscribe(...channels: string[]): Promise<void>
```

#### Example

```
// Subscribe to channels
await redis.subscribe('news', 'updates');

// Listen for messages
redis.on('message', (channel, message) => {
  console.log(`Received: ${message} from ${channel}`);
});

// Unsubscribe
await redis.unsubscribe('news');
```

### psubscribe() / punsubscribe()

Subscribe to channel patterns.

```
await redis.psubscribe(...patterns: string[]): Promise<void>
await redis.punsubscribe(...patterns: string[]): Promise<void>
```

#### Example

```
// Subscribe to patterns
await redis.psubscribe('news:*', 'alerts:*');

// Listen for pattern messages
redis.on('pmessage', (pattern, channel, message) => {
  console.log(`Pattern ${pattern} matched ${channel}: ${message}`);
});

// Unsubscribe from patterns
await redis.punsubscribe('news:*');
```

### publish()

Publish a message to a channel.

```
await redis.publish(channel: string, message: string): Promise<number>
```

#### Example

```
const subscribers = await redis.publish('news', 'Breaking news!');
console.log(`Message sent to ${subscribers} subscribers`);
```

## Events

The adapter emits the same events as ioredis for full compatibility.

### Connection Events

```
redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('ready', () => {
  console.log('Redis is ready to accept commands');
});

redis.on('error', (error) => {
  console.error('Redis error:', error);
});

redis.on('close', () => {
  console.log('Connection to Redis closed');
});

redis.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
});

redis.on('end', () => {
  console.log('Redis connection ended');
});
```

### Pub/Sub Events

```
redis.on('subscribe', (channel, count) => {
  console.log(`Subscribed to ${channel}, total: ${count}`);
});

redis.on('unsubscribe', (channel, count) => {
  console.log(`Unsubscribed from ${channel}, remaining: ${count}`);
});

redis.on('message', (channel, message) => {
  console.log(`Message from ${channel}: ${message}`);
});

redis.on('psubscribe', (pattern, count) => {
  console.log(`Pattern subscribed: ${pattern}, total: ${count}`);
});

redis.on('punsubscribe', (pattern, count) => {
  console.log(`Pattern unsubscribed: ${pattern}, remaining: ${count}`);
});

redis.on('pmessage', (pattern, channel, message) => {
  console.log(`Pattern ${pattern} on ${channel}: ${message}`);
});
```

## Error Handling

The adapter provides ioredis-compatible error handling.

### Error Types

```
import { RedisAdapter, ReplyError } from '@valkey/valkey-glide-ioredis-adapter';

try {
  await redis.get('nonexistent-key');
} catch (error) {
  if (error instanceof ReplyError) {
    console.error('Redis command error:', error.message);
  } else {
    console.error('Connection error:', error);
  }
}
```

### Error Events

```
redis.on('error', (error) => {
  console.error('Redis error:', error.message);
  
  // Handle specific error types
  if (error.code === 'ECONNREFUSED') {
    console.error('Redis server is not running');
  } else if (error.code === 'NOAUTH') {
    console.error('Authentication failed');
  }
});
```

## Performance Tips

### Connection Reuse

```
// Good: Reuse connection
const redis = new RedisAdapter();
await redis.set('key1', 'value1');
await redis.set('key2', 'value2');

// Bad: Multiple connections
const redis1 = new RedisAdapter();
const redis2 = new RedisAdapter();
```

### Pipeline for Batch Operations

```
// Good: Use pipeline for multiple commands
const pipeline = redis.pipeline();
for (let i = 0; i < 1000; i++) {
  pipeline.set(`key:${i}`, `value:${i}`);
}
await pipeline.exec();

// Bad: Individual commands
for (let i = 0; i < 1000; i++) {
  await redis.set(`key:${i}`, `value:${i}`); // Each command waits
}
```

### Proper Connection Management

```
// Application startup
const redis = new RedisAdapter({
  retryDelayOnFailover: 100,
  connectTimeout: 10000,
  lazyConnect: false
});

// Application shutdown
process.on('SIGTERM', async () => {
  await redis.disconnect();
  process.exit(0);
});
```

## Migration from ioredis

The adapter is designed for drop-in compatibility. Simply replace your ioredis imports:

```
// Before
import Redis from 'ioredis';
const redis = new Redis();

// After
import { RedisAdapter as Redis } from '@valkey/valkey-glide-ioredis-adapter';
const redis = new Redis();

// All your existing code continues to work!
```

For advanced use cases, see the [Migration Guide](MIGRATION.md).