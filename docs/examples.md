# Examples

Common operations with the Valkey GLIDE ioredis Adapter.

## Basic Setup

```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

await redis.connect();
```

## String Operations

```typescript
// Set and get
await redis.set('user:name', 'John Doe');
const name = await redis.get('user:name'); // "John Doe"

// Set with expiration
await redis.set('session:abc', 'data', 'EX', 60); // 60 seconds

// Multiple keys
await redis.mset('key1', 'value1', 'key2', 'value2');
const values = await redis.mget('key1', 'key2'); // ['value1', 'value2']
```

## Hash Operations

```typescript
// Set hash fields
await redis.hset('user:123', {
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
});

// Get hash fields
const name = await redis.hget('user:123', 'name'); // "Alice"
const user = await redis.hgetall('user:123'); // Object with all fields
```

## List Operations

```typescript
// Push to list
await redis.lpush('messages', 'Hello', 'World');

// Pop from list
const message = await redis.rpop('messages'); // "Hello"

// Get list range
const messages = await redis.lrange('messages', 0, -1); // All messages
```

## Set Operations

```typescript
// Add to set
await redis.sadd('tags', 'redis', 'database', 'cache');

// Check membership
const isMember = await redis.sismember('tags', 'redis'); // true

// Get all members
const tags = await redis.smembers('tags'); // ['redis', 'database', 'cache']
```

## Sorted Set Operations

```typescript
// Add with scores
await redis.zadd('leaderboard', 100, 'player1', 200, 'player2');

// Get by rank
const top = await redis.zrevrange('leaderboard', 0, 2); // Top 3 players

// Get with scores
const withScores = await redis.zrevrange('leaderboard', 0, -1, 'WITHSCORES');
```

## JSON Operations (requires ValkeyJSON module)

```typescript
// Set JSON document
await redis.call('JSON.SET', 'user:456', '$', JSON.stringify({
  name: 'Bob',
  age: 30,
  skills: ['JavaScript', 'Redis']
}));

// Get JSON path
const age = await redis.call('JSON.GET', 'user:456', '$.age'); // [30]
```

## Transactions

```typescript
const multi = redis.multi();
multi.set('key1', 'value1');
multi.incr('counter');
multi.lpush('list', 'item');

const results = await multi.exec();
// Array of [error, result] pairs
```

## Pipelines

```typescript
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.get('key2');
pipeline.del('key3');

const results = await pipeline.exec();
```

## Pub/Sub

```typescript
// Publisher
await redis.publish('news', 'Breaking news!');

// Subscriber
const subscriber = new Redis({ /* config */ });
subscriber.subscribe('news');
subscriber.on('message', (channel, message) => {
  console.log(`${channel}: ${message}`);
});
```

## Error Handling

```typescript
try {
  await redis.get('nonexistent');
} catch (error) {
  console.error('Redis error:', error.message);
} finally {
  await redis.quit();
}
```

## Cleanup

```typescript
// Always clean up connections
await redis.quit();
```

All examples work identically to ioredis - just with better performance from GLIDE's Rust core.