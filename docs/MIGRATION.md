# Migration Guide: ioredis to valkey-glide Adapter

This guide provides step-by-step instructions for migrating from ioredis to the valkey-glide adapter with minimal code changes.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Basic Migration Steps](#basic-migration-steps)
- [Code Changes Required](#code-changes-required)
- [Feature-Specific Migration](#feature-specific-migration)
- [Performance Considerations](#performance-considerations)
- [Testing Migration](#testing-migration)
- [Common Issues and Solutions](#common-issues-and-solutions)
- [Advanced Migration Scenarios](#advanced-migration-scenarios)

## Overview

The ioredis adapter for valkey-glide provides a compatibility layer that allows existing ioredis applications to benefit from valkey-glide's performance improvements with minimal code changes.

### Migration Benefits

- **Performance**: 20-50% faster command execution
- **Memory Efficiency**: Reduced memory footprint
- **Reliability**: Battle-tested connection handling
- **Compatibility**: 95%+ API compatibility with ioredis

### What's Different

- Built on Rust-based valkey-glide core
- Optimized pipeline operations
- Enhanced connection management
- Modern async/await patterns

## Prerequisites

Before starting the migration:

1. **Node.js Version**: Ensure you're running Node.js 18.0.0 or higher
2. **Redis/Valkey Server**: Compatible with Redis 6.2+ or Valkey 7.0+
3. **TypeScript**: If using TypeScript, ensure version 5.0 or higher
4. **Testing Environment**: Have a staging environment ready for testing

## Installation

### Step 1: Install the Adapter

```bash
# Install the adapter
npm install @valkey/valkey-glide-ioredis-adapter

# Keep ioredis temporarily for comparison testing (optional)
npm install ioredis@latest
```

### Step 2: Verify Installation

```javascript
const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');
const redis = new RedisAdapter();

redis.ping().then((result) => {
  console.log('Adapter working:', result); // Should print 'PONG'
  redis.disconnect();
});
```

## Basic Migration Steps

### Step 1: Update Imports

The simplest migration approach is aliasing the adapter as Redis:

```javascript
// Before (ioredis)
const Redis = require('ioredis');

// After (adapter) - alias for drop-in replacement
const { RedisAdapter: Redis } = require('@valkey/valkey-glide-ioredis-adapter');

// Your existing code remains unchanged
const redis = new Redis();
```

**TypeScript:**

```typescript
// Before
import Redis from 'ioredis';

// After
import { RedisAdapter as Redis } from '@valkey/valkey-glide-ioredis-adapter';

// All existing code continues to work
const redis = new Redis();
```

### Step 2: Update Configuration (If Needed)

Most ioredis configuration options are supported:

```javascript
// This configuration works with both ioredis and the adapter
const redis = new Redis({
  port: 6379,
  host: 'localhost',
  password: 'your-password',
  db: 0,
  retryDelayOnFailover: 100,
  connectTimeout: 10000,
  lazyConnect: true
});
```

### Step 3: Test Basic Operations

Verify that basic operations work:

```javascript
async function testBasicOperations() {
  try {
    // Test basic operations
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    console.log('Basic test passed:', value === 'test-value');
    
    // Test pipeline
    const pipeline = redis.pipeline();
    pipeline.set('key1', 'value1');
    pipeline.get('key1');
    const results = await pipeline.exec();
    console.log('Pipeline test passed:', results[1][1] === 'value1');
    
  } catch (error) {
    console.error('Migration test failed:', error);
  }
}

testBasicOperations();
```

## Code Changes Required

### Minimal Changes Approach

For most applications, only the import statement needs to change:

```javascript
// File: redis-client.js

// OLD
// const Redis = require('ioredis');

// NEW
const { RedisAdapter: Redis } = require('@valkey/valkey-glide-ioredis-adapter');

// Everything else stays the same
const redis = new Redis(process.env.REDIS_URL);

module.exports = redis;
```

### Zero-Change Migration for ES Modules

Create a simple wrapper module:

```javascript
// File: redis.js (wrapper)
export { RedisAdapter as default } from '@valkey/valkey-glide-ioredis-adapter';
```

```javascript
// Your existing code (unchanged)
import Redis from './redis.js'; // Points to wrapper instead of ioredis

const redis = new Redis();
await redis.set('key', 'value');
```

### TypeScript Declaration Updates

If you have custom Redis type declarations, they should work as-is:

```typescript
// Your existing types work
interface UserSession {
  userId: string;
  sessionData: any;
}

class SessionStore {
  constructor(private redis: Redis) {} // Works with adapter
  
  async setSession(sessionId: string, data: UserSession): Promise<void> {
    await this.redis.setex(sessionId, 3600, JSON.stringify(data));
  }
}
```

## Feature-Specific Migration

### Pub/Sub Migration

Pub/Sub operations require no code changes:

```javascript
// Subscriber (unchanged code)
const subscriber = new Redis();

subscriber.subscribe('channel1');
subscriber.on('message', (channel, message) => {
  console.log(`Received ${message} from ${channel}`);
});

// Publisher (unchanged code)  
const publisher = new Redis();
await publisher.publish('channel1', 'Hello World');
```

### Pipeline Migration

Pipeline operations work identically:

```javascript
// No changes needed
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.incr('counter');
pipeline.expire('key1', 60);

const results = await pipeline.exec();
// Results format is identical to ioredis
```

### Cluster Migration (Future)

Cluster support will be available in a future release:

```javascript
// Coming soon - cluster adapter
const { ClusterAdapter } = require('@valkey/valkey-glide-ioredis-adapter');

const cluster = new ClusterAdapter([
  { host: 'redis-node1', port: 6379 },
  { host: 'redis-node2', port: 6379 },
  { host: 'redis-node3', port: 6379 }
]);
```

## Performance Considerations

### Expected Performance Improvements

| Operation Type | Expected Improvement |
|----------------|---------------------|
| Simple Commands (GET/SET) | 20-30% faster |
| Pipeline Operations | 30-50% faster |
| Memory Usage | 15-25% reduction |
| Connection Stability | Significantly improved |

### Monitoring Performance

Add performance monitoring to verify improvements:

```javascript
// Performance monitoring wrapper
class PerformanceMonitor {
  constructor(redis) {
    this.redis = redis;
    this.metrics = {
      commandCount: 0,
      totalTime: 0
    };
  }
  
  async get(key) {
    const start = Date.now();
    const result = await this.redis.get(key);
    this.recordMetric(Date.now() - start);
    return result;
  }
  
  recordMetric(duration) {
    this.metrics.commandCount++;
    this.metrics.totalTime += duration;
  }
  
  getAverageTime() {
    return this.metrics.totalTime / this.metrics.commandCount;
  }
}

// Usage
const redis = new Redis();
const monitor = new PerformanceMonitor(redis);

// Use monitor.get() instead of redis.get() to track performance
```

### Optimization Tips

1. **Connection Reuse**: The adapter optimizes connection reuse automatically
2. **Pipeline Batching**: Use pipelines for multiple operations
3. **Memory Management**: The adapter handles memory more efficiently

```javascript
// Optimized pattern (works with both ioredis and adapter)
const pipeline = redis.pipeline();
for (const item of largeDataSet) {
  pipeline.hset(`item:${item.id}`, item);
}
await pipeline.exec(); // Executes all at once
```

## Testing Migration

### A/B Testing Setup

Run both ioredis and the adapter in parallel for comparison:

```javascript
// A/B testing setup
const ioredis = require('ioredis');
const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');

class ABTestRedis {
  constructor() {
    this.ioredisClient = new ioredis();
    this.adapterClient = new RedisAdapter();
    this.useAdapter = Math.random() > 0.5; // 50% traffic to adapter
  }
  
  async get(key) {
    const client = this.useAdapter ? this.adapterClient : this.ioredisClient;
    const start = Date.now();
    const result = await client.get(key);
    const duration = Date.now() - start;
    
    console.log(`${this.useAdapter ? 'Adapter' : 'ioredis'} GET took ${duration}ms`);
    return result;
  }
}
```

### Unit Test Migration

Your existing ioredis tests should pass with minimal changes:

```javascript
// Test file (minimal changes)
// const Redis = require('ioredis');
const { RedisAdapter: Redis } = require('@valkey/valkey-glide-ioredis-adapter');

describe('Redis Operations', () => {
  let redis;
  
  beforeEach(async () => {
    redis = new Redis();
    await redis.flushall(); // Clear test data
  });
  
  afterEach(async () => {
    await redis.disconnect();
  });
  
  // All existing tests should pass unchanged
  it('should set and get values', async () => {
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    expect(value).toBe('test-value');
  });
  
  it('should handle pipelines', async () => {
    const pipeline = redis.pipeline();
    pipeline.set('key1', 'value1');
    pipeline.get('key1');
    const results = await pipeline.exec();
    
    expect(results[0][1]).toBe('OK');
    expect(results[1][1]).toBe('value1');
  });
});
```

### Integration Testing

Test with your actual application stack:

```javascript
// Integration test example
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');

const app = express();
const redis = new RedisAdapter();

// Test session storage with adapter
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: 'your-secret',
  resave: false,
  saveUninitialized: false
}));

// Your existing middleware and routes work unchanged
```

## Common Issues and Solutions

### Issue 1: Import Errors

**Problem:** Module import fails
```
Error: Cannot find module '@valkey/valkey-glide-ioredis-adapter'
```

**Solution:**
```bash
# Verify installation
npm ls @valkey/valkey-glide-ioredis-adapter

# Reinstall if needed
npm uninstall @valkey/valkey-glide-ioredis-adapter
npm install @valkey/valkey-glide-ioredis-adapter
```

### Issue 2: TypeScript Compilation Errors

**Problem:** TypeScript cannot resolve types

**Solution:**
```typescript
// Add explicit type imports if needed
import { RedisAdapter, RedisOptions } from '@valkey/valkey-glide-ioredis-adapter';

const options: RedisOptions = {
  port: 6379,
  host: 'localhost'
};

const redis = new RedisAdapter(options);
```

### Issue 3: Event Handler Issues

**Problem:** Some events may behave slightly differently

**Solution:**
```javascript
// Add error handling for event differences
redis.on('error', (error) => {
  console.error('Redis error:', error);
  // Add fallback logic if needed
});

redis.on('connect', () => {
  console.log('Connected to Redis via adapter');
});
```

### Issue 4: Command Not Supported

**Problem:** A specific ioredis command is not yet implemented

**Solution:**
```javascript
// Fallback to custom command
try {
  await redis.someCommand(args);
} catch (error) {
  if (error.message.includes('not implemented')) {
    // Use custom command as fallback
    const result = await redis.call('SOMECOMMAND', ...args);
    return result;
  }
  throw error;
}
```

## Advanced Migration Scenarios

### Large-Scale Application Migration

For applications with heavy Redis usage:

1. **Gradual Rollout**: Migrate service by service
2. **Feature Flags**: Use feature flags to control adapter usage
3. **Monitoring**: Implement comprehensive monitoring

```javascript
// Feature flag-controlled migration
class RedisFactory {
  static create() {
    const useAdapter = process.env.USE_VALKEY_ADAPTER === 'true';
    
    if (useAdapter) {
      const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');
      return new RedisAdapter();
    } else {
      const Redis = require('ioredis');
      return new Redis();
    }
  }
}

// Usage throughout application
const redis = RedisFactory.create();
```

### Microservices Migration

Migrate microservices independently:

```javascript
// Service-specific configuration
const config = {
  userService: { useAdapter: true },
  orderService: { useAdapter: false },
  notificationService: { useAdapter: true }
};

function createRedisClient(serviceName) {
  const useAdapter = config[serviceName]?.useAdapter || false;
  
  if (useAdapter) {
    const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');
    return new RedisAdapter();
  } else {
    const Redis = require('ioredis');
    return new Redis();
  }
}
```

### Database Migration with Adapter

If migrating from Redis to Valkey server as well:

```javascript
// Environment-based configuration
const redisConfig = {
  development: {
    client: 'adapter',
    host: 'localhost',
    port: 6379
  },
  staging: {
    client: 'adapter', 
    host: 'valkey-staging',
    port: 6379
  },
  production: {
    client: 'adapter',
    host: 'valkey-cluster',
    port: 6379
  }
};

function createClient() {
  const env = process.env.NODE_ENV || 'development';
  const config = redisConfig[env];
  
  if (config.client === 'adapter') {
    const { RedisAdapter } = require('@valkey/valkey-glide-ioredis-adapter');
    return new RedisAdapter(config);
  } else {
    const Redis = require('ioredis');
    return new Redis(config);
  }
}
```

## Best Practices

### 1. Gradual Migration
- Start with non-critical services
- Use feature flags for easy rollback
- Monitor performance metrics

### 2. Testing Strategy
- Run both clients in parallel initially
- Compare performance and behavior
- Have rollback plan ready

### 3. Error Handling
- Add comprehensive error logging
- Implement circuit breaker patterns
- Monitor error rates

### 4. Performance Monitoring
- Track command latencies
- Monitor memory usage
- Set up alerts for anomalies

## Rollback Strategy

If you need to rollback to ioredis:

```javascript
// Easy rollback with environment variable
const useAdapter = process.env.USE_VALKEY_ADAPTER === 'true';

let Redis;
if (useAdapter) {
  const adapter = require('@valkey/valkey-glide-ioredis-adapter');
  Redis = adapter.RedisAdapter;
} else {
  Redis = require('ioredis');
}

const redis = new Redis();
```

Set `USE_VALKEY_ADAPTER=false` and restart your application to rollback.

## Next Steps

After successful migration:

1. **Performance Optimization**: Review and optimize Redis usage patterns
2. **Monitoring**: Set up comprehensive Redis monitoring
3. **Scaling**: Take advantage of improved performance for scaling
4. **Updates**: Keep the adapter updated for new features and improvements

## Support and Resources

- [API Documentation](API.md)
- [GitHub Issues](https://github.com/valkey-io/valkey-glide/issues)
- [Performance Benchmarks](BENCHMARKS.md)
- [Best Practices Guide](BEST_PRACTICES.md)

The migration process should be smooth for most applications. If you encounter issues not covered in this guide, please open an issue on the GitHub repository with detailed information about your use case.