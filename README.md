# ioredis-adapter

An ioredis-compatible API layer built on **Valkey GLIDE** for high-performance Redis operations.

## 🎯 **Pure GLIDE Architecture**

This project uses **exclusively Valkey GLIDE** - a high-performance, language-independent Redis client library with a Rust core and Node.js wrapper.

## 🚀 **Key Features**

- **100% GLIDE-based**: No other Redis clients used
- **ioredis-compatible API**: Drop-in replacement for most ioredis usage
- **High Performance**: Leverages GLIDE's Rust core for optimal performance
- **TypeScript Support**: Full type safety with GLIDE's native TypeScript interfaces
- **Library Compatibility**: Works with popular Redis-dependent libraries

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
import { BullGlideIntegration } from './src/pubsub/DirectGlidePubSub';

const integration = new BullGlideIntegration();
await integration.initialize(
  { host: 'localhost', port: 6379 },
  ['app:notifications', 'app:events']
);

// Use with any Redis library requiring pub/sub
await integration.publish('app:notifications', JSON.stringify({ type: 'update' }));
```

## 🔧 **Installation**

```bash
npm install @valkey/valkey-glide-ioredis-adapter
```

## 📖 **Basic Usage**

```typescript
import { RedisAdapter } from '@valkey/valkey-glide-ioredis-adapter';

// Create adapter instance
const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379
});

// Use ioredis-compatible API
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

# Run specific test suites
npm test -- tests/unit/direct-glide-pubsub.test.ts
npm test -- tests/integration/
```

## 🔄 **Migration from ioredis**

### For Regular Operations
```typescript
// Before (ioredis)
import Redis from 'ioredis';
const redis = new Redis();

// After (GLIDE adapter)
import { RedisAdapter } from '@valkey/valkey-glide-ioredis-adapter';
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
Application → GLIDE Client → Redis/Valkey

Integration Pattern:
Library → Helper Class → GLIDE Clients → Redis/Valkey
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
- [Bull](https://github.com/OptimalBits/bull) / [BullMQ](https://github.com/taskforcesh/bullmq) - Job queue libraries
- [connect-redis](https://github.com/tj/connect-redis) - Express session store
- [rate-limit-redis](https://github.com/wyattjoh/rate-limit-redis) - Rate limiting store
- [socket.io-redis-adapter](https://github.com/socketio/socket.io-redis-adapter) - Socket.IO scaling adapter
