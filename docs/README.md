# Documentation

Simple, focused documentation for the Valkey GLIDE ioredis Adapter.

## Quick Start

**Installation**
```bash
npm install valkey-glide-ioredis-adapter
```

**Basic Usage**
```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

await redis.set('key', 'value');
const value = await redis.get('key');
```

## Documentation

- **[Migration Guide](./migration.md)** - Zero-code migration from ioredis
- **[Library Integrations](./integrations.md)** - Bull, Socket.IO, sessions, rate limiting
- **[Architecture](./architecture.md)** - How the adapter works
- **[Examples](./examples.md)** - Common Redis operations
- **[Cluster Setup](./cluster.md)** - Redis cluster configuration

## Key Features

- **100% ioredis compatible** - Drop-in replacement
- **High performance** - Powered by Valkey GLIDE's Rust core
- **Production ready** - Bull, BullMQ, Socket.IO, Express sessions validated
- **TypeScript support** - Full type definitions included
- **Cluster support** - Multi-node operations and sharded pub/sub

## Library Support

Works with popular Redis libraries:
- Bull/BullMQ (job queues)
- Socket.IO (real-time communication)
- Express sessions (web sessions)
- Rate limiting middleware

For detailed API reference, see the TypeScript definitions in your IDE.