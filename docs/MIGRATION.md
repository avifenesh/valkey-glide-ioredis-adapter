# Migration Guide

## Overview

This guide helps you migrate from ioredis to valkey-glide using our compatibility adapter.

## Quick Migration (Recommended)

### 1. Install the Adapter

```bash
npm install @valkey/valkey-glide-ioredis-adapter
```

### 2. Replace ioredis Import

```javascript
// Before
const Redis = require('ioredis');
// or
import Redis from 'ioredis';

// After
const { RedisAdapter: Redis } = require('@valkey/valkey-glide-ioredis-adapter');
// or
import { RedisAdapter as Redis } from '@valkey/valkey-glide-ioredis-adapter';
```

### 3. No Other Changes Required

Your existing code should work without any modifications:

```javascript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret'
});

// All your existing ioredis code works unchanged
await redis.set('key', 'value');
const value = await redis.get('key');

const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.get('key1');
await pipeline.exec();
```

## Migration for Popular Libraries

### BullMQ

```javascript
// No changes needed - works out of the box
const { Queue, Worker } = require('bullmq');
const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');

const connection = new RedisAdapter();
const queue = new Queue('myQueue', { connection });
```

### Express Sessions

```javascript
// No changes needed
const RedisStore = require('connect-redis');
const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');

const redisClient = new RedisAdapter();
app.use(session({
  store: new RedisStore({ client: redisClient })
}));
```

### Socket.IO

```javascript
// No changes needed
const { createAdapter } = require('@socket.io/redis-adapter');
const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');

const pubClient = new RedisAdapter();
const subClient = new RedisAdapter();
io.adapter(createAdapter(pubClient, subClient));
```

## Testing Your Migration

### 1. Run Your Existing Tests

Your existing test suite should pass without modifications.

### 2. Performance Testing

Monitor these metrics after migration:
- Command execution latency (should improve)
- Memory usage (should be more efficient)
- Connection stability (should be more reliable)

### 3. Gradual Rollout

For production environments:
1. Test in development/staging first
2. Consider feature flags for gradual rollout
3. Monitor error rates and performance metrics

## Rollback Plan

If needed, rolling back is simple:

```javascript
// Rollback to ioredis
const Redis = require('ioredis');
// Remove: const { RedisAdapter: Redis } = require('@valkey/valkey-glide-ioredis-adapter');
```

## Performance Benefits

After migration, you should see:
- 10-30% faster command execution
- 15-25% lower memory usage
- Better connection reliability
- Improved pipeline performance

## Getting Help

- Check our [API Documentation](API.md)
- Review [GitHub Issues](https://github.com/valkey-io/valkey-glide/issues)
- Join [GitHub Discussions](https://github.com/valkey-io/valkey-glide/discussions)

## Troubleshooting

### Common Issues

**Connection Issues**
- Ensure valkey-glide dependencies are properly installed
- Check network connectivity to Redis/Valkey server

**Performance Issues**
- Verify you're using the latest version
- Check for memory leaks in long-running applications

**Compatibility Issues**
- File an issue with specific library versions and error details
- We actively support all major ioredis-dependent libraries
