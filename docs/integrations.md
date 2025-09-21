# Library Integrations

Production-ready integrations with popular Node.js libraries.

## Bull/BullMQ Job Queues

**Installation**
```bash
npm install bull bullmq valkey-glide-ioredis-adapter
```

**Bull Configuration**
```typescript
import Queue from 'bull';
import { Redis } from 'valkey-glide-ioredis-adapter';

const myQueue = new Queue('jobs', {
  createClient: (type) => new Redis({
    host: 'localhost',
    port: 6379,
    lazyConnect: false,
    maxRetriesPerRequest: type === 'client' ? 3 : null
  })
});
```

**BullMQ Configuration**
```typescript
import { Queue, Worker } from 'bullmq';
import { Redis } from 'valkey-glide-ioredis-adapter';

const connection = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: false,
  maxRetriesPerRequest: null
});

const queue = new Queue('emails', { connection });
const worker = new Worker('emails', async (job) => {
  // Process job
}, { connection });
```

## Express Sessions

**Installation**
```bash
npm install express-session connect-redis
```

**Configuration**
```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { Redis } from 'valkey-glide-ioredis-adapter';

const redis = new Redis({ host: 'localhost', port: 6379 });

app.use(session({
  store: new RedisStore({ client: redis }),
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1800000 }
}));
```

## Socket.IO Real-time

**Installation**
```bash
npm install socket.io @socket.io/redis-adapter
```

**Configuration**
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'valkey-glide-ioredis-adapter';

const pubClient = new Redis({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## Rate Limiting

**Installation**
```bash
npm install express-rate-limit rate-limit-redis
```

**Configuration**
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'valkey-glide-ioredis-adapter';

const redis = new Redis({ host: 'localhost', port: 6379 });

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // requests per window
});

app.use('/api', limiter);
```

## Caching Patterns

**Cache-aside pattern**
```typescript
async function getUser(userId) {
  const cacheKey = `user:${userId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Cache miss - fetch from database
  const user = await database.findUser(userId);

  // Store in cache with TTL
  await redis.setex(cacheKey, 3600, JSON.stringify(user));
  return user;
}
```

**Write-through caching**
```typescript
async function updateUser(userId, updates) {
  await redis.hset(`user:${userId}`, updates);
  await database.updateUser(userId, updates);
}
```

## Key Configuration Notes

**Bull/BullMQ Requirements:**
- `lazyConnect: false` - Bull requires immediate connection
- `maxRetriesPerRequest: null` - For subscriber connections

**Production Settings:**
```typescript
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false
};
```

All integrations work without code changes - just replace your ioredis import.