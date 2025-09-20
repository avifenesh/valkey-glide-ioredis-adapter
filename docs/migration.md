# Migration from ioredis

Zero-code-change migration from ioredis to Valkey GLIDE ioredis Adapter.

## Quick Migration

**1. Replace package**
```bash
npm uninstall ioredis
npm install valkey-glide-ioredis-adapter
```

**2. Update import**
```typescript
// Before
import Redis from 'ioredis';

// After
import { Redis } from 'valkey-glide-ioredis-adapter';
```

**3. Same constructor**
```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret'
});
```

That's it! All your existing Redis operations work unchanged.

## What Works Identically

- All Redis commands (GET, SET, HGET, LPUSH, etc.)
- Transactions (MULTI/EXEC)
- Lua scripts (EVAL, defineCommand)
- Pipelines
- Pub/Sub
- Connection options
- Error handling

## Bull/BullMQ Integration

Works with zero changes:

```typescript
import Queue from 'bull';
import { Redis } from 'valkey-glide-ioredis-adapter';

const myQueue = new Queue('jobs', {
  createClient: () => new Redis({ lazyConnect: false })
});
```

## Cluster Migration

```typescript
// Before
import { Cluster } from 'ioredis';

// After
import { Cluster } from 'valkey-glide-ioredis-adapter';

const cluster = new Cluster([
  { host: 'node1', port: 7000 },
  { host: 'node2', port: 7001 }
]);
```

## Performance Benefits

- **Higher throughput** - Valkey GLIDE's Rust core
- **Lower latency** - Optimized connection handling
- **Better reliability** - Advanced connection management
- **AZ affinity** - Read from geographically closest nodes

No code changes required to get these benefits.