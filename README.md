# Valkey GLIDE ioredis Adapter

[![npm version](https://img.shields.io/npm/v/valkey-glide-ioredis-adapter?style=flat-square)](https://www.npmjs.com/package/valkey-glide-ioredis-adapter)
[![npm downloads](https://img.shields.io/npm/dm/valkey-glide-ioredis-adapter?style=flat-square)](https://www.npmjs.com/package/valkey-glide-ioredis-adapter)
[![GitHub license](https://img.shields.io/github/license/avifenesh/valkey-glide-ioredis-adapter?style=flat-square)](https://github.com/avifenesh/valkey-glide-ioredis-adapter/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/avifenesh/valkey-glide-ioredis-adapter?style=flat-square)](https://github.com/avifenesh/valkey-glide-ioredis-adapter/stargazers)

[![CI Status](https://img.shields.io/github/actions/workflow/status/avifenesh/valkey-glide-ioredis-adapter/release.yml?branch=main&style=flat-square&label=CI)](https://github.com/avifenesh/valkey-glide-ioredis-adapter/actions)
[![Node.js Version](https://img.shields.io/node/v/valkey-glide-ioredis-adapter?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square)](https://www.typescriptlang.org)

[![Socket.IO](https://img.shields.io/badge/Socket.IO-✅%20Compatible-brightgreen?style=flat-square)](https://socket.io)
[![Express Sessions](https://img.shields.io/badge/Express%20Sessions-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/expressjs/session)
[![Rate Limiting](https://img.shields.io/badge/Rate%20Limiting-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/express-rate-limit/express-rate-limit)

> **🚀 Drop-in ioredis replacement** powered by **Valkey GLIDE**'s high-performance Rust core

A production-ready, 100% ioredis-compatible adapter that seamlessly integrates **Valkey GLIDE** with your existing Node.js applications. Get native performance without changing a single line of application code.

## 🎯 **Pure GLIDE Architecture**

This project uses **exclusively Valkey GLIDE** - a high-performance, language-independent Valkey client library with a Rust core and Node.js wrapper.

## 🚀 **Key Features**

- **Pure GLIDE**: Built exclusively on Valkey GLIDE APIs
- **ioredis-compatible API**: Drop-in replacement for most ioredis usage
- **High Performance**: Leverages GLIDE's Rust core for optimal performance
- **TypeScript Support**: Full type safety with GLIDE's native TypeScript interfaces
- **Production Integrations**: Socket.IO, Express Sessions, Rate Limiting, and Caching all fully working

## 📋 **Pub/Sub Implementation**

Due to GLIDE's pub/sub architecture, we provide **two distinct pub/sub patterns**:

### 1. **Direct GLIDE Pub/Sub** (Recommended for new applications)
```typescript
import { createPubSubClients, publishMessage, pollForMessage } from './src/pubsub/DirectGlidePubSub';

// Create separate publisher and subscriber clients
const clients = await createPubSubClients(
  { host: 'localhost', port: 6379 },
  { channels: ['my-channel'], patterns: ['news.*'] }
);

// Publish messages
await publishMessage(clients.publisher, 'my-channel', 'Hello World!');

// Poll for messages (use in your application loop)
const message = await pollForMessage(clients.subscriber);
if (message) {
  console.log('Received:', message.message, 'on channel:', message.channel);
}
```

### 2. **Library Integration Helper** (For existing Redis libraries)
```typescript
import { LibraryGlideIntegration } from './src/pubsub/DirectGlidePubSub';

const integration = new LibraryGlideIntegration();
await integration.initialize(
  { host: 'localhost', port: 6379 },
  ['app:notifications', 'app:events']
);

// Use with any Redis library requiring pub/sub
await integration.publish('app:notifications', JSON.stringify({ type: 'update' }));
```

## 🔧 **Installation**

```bash
npm install valkey-glide-ioredis-adapter
```

**Requirements:**
- Node.js 18+ (ES2022 support)  
- Valkey/Redis 6.0+
- TypeScript 4.5+ (for TypeScript projects)

## 📖 **Basic Usage**

```typescript
import { RedisAdapter } from 'valkey-glide-ioredis-adapter';

// Create adapter instance
const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379
});

// Use ioredis-compatible API with Valkey backend
await redis.set('key', 'value');
const value = await redis.get('key');

// ZSET operations with proper result translation
const members = await redis.zrange('myset', 0, -1, 'WITHSCORES');

// Stream operations using native GLIDE methods
await redis.xadd('mystream', '*', 'field', 'value');
const messages = await redis.xread('STREAMS', 'mystream', '0');
```

## 🎯 **Performance Benefits**

- **Native GLIDE Methods**: Uses GLIDE's optimized implementations instead of generic Redis commands
- **Result Translation**: Efficient conversion between GLIDE's structured responses and ioredis formats
- **Type Safety**: Leverages GLIDE's TypeScript interfaces for better development experience
- **Rust Core**: Benefits from GLIDE's high-performance Rust implementation

## 📚 **Documentation**

- **[Pub/Sub Guide](./src/pubsub/README.md)**: Comprehensive guide to both pub/sub patterns
- **[Development Rules](./coursorules/README.md)**: Pure GLIDE development principles
- **[API Migration](./coursorules/GLIDE_API_MAPPING.md)**: Detailed mapping from ioredis to GLIDE

## 🧪 **Testing**

```bash
# Run all tests
npm test

# Run pub/sub tests
npm test -- tests/unit/direct-glide-pubsub.test.ts
npm test -- tests/unit/pubsub-basic.test.ts
npm test -- tests/unit/pubsub-polling.test.ts

# Run integration tests
npm test -- tests/integration/
```

## 🔄 **Migration from ioredis**

### For Regular Operations
```typescript
// Before (ioredis)
import Redis from 'ioredis';
const redis = new Redis();

// After (GLIDE adapter)
import { RedisAdapter } from 'valkey-glide-ioredis-adapter';
const redis = new RedisAdapter();
```

### For Pub/Sub Operations
```typescript
// Before (ioredis)
const subscriber = new Redis();
subscriber.on('message', (channel, message) => {
  console.log(channel, message);
});
await subscriber.subscribe('my-channel');

// After (Direct GLIDE)
import { createPubSubClients, pollForMessage } from './src/pubsub/DirectGlidePubSub';

const clients = await createPubSubClients(
  { host: 'localhost', port: 6379 },
  { channels: ['my-channel'] }
);

// Implement polling in your application
while (true) {
  const message = await pollForMessage(clients.subscriber);
  if (message) {
    console.log(message.channel, message.message);
  }
}
```

## 🏗️ **Architecture**

### Translation Layer Approach
```
Application Code
       ↓
ioredis-compatible API
       ↓
Parameter Translation
       ↓
Native GLIDE Methods
       ↓
Result Translation
       ↓
ioredis-compatible Results
```

### Pub/Sub Architecture
```
Direct Pattern:
Application → GLIDE Client → Valkey/Redis

Integration Pattern:
Library → Helper Class → GLIDE Clients → Valkey/Redis
```

## 🤝 **Contributing**

This project follows **pure GLIDE** principles:
- Use only GLIDE APIs
- Implement custom logic when needed
- Maintain ioredis compatibility through translation
- Comprehensive testing required

## 📄 **License**

MIT License - see [LICENSE](./LICENSE) file for details.

## 🔗 **Related Projects**

- [Valkey GLIDE](https://github.com/valkey-io/valkey-glide) - The underlying high-performance client
- [ioredis](https://github.com/luin/ioredis) - The API we're compatible with
- [Bull](https://github.com/OptimalBits/bull) / [BullMQ](https://github.com/taskforcesh/bullmq) - Job queue libraries (integration in progress)
- [connect-redis](https://github.com/tj/connect-redis) - Express session store
- [rate-limit-redis](https://github.com/wyattjoh/rate-limit-redis) - Rate limiting store
- [socket.io-redis-adapter](https://github.com/socketio/socket.io-redis-adapter) - Socket.IO scaling adapter
