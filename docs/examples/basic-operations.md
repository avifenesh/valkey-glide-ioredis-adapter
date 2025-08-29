# Basic Operations Examples

Common Valkey operations using Valkey GLIDE ioredis Adapter.

## 🔧 Setup

```typescript
import { RedisAdapter } from 'valkey-glide-ioredis-adapter';

const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  password: 'your-password', // if needed
  db: 0
});

// Wait for Valkey connection
await redis.connect();
```

## 📝 String Operations

### Basic Set/Get
```typescript
// Set a string value
await redis.set('user:name', 'John Doe');

// Get the value
const name = await redis.get('user:name');
console.log(name); // "John Doe"

// Set with expiration (60 seconds)
await redis.set('session:abc123', 'user_data', 'EX', 60);

// Set only if key doesn't exist
const result = await redis.set('unique:id', 'value', 'NX');
console.log(result); // "OK" if set, null if key already exists
```

### Multiple Keys
```typescript
// Set multiple keys
await redis.mset({
  'user:1:name': 'Alice',
  'user:1:email': 'alice@example.com',
  'user:1:age': '25'
});

// Get multiple keys
const values = await redis.mget('user:1:name', 'user:1:email', 'user:1:age');
console.log(values); // ['Alice', 'alice@example.com', '25']
```

### Numeric Operations
```typescript
// Initialize counter
await redis.set('page:views', '0');

// Increment
const views = await redis.incr('page:views');
console.log(views); // 1

// Increment by amount
const newViews = await redis.incrby('page:views', 10);
console.log(newViews); // 11

// Decrement
await redis.decr('page:views'); // 10
```

## 🗂️ Hash Operations

### User Profile Example
```typescript
// Set user profile
await redis.hset('user:123', {
  name: 'John Doe',
  email: 'john@example.com',
  age: '30',
  city: 'New York'
});

// Get specific field
const name = await redis.hget('user:123', 'name');
console.log(name); // "John Doe"

// Get all fields
const profile = await redis.hgetall('user:123');
console.log(profile);
// {
//   name: 'John Doe',
//   email: 'john@example.com',
//   age: '30',
//   city: 'New York'
// }

// Get multiple fields
const info = await redis.hmget('user:123', 'name', 'email');
console.log(info); // ['John Doe', 'john@example.com']

// Check if field exists
const exists = await redis.hexists('user:123', 'phone');
console.log(exists); // 0 (false)

// Delete fields
await redis.hdel('user:123', 'age', 'city');
```

### Configuration Storage
```typescript
// Application settings
await redis.hset('app:config', {
  'feature.notifications': 'true',
  'feature.analytics': 'false',
  'max.upload.size': '10485760',
  'cache.ttl': '3600'
});

// Get setting
const notificationsEnabled = await redis.hget('app:config', 'feature.notifications') === 'true';

// Update setting
await redis.hset('app:config', 'feature.analytics', 'true');
```

## 📋 List Operations

### Task Queue Example
```typescript
// Add tasks to queue (FIFO)
await redis.lpush('tasks:pending', 'task1', 'task2', 'task3');

// Process tasks
while (true) {
  const task = await redis.rpop('tasks:pending');
  if (!task) break;
  
  console.log('Processing:', task);
  
  // Add to completed list
  await redis.lpush('tasks:completed', task);
}

// Get all completed tasks
const completed = await redis.lrange('tasks:completed', 0, -1);
console.log('Completed tasks:', completed);
```

### Recent Activity Log
```typescript
// Log user activity (keep last 100 entries)
async function logActivity(userId: string, action: string) {
  const key = `activity:${userId}`;
  
  await redis.lpush(key, JSON.stringify({
    action,
    timestamp: Date.now()
  }));
  
  // Trim to keep only last 100 entries
  await redis.ltrim(key, 0, 99);
}

// Usage
await logActivity('user123', 'login');
await logActivity('user123', 'view_profile');
await logActivity('user123', 'update_settings');

// Get recent activity
const recentActivity = await redis.lrange('activity:user123', 0, 9);
const activities = recentActivity.map(item => JSON.parse(item));
console.log('Last 10 activities:', activities);
```

### Message Queue with Blocking Pop
```typescript
// Producer: Add messages
await redis.lpush('messages', JSON.stringify({
  id: Date.now(),
  content: 'Hello World',
  priority: 'high'
}));

// Consumer: Block and wait for messages
const message = await redis.brpop('messages', 30); // Wait up to 30 seconds
if (message) {
  const [queueName, data] = message;
  const messageData = JSON.parse(data);
  console.log('Received:', messageData);
}
```

## 🎯 Set Operations

### User Interests
```typescript
// Add user interests
await redis.sadd('user:123:interests', 'technology', 'music', 'sports');
await redis.sadd('user:456:interests', 'music', 'art', 'travel');

// Check if user is interested in something
const isTechInterested = await redis.sismember('user:123:interests', 'technology');
console.log('Likes tech:', isTechInterested === 1);

// Get all interests
const interests = await redis.smembers('user:123:interests');
console.log('User interests:', interests);

// Find common interests
const commonInterests = await redis.sinter('user:123:interests', 'user:456:interests');
console.log('Common interests:', commonInterests); // ['music']

// Count interests
const interestCount = await redis.scard('user:123:interests');
console.log('Number of interests:', interestCount);
```

### Online Users Tracking
```typescript
// User comes online
await redis.sadd('users:online', 'user123', 'user456', 'user789');

// User goes offline
await redis.srem('users:online', 'user456');

// Get online users count
const onlineCount = await redis.scard('users:online');
console.log('Users online:', onlineCount);

// Check if user is online
const isOnline = await redis.sismember('users:online', 'user123');
console.log('User123 online:', isOnline === 1);

// Get all online users
const onlineUsers = await redis.smembers('users:online');
console.log('Online users:', onlineUsers);
```

## 🏆 Sorted Set Operations

### Leaderboard
```typescript
// Add player scores
await redis.zadd('leaderboard', 1500, 'alice', 1200, 'bob', 1800, 'charlie');

// Update score
await redis.zadd('leaderboard', 1600, 'alice');

// Get top 3 players
const top3 = await redis.zrevrange('leaderboard', 0, 2, 'WITHSCORES');
console.log('Top 3:', top3); // ['charlie', '1800', 'alice', '1600', 'bob', '1200']

// Get player rank (0-based, highest score first)
const aliceRank = await redis.zrevrank('leaderboard', 'alice');
console.log('Alice rank:', aliceRank + 1); // 2nd place

// Get player score
const aliceScore = await redis.zscore('leaderboard', 'alice');
console.log('Alice score:', aliceScore); // '1600'

// Get players in score range
const midRange = await redis.zrangebyscore('leaderboard', 1300, 1700, 'WITHSCORES');
console.log('Mid-range players:', midRange);
```

### Time-based Data
```typescript
// Store page views with timestamps
const now = Date.now();
await redis.zadd('page:views', 
  now - 3600000, 'page1',     // 1 hour ago
  now - 1800000, 'page2',     // 30 minutes ago
  now - 900000, 'page3',      // 15 minutes ago
  now, 'page4'                // now
);

// Get views from last 30 minutes
const thirtyMinutesAgo = now - 30 * 60 * 1000;
const recentViews = await redis.zrangebyscore('page:views', thirtyMinutesAgo, now);
console.log('Recent views:', recentViews); // ['page2', 'page3', 'page4']

// Remove old entries (older than 1 hour)
const oneHourAgo = now - 60 * 60 * 1000;
await redis.zremrangebyscore('page:views', 0, oneHourAgo);
```

## ⏰ Key Expiration

### Session Management
```typescript
// Set session with expiration
await redis.set('session:abc123', JSON.stringify({
  userId: 123,
  loginTime: Date.now()
}), 'EX', 3600); // Expire in 1 hour

// Check remaining time
const ttl = await redis.ttl('session:abc123');
console.log('Session expires in:', ttl, 'seconds');

// Extend session
await redis.expire('session:abc123', 7200); // Extend to 2 hours

// Remove expiration (make permanent)
await redis.persist('session:abc123');
```

### Cache with TTL
```typescript
// Cache API response
async function cacheApiResponse(endpoint: string, data: any, ttlSeconds: number = 300) {
  const key = `cache:api:${endpoint}`;
  await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
}

// Get cached data
async function getCachedResponse(endpoint: string) {
  const key = `cache:api:${endpoint}`;
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

// Usage
const apiData = { users: [...], total: 150 };
await cacheApiResponse('/api/users', apiData, 600); // Cache for 10 minutes

const cached = await getCachedResponse('/api/users');
if (cached) {
  console.log('Using cached data:', cached);
}
```

## 🔧 Key Management

### Pattern Matching
```typescript
// Find all user keys
const userKeys = await redis.keys('user:*');
console.log('User keys:', userKeys);

// Find session keys
const sessionKeys = await redis.keys('session:*');
console.log('Active sessions:', sessionKeys);

// Safer iteration with SCAN
let cursor = '0';
let allKeys = [];

do {
  const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'user:*', 'COUNT', 100);
  cursor = newCursor;
  allKeys.push(...keys);
} while (cursor !== '0');

console.log('All user keys:', allKeys);
```

### Bulk Operations
```typescript
// Delete multiple keys
const keysToDelete = await redis.keys('temp:*');
if (keysToDelete.length > 0) {
  await redis.del(...keysToDelete);
}

// Check multiple key existence
const existingCount = await redis.exists('user:1', 'user:2', 'user:3');
console.log('Existing keys count:', existingCount);

// Get key types
const keyType = await redis.type('user:123');
console.log('Key type:', keyType); // 'hash', 'string', 'list', etc.
```

## 🔄 Transactions

### Atomic Operations
```typescript
// Transfer points between users
async function transferPoints(fromUser: string, toUser: string, points: number) {
  const multi = redis.multi();
  
  // Check sender has enough points
  multi.hget(`user:${fromUser}`, 'points');
  const results = await multi.exec();
  
  const currentPoints = parseInt(results[0] || '0');
  if (currentPoints < points) {
    throw new Error('Insufficient points');
  }
  
  // Perform transfer atomically
  const transaction = redis.multi();
  transaction.hincrby(`user:${fromUser}`, 'points', -points);
  transaction.hincrby(`user:${toUser}`, 'points', points);
  transaction.hset('transactions', Date.now().toString(), 
    JSON.stringify({ from: fromUser, to: toUser, points }));
  
  await transaction.exec();
}

// Usage
await transferPoints('user123', 'user456', 100);
```

### Conditional Operations
```typescript
// Update only if value hasn't changed
async function conditionalUpdate(key: string, expectedValue: string, newValue: string) {
  await redis.watch(key);
  
  const currentValue = await redis.get(key);
  if (currentValue !== expectedValue) {
    await redis.unwatch();
    return false; // Value was modified by another client
  }
  
  const multi = redis.multi();
  multi.set(key, newValue);
  const results = await multi.exec();
  
  return results !== null; // null means transaction was discarded
}

// Usage
const success = await conditionalUpdate('config:version', '1.0', '1.1');
console.log('Update successful:', success);
```

## 🧹 Cleanup

Always properly close connections:

```typescript
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Valkey connection...');
  await redis.disconnect();
  process.exit(0);
});

// Or in application cleanup
await redis.disconnect();
```

These examples demonstrate the most common Valkey patterns using the GLIDE adapter. The API is identical to ioredis, making migration seamless.