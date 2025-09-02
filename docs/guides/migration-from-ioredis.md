# Migration from ioredis

This guide helps you migrate from ioredis to Valkey GLIDE ioredis Adapter with minimal code changes.

## 🚀 Quick Migration

### 1. Installation
```bash
# Remove ioredis
npm uninstall ioredis

# Install GLIDE adapter
npm install valkey-glide-ioredis-adapter
```

### 2. Update Imports
```typescript
// Before
import Redis from 'ioredis';

// After  
import { Redis } from 'valkey-glide-ioredis-adapter';
```

### 3. Replace Constructor
```typescript
// Before
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret'
});

// After
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret'
});
```

That's it! Your existing Redis operations will work unchanged.

## 📋 Compatibility Matrix

| Feature | ioredis | GLIDE Adapter | Notes |
|---------|---------|---------------|-------|
| Basic Commands | ✅ | ✅ | 100% compatible |
| Transactions | ✅ | ✅ | Multi/exec fully supported |
| Lua Scripts | ✅ | ✅ | defineCommand works identically |
| Pipelines | ✅ | ✅ | Batch operations supported |
| Pub/Sub | ✅ | ✅ | Dual architecture: high-perf + binary modes |
| Streams | ✅ | ✅ | Full Redis Streams support |
| Cluster | ✅ | ✅ | Use Cluster class |
| Sentinel | ✅ | 📋 | Planned for v0.3.0 |

## ✅ Pub/Sub Migration

**Good News**: Pub/Sub now works identically to ioredis with our dual architecture!

### Traditional Event-Based (ioredis)
```typescript
const subscriber = new Redis();
subscriber.on('message', (channel, message) => {
  console.log(`${channel}: ${message}`);
});
await subscriber.subscribe('notifications');
```

### GLIDE Adapter - Zero Code Changes Required!
```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';

// High-performance mode (default) - works exactly like ioredis
const subscriber = new Redis({ host: 'localhost', port: 6379 });
subscriber.on('message', (channel, message) => {
  console.log(`${channel}: ${message}`);
});
await subscriber.subscribe('notifications');
```

### Binary Data Support (when needed)
```typescript
// For Socket.IO, MessagePack, or binary data
const subscriber = new Redis({ 
  host: 'localhost', 
  port: 6379,
  enableEventBasedPubSub: true  // Enable binary compatibility
});

subscriber.on('messageBuffer', (channel, message) => {
  console.log(`Binary message:`, message); // message is Buffer
});
await subscriber.subscribe('binary-channel');
```

## 🏗️ Library-Specific Migrations

### Bull Job Queue
```typescript
// Before (ioredis)
const Queue = require('bull');
const myQueue = new Queue('my queue');

// After (GLIDE Adapter) - Zero changes!
const Queue = require('bull');
const { Redis } = require('valkey-glide-ioredis-adapter');

const myQueue = new Queue('my queue', {
  createClient: (type) => {
    return new Redis({ host: 'localhost', port: 6379 });
  }
});
```

### BullMQ
```typescript
// Before (ioredis)
import { Queue, Worker } from 'bullmq';
const myQueue = new Queue('my queue');

// After (GLIDE Adapter)
import { Queue, Worker } from 'bullmq';
import { Redis } from 'valkey-glide-ioredis-adapter';

const connection = new Redis({ host: 'localhost', port: 6379 });
const myQueue = new Queue('my queue', { connection });
```

### Socket.IO Redis Adapter
```typescript
// Before (ioredis)
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

// After (GLIDE Adapter) - Automatically uses binary-compatible mode
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'valkey-glide-ioredis-adapter';

const pubClient = new Redis({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate(); // Use duplicate() for efficiency
io.adapter(createAdapter(pubClient, subClient));
```

### Express Session Store
```typescript
// Before (ioredis)
import session from 'express-session';
import connectRedis from 'connect-redis';
import Redis from 'ioredis';

const RedisStore = connectRedis(session);
const client = new Redis();

app.use(session({
  store: new RedisStore({ client }),
  secret: 'secret'
}));

// After (GLIDE Adapter)
import session from 'express-session';
import connectRedis from 'connect-redis';
import { Redis } from 'valkey-glide-ioredis-adapter';

const RedisStore = connectRedis(session);
const client = new Redis();

app.use(session({
  store: new RedisStore({ client }),
  secret: 'secret'
}));
```

## ⚡ Performance Improvements

After migration, you should see performance improvements:

### Benchmark Comparison
```typescript
// Benchmark your migration
import { performance } from 'perf_hooks';

const iterations = 10000;
const start = performance.now();

for (let i = 0; i < iterations; i++) {
  await redis.set(`key:${i}`, `value:${i}`);
}

const end = performance.now();
console.log(`${iterations} SET operations: ${end - start}ms`);
console.log(`Rate: ${iterations / ((end - start) / 1000)} ops/sec`);
```

Note: Performance characteristics depend on your specific use case and workload. Benchmark your own application to measure actual improvements.

## 🔧 Configuration Differences

### Connection Options
Most options work identically, with these additions:

```typescript
const redis = new Redis({
  // Standard ioredis options work
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  
  // GLIDE-specific optimizations
  lazyConnect: false,              // Connect immediately
  enableEventBasedPubSub: true,    // Binary pub/sub support
  maxCommandsInFlight: 1000,       // Concurrent command limit
  enableAutoPipelining: true       // Automatic batching
});
```

### Cluster Configuration
```typescript
// Before (ioredis)
const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 7000 },
  { host: '127.0.0.1', port: 7001 }
]);

// After (GLIDE Adapter)
import { Cluster } from 'valkey-glide-ioredis-adapter';

const cluster = new Cluster([
  { host: '127.0.0.1', port: 7000 },
  { host: '127.0.0.1', port: 7001 }
]);
```

## 🧪 Testing Your Migration

1. **Run Existing Tests**: Your current test suite should pass unchanged

2. **Performance Testing**:
   ```bash
   npm run test:performance
   ```

3. **Integration Testing**: 
   ```bash
   npm run test:integration
   ```

4. **Load Testing**: Use your existing load testing setup

## 🚨 Common Issues

### Issue: "Cannot find module" Error
**Solution**: Ensure you've updated all imports:
```typescript
// Check for remaining ioredis imports
import Redis from 'ioredis'; // ❌ Remove this
import { Redis } from 'valkey-glide-ioredis-adapter'; // ✅ Use this
```

### Issue: Pub/Sub Events Not Firing
**Solution**: Enable binary-compatible mode if using binary data:
```typescript
const subscriber = new Redis({
  host: 'localhost', 
  port: 6379,
  enableEventBasedPubSub: true // Enable for Socket.IO/binary data
});
```

### Issue: Performance Regression  
**Solution**: Enable GLIDE optimizations:
```typescript
const redis = new Redis({
  // ... other options
  lazyConnect: false,          // Connect immediately
  enableAutoPipelining: true   // Enable automatic batching
});
```

## 📈 Rollback Plan

If you need to rollback:

1. **Reinstall ioredis**:
   ```bash
   npm uninstall valkey-glide-ioredis-adapter
   npm install ioredis
   ```

2. **Revert imports**:
   ```typescript
   // Change back to
   import Redis from 'ioredis';
   const redis = new Redis();
   ```

3. **Update Pub/Sub code** back to event-based pattern

## ✅ Migration Checklist

- [ ] Install valkey-glide-ioredis-adapter
- [ ] Update all imports
- [ ] Replace Redis constructors
- [ ] Migrate Pub/Sub patterns (if used)
- [ ] Update library integrations
- [ ] Test basic operations
- [ ] Run full test suite
- [ ] Performance testing
- [ ] Deploy to staging
- [ ] Monitor performance metrics
- [ ] Deploy to production

## 🆘 Getting Help

- **Migration Issues**: [Open an issue](https://github.com/avifenesh/valkey-glide-ioredis-adapter/issues/new?template=bug_report.yml)
- **Performance Questions**: [Start a discussion](https://github.com/avifenesh/valkey-glide-ioredis-adapter/discussions)
- **Library Integration**: Check our [integration guides](../guides/)

Happy migrating! 🎉