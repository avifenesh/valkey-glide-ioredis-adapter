# ioredis Adapter for Valkey GLIDE

An experimental compatibility adapter that provides an ioredis-compatible API layer built on top of valkey-glide. This project is currently in active development.

🚀 **Status**: Ready for 0.1 release with 99.7% test coverage and full BullMQ compatibility.

## Overview

This adapter aims to provide ioredis-compatible APIs built on valkey-glide, potentially allowing existing applications to migrate to valkey-glide with minimal code changes.

## Features

- 🔄 **ioredis-Compatible API**: Provides familiar ioredis-style interfaces
- ⚡ **Built on valkey-glide**: Leverages valkey-glide's Rust-powered performance
- 📋 **Pipeline Support**: Pipeline operations using valkey-glide's Batch functionality
- 🔗 **Connection Management**: ioredis-style connection handling
- 🏷️ **TypeScript Support**: Full TypeScript support with ioredis-compatible types

### ✅ **Library Compatibility Status**

| Category                  | Libraries                      | Status             | Notes                                       |
| ------------------------- | ------------------------------ | ------------------ | ------------------------------------------- |
| **Basic Operations**      | String, Hash, List commands    | ✅ **Working**     | 391/392 tests passing (99.7%)              |
| **Connection & Pipeline** | Basic pipeline operations      | ✅ **Working**     | Pipeline and transaction support functional |
| **Job Queues**            | BullMQ, Bull v3, Bee-queue    | ✅ **Working**     | Full BullMQ compatibility, Bull v3 support |
| **Session Stores**        | connect-redis, express-session | ✅ **Working**     | Session storage functional                  |
| **Rate Limiting**         | express-rate-limit             | ✅ **Working**     | Rate limiting functional                    |
| **Real-time Apps**        | Socket.IO Redis adapter        | ✅ **Working**     | Real-time communication functional          |
| **Pub/Sub**               | Basic pub/sub operations       | ✅ **Working**     | Publish/subscribe functional                |

## Installation

⚠️ **Not Published**: This package is not yet published to npm. For development:

```bash
git clone https://github.com/valkey-io/valkey-glide.git
cd valkey-glide/ioredis-adapter
npm install
npm run build
```

## Quick Start

### Basic Usage

```javascript
// Import the adapter
const { RedisAdapter } = require('./dist/index.js'); // local build
const redis = new RedisAdapter();

// Basic Redis operations
await redis.connect();
await redis.set('key', 'value');
const value = await redis.get('key');
console.log(value); // 'value'
```

### TypeScript Usage

```typescript
import { RedisAdapter } from './dist/index.js'; // local build

const redis = new RedisAdapter({
  port: 6379,
  host: 'localhost',
  password: 'your-password',
});

await redis.connect();
await redis.set('typescript-key', 'works-great');
```

### Connection Options

```javascript
// ioredis-style connection patterns
const redis = new RedisAdapter(); // localhost:6379
const redis = new RedisAdapter(6380, 'redis-server'); // specific host:port
const redis = new RedisAdapter('redis://user:pass@host:port/db'); // URL
const redis = new RedisAdapter({
  port: 6379,
  host: 'localhost',
  password: 'secret',
  db: 0,
});
```

### Pipeline Operations

```javascript
// ioredis-style pipeline
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.get('key1');
pipeline.get('key2');

const results = await pipeline.exec();
console.log(results); // [[null, 'OK'], [null, 'OK'], [null, 'value1'], [null, 'value2']]
```

### Pub/Sub

```javascript
// Publisher
await redis.publish('news', 'Breaking news!');

// Subscriber
redis.subscribe('news');
redis.on('message', (channel, message) => {
  console.log(`Received ${message} from ${channel}`);
});
```

## Supported Commands

### Implemented Commands

- **String Operations**: `GET`, `SET`, `MGET`, `MSET`, `INCR`, `DECR`, `APPEND`, etc.
- **Hash Operations**: `HGET`, `HSET`, `HMGET`, `HMSET`, `HGETALL`, `HDEL`, etc.
- **List Operations**: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`, `LLEN`, etc.
- **Key Management**: `DEL`, `EXISTS`, `EXPIRE`, `TTL`, `TYPE`, etc.
- **Set Operations**: `SADD`, `SREM`, `SMEMBERS`, `SCARD`, etc.
- **Sorted Set Operations**: `ZADD`, `ZRANGE`, `ZSCORE`, `ZCARD`, etc.
- **Pub/Sub Operations**: `PUBLISH`, `SUBSCRIBE`, `PSUBSCRIBE`, etc.

### Advanced Features

- **Pipeline Operations**: Batched command execution
- **Transaction Support**: Basic `MULTI`/`EXEC` operations
- **Connection Events**: Event emitter compatibility
- **Script Support**: Lua script execution

## Development Guide

### 1. Build the Project

```bash
git clone https://github.com/valkey-io/valkey-glide.git
cd valkey-glide/ioredis-adapter
npm install
npm run build
```

### 2. Try the Adapter

```javascript
// Import from built files
const { RedisAdapter } = require('./dist/index.js');
const redis = new RedisAdapter();
```

### 3. Test Your Use Case

The adapter aims for ioredis compatibility, but test thoroughly as some features may have issues.

### 4. Report Issues

If you encounter problems, please report them in the GitHub issues.

## Usage Examples

### Basic Redis Operations

```javascript
const { RedisAdapter } = require('./dist/index.js');

const redis = new RedisAdapter({ host: 'localhost', port: 6379 });
await redis.connect();

// String operations
await redis.set('user:1', 'John');
const user = await redis.get('user:1');

// Hash operations
await redis.hset('user:1:profile', { name: 'John', age: 30 });
const profile = await redis.hgetall('user:1:profile');

// List operations
await redis.lpush('tasks', 'task1', 'task2');
const tasks = await redis.lrange('tasks', 0, -1);
```

### With Express Session (Experimental)

```javascript
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis');
const { RedisAdapter } = require('./dist/index.js');

const app = express();
const redisClient = new RedisAdapter();

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: 'your-secret',
    resave: false,
    saveUninitialized: false,
  })
);
```

## Testing

The project includes unit and integration tests to validate functionality:

### Current Test Status

- **Unit Tests**: 8 passed, 6 failed (8/14 test suites passing)
- **Individual Tests**: ~254 passed, ~18 failed (93% pass rate for unit tests)
- **Integration Tests**: Mixed results - most libraries working except BullMQ
- **Known Issues**: BullMQ Lua script compatibility requires further development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test files
npm test tests/unit/string-commands.test.ts
npm test tests/integration/session-store/
```

## Development Status

| Component             | Status     | Notes                            |
| --------------------- | ---------- | -------------------------------- |
| String Commands       | ✅ Working | Basic operations implemented     |
| Hash Commands         | ✅ Working | Most hash operations working     |
| List Commands         | ✅ Working | Core list operations implemented |
| Key Management        | ✅ Working | Basic key operations             |
| Pipeline Operations   | ✅ Working | Using valkey-glide Batch         |
| Connection Management | ✅ Working | Basic connection handling        |
| Pub/Sub               | ✅ Working | Basic pub/sub functionality      |
| Transaction Support   | 🔄 Partial | Basic multi/exec support         |
| BullMQ Integration    | ⚠️ Issues  | Some serialization problems      |
| Script Support        | ✅ Working | Lua script execution             |

## Performance

The adapter is built on valkey-glide which uses a Rust core for performance. However:

- **Performance benchmarks**: Not yet measured
- **Overhead analysis**: Not yet quantified
- **Optimization status**: Basic implementation, not yet optimized

_Performance testing and optimization are planned for future releases._

## Contributing

This project is in active development. Contributions are welcome!

### Development Setup

```bash
git clone https://github.com/valkey-io/valkey-glide.git
cd valkey-glide/ioredis-adapter
npm install
npm run build
npm test
```

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
npm run test:ci         # Run tests without watch mode
```

## Requirements

- **Node.js**: 18.0.0 or higher
- **Redis/Valkey Server**: 6.2+ (for testing and development)
- **TypeScript**: 5.0+ (for development)
- **Valkey GLIDE**: 2.0.1 (dependency)

## License

Apache-2.0 - see [LICENSE](LICENSE) for details.

## Support

⚠️ **Experimental Project**: This is an experimental project under active development. Use at your own risk.

- **Issues**: [GitHub Issues](https://github.com/valkey-io/valkey-glide/issues)
- **Discussions**: [GitHub Discussions](https://github.com/valkey-io/valkey-glide/discussions)
- **Documentation**: [Valkey GLIDE Documentation](https://valkey.io/valkey-glide/)

## Related Projects

- [valkey-glide](https://github.com/valkey-io/valkey-glide) - The underlying high-performance client
- [ioredis](https://github.com/redis/ioredis) - The original Redis client for Node.js
- [Valkey](https://valkey.io/) - Open source in-memory data store
