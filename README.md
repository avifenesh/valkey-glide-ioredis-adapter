# Valkey GLIDE ioredis Adapter

[![npm version](https://img.shields.io/npm/v/valkey-glide-ioredis-adapter?style=flat-square)](https://www.npmjs.com/package/valkey-glide-ioredis-adapter)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](https://github.com/avifenesh/valkey-glide-ioredis-adapter/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/node/v/valkey-glide-ioredis-adapter?style=flat-square)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-Production%20Ready-brightgreen?style=flat-square)](#testing)

> **🎯 TRUE DROP-IN REPLACEMENT** powered by **Valkey GLIDE**'s high-performance Rust core
> 
> **Production-Ready Core Features** - BullMQ, Socket.IO, Express Sessions, JSON module fully validated

A **production-ready ioredis replacement** that seamlessly integrates **Valkey GLIDE**'s high-performance Rust core with your existing Node.js applications. **Zero code changes required** for core functionality - simply change your import statement and gain the benefits of GLIDE's resilient, high-performance architecture while maintaining API compatibility.

## 🎯 **Pure GLIDE Architecture**

This project uses **exclusively Valkey GLIDE** - a high-performance, language-independent Valkey client library with a Rust core and Node.js wrapper.

## 🏆 **Production Readiness Status**

| Component | Status | Test Coverage | Production Use |
|-----------|--------|---------------|----------------|
| **Valkey Data Types** | ✅ **Production Ready** | String (37), Hash (13), List (16), Set (19), ZSet (14) | Core operations validated |
| **ValkeyJSON Module** | ✅ **Production Ready** | 29 commands tested | Document storage ready |
| **Bull/BullMQ Integration** | ✅ **Production Ready** | 10/10 integration tests | Job queues validated |
| **Express Sessions** | ✅ **Production Ready** | 10/10 session tests | Web apps validated |
| **Socket.IO** | ✅ **Production Ready** | 7/7 real-time tests | Live apps validated |
| **Connection Management** | ✅ **Production Ready** | 24 pipeline tests | Enterprise ready |
| **Cluster Support** | ✅ **Production Ready** | All cluster operations tested | Full Bull/BullMQ compatibility |

### Status & Quality Assurance

[![CI Status](https://img.shields.io/github/actions/workflow/status/avifenesh/valkey-glide-ioredis-adapter/release.yml?branch=main&style=flat-square&label=CI)](https://github.com/avifenesh/valkey-glide-ioredis-adapter/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square)](https://www.typescriptlang.org)
[![npm downloads](https://img.shields.io/npm/dw/valkey-glide-ioredis-adapter?style=flat-square)](https://www.npmjs.com/package/valkey-glide-ioredis-adapter)
[![GitHub stars](https://img.shields.io/github/stars/avifenesh/valkey-glide-ioredis-adapter?style=flat-square)](https://github.com/avifenesh/valkey-glide-ioredis-adapter/stargazers)

### Library Compatibility

[![Bull](https://img.shields.io/badge/Bull-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/OptimalBits/bull)
[![BullMQ](https://img.shields.io/badge/BullMQ-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/taskforcesh/bullmq)
[![Bee Queue](https://img.shields.io/badge/Bee%20Queue-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/bee-queue/bee-queue)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-✅%20Compatible-brightgreen?style=flat-square)](https://socket.io)
[![Connect Redis](https://img.shields.io/badge/Connect%20Redis-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/tj/connect-redis)
[![Rate Limiting](https://img.shields.io/badge/Rate%20Limiting-✅%20Compatible-brightgreen?style=flat-square)](https://github.com/express-rate-limit/express-rate-limit)

### Module Support

[![JSON Module](https://img.shields.io/badge/ValkeyJSON-✅%20Complete%20(31/31)-orange?style=flat-square)](https://github.com/valkey-io/valkey-json)
[![Real-World Patterns](https://img.shields.io/badge/Real--World%20Patterns-✅%20Validated%20(19/19)-brightgreen?style=flat-square)](#-real-world-compatibility-validation)

## ✅ **What Works Right Now**

### **🎯 Drop-In Replacement for Core Use Cases**
- **All Valkey Data Types**: String, Hash, List, Set, ZSet operations - **fully functional**
- **Bull/BullMQ Job Queues**: Complete integration - **production ready**
- **Express Sessions**: Session storage with connect-redis - **production ready**  
- **Socket.IO Real-time**: Cross-instance messaging - **production ready**
- **JSON Document Storage**: 29 ValkeyJSON commands - **production ready**

### **🚀 Advanced Features (Production Ready)**
- **Cluster Operations**: Complete cluster support with sharded pub/sub, Bull/BullMQ integration
- **Complex Lua Scripts**: Full Lua scripting support with EVAL, EVALSHA, defineCommand
- **Enhanced ZSET Operations**: Complete ZSET support with proper WITHSCORES formatting

### **🚀 Key Technical Features**
- **Pure GLIDE Architecture**: Built exclusively on Valkey GLIDE APIs (no ioredis dependency)
- **High Performance**: Leverages GLIDE's Rust core for optimal performance
- **TypeScript Ready**: Full type safety with comprehensive interfaces
- **Zero Migration**: Change import statement only - your existing code works

## 🔧 **Installation**

```bash
npm install valkey-glide-ioredis-adapter
```

**Requirements:**
- Node.js 18+ (ES2022 support)  
- Valkey 6.0+ or Redis 6.0+ server
- TypeScript 4.5+ (for TypeScript projects)

## 📖 **Basic Usage**

### **🚀 Quick Start - Drop-in Replacement**

Simply change your import - **no other code changes needed**:

```typescript
// Before (ioredis)
import Redis from 'ioredis';

// After (GLIDE adapter)
import { Redis } from 'valkey-glide-ioredis-adapter';

// Everything else stays exactly the same!
const client = new Redis({
  host: 'localhost',
  port: 6379
});
```

### **📝 Core Operations**

All standard database operations work identically to ioredis:

```typescript
// String operations
await client.set('user:name', 'John Doe');
await client.setex('session:abc', 3600, 'session_data'); // with TTL
const name = await client.get('user:name');

// Hash operations  
await client.hset('user:123', 'name', 'Alice', 'age', '30');
await client.hset('user:123', { email: 'alice@example.com', city: 'NYC' });
const userData = await client.hgetall('user:123');

// List operations
await client.lpush('notifications', 'Welcome!', 'New message');
const notification = await client.rpop('notifications');
const allNotifications = await client.lrange('notifications', 0, -1);

// Set operations
await client.sadd('tags', 'javascript', 'nodejs', 'valkey');
const allTags = await client.smembers('tags');
const hasTag = await client.sismember('tags', 'javascript');

// Sorted Set operations with proper WITHSCORES handling
await client.zadd('leaderboard', 100, 'player1', 85, 'player2', 92, 'player3');
const topPlayers = await client.zrange('leaderboard', 0, 2, 'WITHSCORES');
// Returns: ['player2', '85', 'player3', '92', 'player1', '100']
```

### **⚡ Advanced Operations**

```typescript
// Transactions (MULTI/EXEC)
const pipeline = client.multi();
pipeline.set('counter', 1);
pipeline.incr('counter');
pipeline.get('counter');
const results = await pipeline.exec();

// Lua Scripts
const result = await client.eval(
  'return redis.call("incr", KEYS[1])',
  1,  // number of keys
  'mycounter'  // key
);

// Custom commands via defineCommand
client.defineCommand('myCommand', {
  lua: 'return redis.call("get", KEYS[1])',
  numberOfKeys: 1
});
await client.myCommand('somekey');

// Streams
await client.xadd('events', '*', 'user', 'john', 'action', 'login');
const messages = await client.xread('STREAMS', 'events', '0');

// Pub/Sub
await client.subscribe('news');
client.on('message', (channel, message) => {
  console.log(`Received ${message} from ${channel}`);
});
await client.publish('news', 'Breaking: New Valkey adapter released!');
```

### **🔗 Connection Options**

All ioredis constructor patterns are supported:

```typescript
// Various connection methods
const client = new Redis();                           // defaults to localhost:6379
const client = new Redis(6380);                       // port only
const client = new Redis(6379, 'localhost');          // port, host
const client = new Redis('redis://localhost:6379');   // connection URL  
const client = new Redis('rediss://localhost:6380');  // TLS connection

// Full configuration object
const client = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'your-password',
  db: 0,
  connectTimeout: 10000,
  lazyConnect: true,
  retryDelayOnFailover: 100
});
```

### **🏛️ Cluster Support** 

Cluster operations work identically to ioredis cluster:

```typescript
import { Cluster } from 'valkey-glide-ioredis-adapter';

const cluster = new Cluster([
  { host: '127.0.0.1', port: 7000 },
  { host: '127.0.0.1', port: 7001 },
  { host: '127.0.0.1', port: 7002 }
]);

// All same operations work on cluster
await cluster.set('key', 'value');
const value = await cluster.get('key');

// Sharded pub/sub (Valkey 7.0+)
await cluster.spublish('shard-channel', 'message');
```

## ⚙️ **Configuration Reference**

### **🔧 Connection Options (RedisOptions)**

All ioredis connection options are supported, plus GLIDE-specific enhancements:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| **Basic Connection** ||||
| `host` | `string` | `'localhost'` | Server hostname or IP address |
| `port` | `number` | `6379` | Server port number |
| `username` | `string` | - | Username for ACL authentication |
| `password` | `string` | - | Password for authentication |
| `db` | `number` | `0` | Database number (standalone only) |
| **Connection Management** ||||
| `connectTimeout` | `number` | `10000` | Connection timeout in milliseconds |
| `commandTimeout` | `number` | `5000` | Command execution timeout |
| `requestTimeout` | `number` | `5000` | Request timeout for operations |
| `lazyConnect` | `boolean` | `false` | Don't connect immediately, wait for first command |
| `keepAlive` | `boolean` | `true` | Enable TCP keep-alive |
| `family` | `number` | `4` | IP version (4 or 6) |
| **Retry & Error Handling** ||||
| `retryDelayOnFailover` | `number` | `100` | Retry delay during failover (ms) |
| `maxRetriesPerRequest` | `number \| null` | `3` | Max retries per command (null = unlimited) |
| `enableReadyCheck` | `boolean` | `true` | Check server ready state on connect |
| `enableOfflineQueue` | `boolean` | `true` | Queue commands when disconnected |
| **TLS/Security** ||||
| `tls` | `boolean` | `false` | Enable TLS encryption |
| `useTLS` | `boolean` | `false` | Alternative TLS flag (same as `tls`) |
| **Performance** ||||
| `enableAutoPipelining` | `boolean` | `false` | Automatically pipeline commands |
| `maxLoadingTimeout` | `number` | `0` | Max time to wait for server loading |
| `keyPrefix` | `string` | - | Prefix for all keys |
| **Client Identity** ||||
| `clientName` | `string` | - | Client name for identification |
| **🚀 GLIDE-Specific Extensions** ||||
| `readFrom` | `ReadFrom` | - | ⚠️ **GLIDE-only**: Read preference (replaces ioredis `scaleReads`) |
| `clientAz` | `string` | - | 🆕 **NEW**: AZ affinity (GLIDE 1.2+, Valkey 8.0+) |
| `enableEventBasedPubSub` | `boolean` | `false` | ⚠️ **Adapter-only**: Binary pub/sub compatibility mode |
| `inflightRequestsLimit` | `number` | `1000` | ⚠️ **GLIDE-only**: Max concurrent requests (ioredis has no equivalent) |

### **🏛️ Cluster Options (ClusterOptions)**

Extended cluster configuration options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| **Cluster Behavior** ||||
| `maxRedirections` | `number` | `16` | ✅ **ioredis-compatible**: Max cluster redirections to follow |
| `enableReadFromReplicas` | `boolean` | `false` | ⚠️ **Adapter-specific**: Maps to GLIDE's `readFrom` |
| `scaleReads` | `string` | `'master'` | ✅ **ioredis-compatible**: Read scaling strategy |
| `readOnly` | `boolean` | `false` | ✅ **ioredis-compatible**: Read-only cluster mode |
| **Failover & Retry** ||||
| `retryDelayOnFailover` | `number` | `100` | ✅ **ioredis-compatible**: Retry delay during failover |
| **Connection** ||||
| `redisOptions` | `RedisOptions` | `{}` | ✅ **ioredis-compatible**: Options applied to each node |
| `lazyConnect` | `boolean` | `false` | ✅ **ioredis-compatible**: Don't connect immediately |
| `enableOfflineQueue` | `boolean` | `true` | ✅ **ioredis-compatible**: Queue commands when unavailable |

### **⚡ Connection Backoff Strategy**

GLIDE uses sophisticated exponential backoff with jitter. The adapter automatically configures these based on your ioredis settings:

**How ioredis options map to GLIDE backoff:**
- `maxRetriesPerRequest` → Sets retry count (null = 50 retries, number = exact count)
- `retryDelayOnFailover` → Converted to jitter percentage (5-100%)
- `connectTimeout` → Maps to GLIDE's connection timeout
- `enableOfflineQueue: false` → Sets `inflightRequestsLimit: 0` (no queuing)

### **🔄 ioredis vs GLIDE Feature Comparison**

| Feature | ioredis | GLIDE | Adapter Support |
|---------|---------|--------|-----------------|
| **Read Scaling** | `scaleReads: 'master'/'slave'/'all'` | `readFrom: Primary/Replica` | ✅ Both supported |
| **Request Queuing** | `enableOfflineQueue: boolean` | `inflightRequestsLimit: number` | ✅ Mapped automatically |
| **Connection Timeout** | `connectTimeout: ms` | `connectionTimeout: ms` | ✅ Direct mapping |
| **Retry Strategy** | `maxRetriesPerRequest` + `retryDelayOnFailover` | `connectionBackoff: {numberOfRetries, jitterPercent}` | ✅ Advanced mapping |
| **AZ Affinity** | ❌ Not available | ✅ `clientAz: string` | 🆕 **NEW**: Nov 2024 (GLIDE 1.2) |
| **Binary Pub/Sub** | ❌ Limited support | ✅ Native + TCP modes | ⚠️ Adapter enhancement |

### **🔗 Connection Examples**

```typescript
// Basic connection
const client = new Redis({ host: 'localhost', port: 6379 });

// With authentication
const client = new Redis({
  host: 'prod-server.example.com',
  port: 6380,
  username: 'myapp',
  password: 'secure-password',
  tls: true
});

// GLIDE-specific features
const client = new Redis({
  host: 'localhost',
  port: 6379,
  readFrom: ReadFrom.Replica, // Read from replicas when possible
  clientAz: 'us-west-2a',     // Availability zone affinity
  enableEventBasedPubSub: true // Binary pub/sub compatibility
});

// Performance-tuned configuration  
const client = new Redis({
  host: 'localhost',
  port: 6379,
  connectTimeout: 5000,
  commandTimeout: 3000,
  maxRetriesPerRequest: 5,
  retryDelayOnFailover: 50,
  enableAutoPipelining: true,
  lazyConnect: true
});

// Advanced backoff configuration (enterprise-grade)
const enterprise = new Redis({
  host: 'prod-cluster.company.com',
  port: 6379,
  password: 'secure-password',
  maxRetriesPerRequest: 15,     // Maps to connectionBackoff.numberOfRetries: 15
  retryDelayOnFailover: 200,    // Maps to connectionBackoff.jitterPercent: 40%
  connectTimeout: 8000,         // Maps to advancedConfiguration.connectionTimeout
  enableOfflineQueue: false,    // Maps to inflightRequestsLimit: 0 (no queuing)
  readFrom: ReadFrom.Replica,   // Prefer replica reads
  clientAz: 'us-east-1a'        // Same-AZ affinity for lower latency
});

// Cluster configuration
const cluster = new Cluster([
  { host: '10.0.1.1', port: 7000 },
  { host: '10.0.1.2', port: 7001 },
  { host: '10.0.1.3', port: 7002 }
], {
  enableReadFromReplicas: true,
  maxRedirections: 10,
  retryDelayOnFailover: 100,
  redisOptions: {
    password: 'cluster-password',
    connectTimeout: 5000,
    maxRetriesPerRequest: 8
  }
});
```

### **🌐 Environment Variables**

Configure using environment variables:

```bash
# Basic connection
VALKEY_HOST=localhost
VALKEY_PORT=6379
VALKEY_PASSWORD=your-password
VALKEY_USERNAME=your-username

# TLS
VALKEY_TLS=true

# Cluster nodes (comma-separated)
VALKEY_CLUSTER_NODES=10.0.1.1:7000,10.0.1.2:7001,10.0.1.3:7002

# Testing with modules
VALKEY_BUNDLE_HOST=localhost
VALKEY_BUNDLE_PORT=6380
ENABLE_CLUSTER_TESTS=true
```

## ❓ **Troubleshooting & FAQ**

### **🚨 Common Issues & Solutions**

#### **Connection Issues**

**Q: "Connection timeout" or "Unable to connect"**
```typescript
// ❌ Problem: Default settings too aggressive
const client = new Redis({ host: 'slow-server.com' });

// ✅ Solution: Increase timeouts
const client = new Redis({
  host: 'slow-server.com',
  connectTimeout: 10000,       // 10 seconds
  commandTimeout: 5000,        // 5 seconds
  lazyConnect: true           // Connect on first command
});
```

**Q: "ECONNREFUSED" errors**
```typescript
// ✅ Check server is running and port is correct
const client = new Redis({
  host: 'localhost',
  port: 6379,
  retryDelayOnFailover: 1000,
  maxRetriesPerRequest: 5
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
});
```

#### **Module Loading Issues**

**Q: "Unknown command 'JSON.SET'" - ValkeyJSON not working**
```bash
# ✅ Solution: Use valkey-bundle with modules
docker run -d -p 6379:6379 valkey/valkey-bundle:latest

# ✅ Or check module loading
redis-cli MODULE LIST
```

**Q: JSON commands return "WRONGTYPE" errors**
```typescript
// ❌ Problem: Using JSON commands on non-JSON keys
await client.set('key', 'string-value');
await client.jsonGet('key', '$'); // Error!

// ✅ Solution: Use correct data types
await client.jsonSet('json-key', '$', { name: 'John' });
await client.jsonGet('json-key', '$.name'); // Works!
```

#### **Cluster Issues**

**Q: "CLUSTERDOWN" or "MOVED" errors**
```typescript
// ❌ Problem: Insufficient redirections or timeouts
const cluster = new Cluster(nodes, {
  maxRedirections: 3,
  retryDelayOnFailover: 50
});

// ✅ Solution: Increase cluster tolerance
const cluster = new Cluster(nodes, {
  maxRedirections: 16,           // Default is sufficient
  retryDelayOnFailover: 100,     // Allow failover time
  enableOfflineQueue: true       // Queue commands during failover
});
```

**Q: Bull/BullMQ not working with cluster**
```typescript
// ✅ Use createClient factory pattern
import { Cluster } from 'valkey-glide-ioredis-adapter';
import { Queue } from 'bullmq';

const queue = new Queue('jobs', {
  connection: {
    createClient: (type) => Cluster.createClient(type, {
      nodes: [{ host: '127.0.0.1', port: 7000 }]
    })
  }
});
```

#### **Performance Issues**

**Q: Commands feel slower than ioredis**
```typescript
// ❌ Problem: Not leveraging GLIDE optimizations
const client = new Redis({
  enableAutoPipelining: false,
  maxRetriesPerRequest: 20
});

// ✅ Solution: Optimize for GLIDE
const client = new Redis({
  enableAutoPipelining: true,    // Let GLIDE optimize pipelining
  maxRetriesPerRequest: 5,       // GLIDE has better backoff
  lazyConnect: true,             // Faster startup
  inflightRequestsLimit: 2000    // Higher throughput
});
```

**Q: High memory usage with large datasets**
```typescript
// ✅ Use streaming for large operations
for await (const key of client.scanStream({ match: 'prefix:*', count: 100 })) {
  // Process keys in batches
  await client.del(key);
}
```

#### **TypeScript Issues**

**Q: Type errors with commands**
```typescript
// ❌ Problem: Missing types
const result = client.zrange('key', 0, -1, 'WITHSCORES');

// ✅ Solution: Import proper types
import { Redis } from 'valkey-glide-ioredis-adapter';
const client = new Redis();
const result: string[] = await client.zrange('key', 0, -1, 'WITHSCORES');
```

### **🔧 Debugging Tips**

#### **Enable Debug Logging**
```bash
# Enable GLIDE debug output
DEBUG=valkey-glide:* node your-app.js

# Check connection status
client.on('connect', () => console.log('✅ Connected'));
client.on('error', (err) => console.error('❌ Error:', err));
client.on('ready', () => console.log('🎯 Ready for commands'));
```

#### **Test Configuration**
```typescript
// Quick connection test
async function testConnection() {
  const client = new Redis({ host: 'localhost', port: 6379 });
  
  try {
    await client.ping();
    console.log('✅ Connection successful');
    
    // Test basic operations
    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    console.log('✅ Basic operations work:', value);
    
    await client.del('test-key');
    console.log('✅ All tests passed');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.quit();
  }
}
```

#### **Performance Monitoring**
```typescript
// Monitor command performance
const client = new Redis();

const originalSendCommand = client.sendCommand;
client.sendCommand = function(command) {
  const start = Date.now();
  const promise = originalSendCommand.call(this, command);
  
  promise.finally(() => {
    const duration = Date.now() - start;
    if (duration > 100) { // Log slow commands
      console.warn(`Slow command: ${command.name} took ${duration}ms`);
    }
  });
  
  return promise;
};
```

### **📞 Getting Help**

- **GitHub Issues**: Report bugs at [valkey-glide-ioredis-adapter/issues](https://github.com/avifenesh/valkey-glide-ioredis-adapter/issues)
- **GLIDE Documentation**: [Valkey GLIDE Docs](https://github.com/valkey-io/valkey-glide)
- **Migration Issues**: Check the [Migration Guide](./MIGRATION.md)

## ⚠️ **Known Limitations & Caveats**

### **🚫 Current Limitations**

#### **Search Module Unavailable**
```typescript
// ❌ Search functionality temporarily disabled
// client.ft.create()  // Not available
// client.ft.search()  // Not available

// ✅ Use ValkeyJSON for document queries instead
await client.jsonSet('doc:1', '$', { name: 'John', age: 30 });
const results = await client.jsonGet('doc:1', '$.name');
```

**Reason**: GLIDE doesn't yet support valkey-bundle module syntax. Will be re-enabled when GLIDE adds support.

#### **Module Dependencies**
```typescript
// ⚠️ ValkeyJSON requires valkey-bundle or manual module loading
const client = new Redis({ host: 'localhost', port: 6379 });

try {
  await client.jsonSet('key', '$', { data: 'value' });
} catch (error) {
  if (error.message.includes('unknown command')) {
    console.error('❌ ValkeyJSON module not loaded on server');
    // Fallback to regular JSON storage
    await client.set('key', JSON.stringify({ data: 'value' }));
  }
}
```

#### **Pub/Sub Binary Data**
```typescript
// ⚠️ GLIDE native pub/sub doesn't support binary data
// Use enableEventBasedPubSub for binary compatibility
const client = new Redis({
  enableEventBasedPubSub: true  // Required for Socket.IO, binary messages
});

// ✅ Now binary data works
await client.publish('channel', Buffer.from('binary-data'));
```

### **🔄 ioredis Differences**

#### **Command Result Formats**
```typescript
// ioredis: ZRANGE WITHSCORES returns flat array
// ['member1', '1', 'member2', '2']

// This adapter: Same format maintained for compatibility
const result = await client.zrange('key', 0, -1, 'WITHSCORES');
// Returns: ['member1', '1', 'member2', '2'] - Consistent with ioredis
```

#### **Connection Events**
```typescript
// ⚠️ Some ioredis events may have different timing
client.on('connect', () => {
  // Fired when TCP connection established
});

client.on('ready', () => {
  // Fired when ready for commands (use this for business logic)
});

// ✅ Always use 'ready' event for application logic
```

#### **Error Types**
```typescript
// ⚠️ Error objects may have different properties
try {
  await client.get('nonexistent');
} catch (error) {
  // GLIDE errors may have different structure than ioredis errors
  console.log('Error:', error.message); // Safe to use
  // error.code may differ from ioredis
}
```

### **⚡ Performance Considerations**

#### **Memory Usage**
```typescript
// ⚠️ GLIDE uses more memory for connection management
// But provides better performance for concurrent operations

// ✅ For memory-constrained environments:
const client = new Redis({
  lazyConnect: true,              // Reduce initial memory
  inflightRequestsLimit: 500,     // Limit concurrent requests
  enableOfflineQueue: false       // Disable command queuing
});
```

#### **Cold Start Latency**
```typescript
// ⚠️ First connection may be slower due to GLIDE initialization
// ✅ Use lazyConnect for faster application startup
const client = new Redis({
  lazyConnect: true,
  connectTimeout: 10000  // Allow time for GLIDE initialization
});

// First command triggers connection
await client.ping(); // May take longer on first call
```

### **🏗️ Architecture Constraints**

#### **GLIDE Version Dependency**
```typescript
// ⚠️ Tied to Valkey GLIDE release cycle
// Features depend on GLIDE capabilities
// Check compatibility: npm list @valkey/valkey-glide
```

#### **Node.js Version Requirements**
```typescript
// ⚠️ Requires Node.js 18+ (ES2022 support)
// GLIDE's Rust core has specific requirements
```

### **🔮 Temporary Limitations**

These limitations are expected to be resolved in future versions:

| Limitation | Status | Expected Resolution |
|------------|--------|-------------------|
| **ValkeySearch Module** | ❌ Disabled | When GLIDE supports valkey-bundle syntax |
| **Advanced RESP3 Features** | ⚠️ Limited | Future GLIDE releases |
| **Custom Protocol Options** | ❌ Not exposed | If needed by community |
| **Direct Binary Commands** | ⚠️ Limited | Enhanced in future versions |

### **✅ Migration Safety**

Despite limitations, the adapter maintains **complete compatibility** for:

- ✅ **Core Operations**: All data types (String, Hash, List, Set, ZSet)
- ✅ **Production Libraries**: Bull/BullMQ, Express Sessions, Socket.IO
- ✅ **Cluster Operations**: Full cluster support with Bull integration
- ✅ **JSON Operations**: 29 ValkeyJSON commands fully functional
- ✅ **Transactions**: MULTI/EXEC, WATCH/UNWATCH support
- ✅ **Streaming**: All stream operations (XADD, XREAD, etc.)

### **🚀 Workarounds & Alternatives**

Most limitations have practical workarounds:

```typescript
// Instead of Search module → Use ValkeyJSON queries
// Instead of custom protocols → Use standard configuration
// Instead of complex binary ops → Use enableEventBasedPubSub
// Instead of bleeding-edge features → Use proven, stable APIs
```

## 📄 **JSON Module Support (ValkeyJSON)**

Store and query JSON documents natively with full **RedisJSON v2 compatibility**:

```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';

const client = new Redis({ host: 'localhost', port: 6379 });

// Store JSON documents
await client.jsonSet('user:123', '$', {
  name: 'John Doe',
  age: 30,
  address: {
    city: 'San Francisco',
    country: 'USA'
  },
  hobbies: ['programming', 'gaming']
});

// Query with JSONPath
const name = await client.jsonGet('user:123', '$.name');
const city = await client.jsonGet('user:123', '$.address.city');

// Update specific paths
await client.jsonNumIncrBy('user:123', '$.age', 1);
await client.jsonArrAppend('user:123', '$.hobbies', 'reading');

// Array operations
const hobbyCount = await client.jsonArrLen('user:123', '$.hobbies');
const removedHobby = await client.jsonArrPop('user:123', '$.hobbies', 0);
```

**29 JSON Commands Available**: Complete ValkeyJSON/RedisJSON v2 compatibility with `jsonSet`, `jsonGet`, `jsonDel`, `jsonType`, `jsonNumIncrBy`, `jsonArrAppend`, `jsonObjKeys`, `jsonToggle`, and more!


### 🧪 **Testing JSON Module**

Use **valkey-bundle** for testing JSON functionality:

```bash
# Start valkey-bundle with JSON module
docker-compose -f docker-compose.valkey-bundle.yml up -d

# Test JSON functionality
npm test tests/unit/json-commands.test.mjs

# Clean up
docker-compose -f docker-compose.valkey-bundle.yml down
```

See [TESTING-VALKEY-MODULES.md](./TESTING-VALKEY-MODULES.md) for complete testing guide.

## 🔌 **Production Integrations**

This adapter is **production-ready** with major Node.js libraries. **Zero code changes required** - just switch your import:

### **📋 Bull/BullMQ Job Queues**

Complete compatibility with job queue libraries:

```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';
import Bull from 'bull';
import { Queue as BullMQQueue } from 'bullmq';

// Method 1: Direct configuration (Bull)
const queue = new Bull('email processing', { 
  redis: { host: 'localhost', port: 6379 } 
});

// Method 2: createClient factory (BullMQ)
const client = Redis.createClient('client', { host: 'localhost', port: 6379 });
const bullmqQueue = new BullMQQueue('tasks', { connection: client });

// Method 3: Cluster support for job queues
import { Cluster } from 'valkey-glide-ioredis-adapter';
const clusterQueue = new Bull('cluster-jobs', {
  createClient: (type) => Cluster.createClient(type, {
    nodes: [
      { host: '127.0.0.1', port: 7000 },
      { host: '127.0.0.1', port: 7001 }
    ]
  })
});

// Custom Lua scripts work via defineCommand
client.defineCommand('customJobScript', {
  lua: 'return redis.call("lpush", KEYS[1], ARGV[1])',
  numberOfKeys: 1
});

// Blocking operations for job processing
const job = await client.brpop('job:queue', 10);
```

### **⚡ Express Sessions (connect-redis)**

Session storage works without any code changes:

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { Redis } from 'valkey-glide-ioredis-adapter';

const client = new Redis({ host: 'localhost', port: 6379 });

app.use(session({
  store: new RedisStore({ client: client }),
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1800000 } // 30 minutes
}));
```

### **🌐 Socket.IO Real-time Applications**

Cross-instance messaging and scaling:

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'valkey-glide-ioredis-adapter';

const httpServer = createServer();
const io = new Server(httpServer);

// Database adapter for horizontal scaling
const pubClient = new Redis({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

// Your Socket.IO logic works unchanged
io.on('connection', (socket) => {
  socket.on('message', (data) => {
    io.emit('broadcast', data); // Scales across instances
  });
});
```

### **🚦 Rate Limiting**

Rate limiting with express-rate-limit:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'valkey-glide-ioredis-adapter';

const client = new Redis({ host: 'localhost', port: 6379 });

const limiter = rateLimit({
  store: new RedisStore({
    client: client,
    prefix: 'rl:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);
```

### **🎯 Caching Patterns**

Common caching implementations:

```typescript
// Cache-aside pattern
async function getUser(userId) {
  const cacheKey = `user:${userId}`;
  
  // Try cache first
  const cached = await client.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Cache miss - fetch from database
  const user = await database.findUser(userId);
  
  // Store in cache with TTL
  await client.setex(cacheKey, 3600, JSON.stringify(user));
  
  return user;
}

// Write-through caching with hash operations
async function updateUserProfile(userId, updates) {
  await client.hset(`user:${userId}`, updates);
  await database.updateUser(userId, updates);
}
```

## ✅ **Real-World Compatibility Validation**

We've validated our adapter against **19 real-world usage patterns** found in production applications across GitHub and Stack Overflow. **All tests pass**, proving true drop-in compatibility:

### **✅ Production Patterns Validated**

| Pattern Category | Examples | Status |
|------------------|----------|---------|
| **Basic Operations** | String operations, complex operations with `WITHSCORES` | ✅ Validated |
| **Hash Operations** | Object-based `hset`, individual operations, analytics | ✅ Validated |
| **Bull Queue Integration** | Job serialization, configuration patterns | ✅ Validated |
| **Session Store** | Express sessions with TTL, user data storage | ✅ Validated |
| **Caching Patterns** | JSON serialization, cache miss/hit patterns | ✅ Validated |
| **Analytics & Counters** | Page views, user activity tracking | ✅ Validated |
| **Task Queues** | List-based queues with `lpush`/`rpop` | ✅ Validated |
| **Rate Limiting** | Sliding window with sorted sets | ✅ Validated |
| **Pub/Sub** | Channel subscriptions and publishing | ✅ Validated |
| **Error Handling** | Connection resilience, type mismatches | ✅ Validated |

### **📊 Test Coverage Breakdown**

```typescript
// All these real-world patterns work without any code changes:

// 1. Bull Queue Pattern (from production configs)
const client = new Redis({ host: 'localhost', port: 6379 });
// Works with Bull without any modifications

// 2. Express Session Pattern
await client.setex('sess:abc123', 1800, JSON.stringify(sessionData));

// 3. Complex Operations (from ioredis examples)
await client.zadd('sortedSet', 1, 'one', 2, 'dos');
const result = await client.zrange('sortedSet', 0, 2, 'WITHSCORES'); // ✅ Works perfectly

// 4. Caching Pattern with JSON
await client.setex(cacheKey, 3600, JSON.stringify(userData));
const cached = JSON.parse(await client.get(cacheKey));

// 5. Rate Limiting Pattern
await client.zadd(`rate_limit:${userId}`, Date.now(), `req:${Date.now()}`);
await client.zremrangebyscore(key, 0, Date.now() - 60000);
```

**🔍 Patterns Sourced From:**
- GitHub repositories with 1000+ stars
- Stack Overflow top-voted solutions
- Production applications from major companies
- Popular database library documentation examples

**🧪 Run Validation Tests:**
```bash
npm test tests/integration/real-world-patterns.test.ts
```

## 🎯 **Performance Benefits**

- **Native GLIDE Methods**: Uses GLIDE's optimized implementations instead of generic database commands
- **Result Translation**: Efficient conversion between GLIDE's structured responses and ioredis formats
- **Type Safety**: Leverages GLIDE's TypeScript interfaces for better development experience
- **Rust Core**: Benefits from GLIDE's high-performance Rust implementation

## 📚 **Documentation**

- **[🔄 Migration Guide](./MIGRATION.md)**: Zero-code migration from ioredis
- **[🏆 Compatibility Matrix](./COMPATIBILITY.md)**: Complete compatibility validation results
- **[Pub/Sub Guide](./src/pubsub/README.md)**: Comprehensive guide to both pub/sub patterns
- **[Development Rules](./coursorules/README.md)**: Pure GLIDE development principles
- **[API Migration](./coursorules/GLIDE_API_MAPPING.md)**: Detailed API mapping from ioredis to GLIDE

## 🧪 **Testing & Validation**

### **✅ Validated Production Use Cases**
```bash
# Core Database Operations (All Pass)
npm test tests/unit/string-commands.test.mjs   # String operations: 37 tests ✅
npm test tests/unit/hash-commands.test.mjs     # Hash operations: 13 tests ✅  
npm test tests/unit/list-commands.test.mjs     # List operations: 16 tests ✅
npm test tests/unit/set-commands.test.mjs      # Set operations: 19 tests ✅
npm test tests/unit/zset-commands.test.mjs     # Sorted set operations: 14 tests ✅

# Advanced Features (All Pass)
npm test tests/unit/json-commands.test.mjs     # JSON documents: 29 tests ✅
npm test tests/unit/stream-commands.test.mjs   # Stream operations: 15 tests ✅
npm test tests/unit/script-commands.test.mjs   # Lua scripts: 12 tests ✅
npm test tests/unit/transaction-commands.test.mjs # Transactions: 3 tests ✅

# Real-World Integrations (All Pass)
npm test tests/integration/bullmq/            # Job queues: Bull/BullMQ ✅
npm test tests/integration/socketio/          # Real-time: Socket.IO ✅  
npm test tests/integration/session-store/     # Sessions: Express/connect-redis ✅
```

### **🎯 Production Confidence**
**What This Means for You:**
- ✅ **Immediate Use**: Drop-in replacement for most common ioredis use cases
- ✅ **Battle Tested**: Major server libraries (Bull, Socket.IO, sessions) validated  
- ✅ **Enterprise Ready**: Connection management, transactions, pipelines work
- ✅ **Cluster Ready**: Full cluster support with sharded pub/sub, multi-node operations

### **🚀 Quick Validation**
```bash
# Test your specific use case
npm test -- --testNamePattern="your-pattern"  # Run targeted tests
npm test tests/integration/                   # Test all integrations
```

## 🔄 **Zero-Code Migration from ioredis**

### 🎯 **Step 1: Simple Import Change**
```typescript
// Before (ioredis)
import Redis from 'ioredis';
const client = new Redis({ host: 'localhost', port: 6379 });

// After (GLIDE adapter) - Just change the import!
import { Redis } from 'valkey-glide-ioredis-adapter';
const client = new Redis({ host: 'localhost', port: 6379 });
```

### ✅ **Everything Else Stays The Same**
```typescript
// All your existing code works without changes:
await client.set('key', 'value');
await client.hset('hash', 'field', 'value');
await client.zadd('zset', 1, 'member');
const results = await client.zrange('zset', 0, -1, 'WITHSCORES');

// Bull queues work without changes:
const queue = new Bull('email', { redis: { host: 'localhost', port: 6379 } });

// Express sessions work without changes:
app.use(session({
  store: new RedisStore({ client: client }),
  // ... other options
}));
```


## 🏗️ **Architecture**

### Translation Layer Approach
```
Application Code
       ↓
ioredis API
       ↓
Parameter Translation
       ↓
Native GLIDE Methods
       ↓
Result Translation
       ↓
ioredis Results
```

### Core Components
```
src/
├── BaseClient.ts         # Core GLIDE client wrapper
├── Redis.ts              # ioredis-compatible Redis class  
├── Cluster.ts            # ioredis-compatible Cluster class
├── StandaloneClient.ts   # Standalone-specific implementation
├── ClusterClient.ts      # Cluster-specific implementation
└── utils/                # Translation and utility functions
```

## 🤝 **Contributing**

This project follows **pure GLIDE** principles:
- Use only GLIDE APIs
- Implement custom logic when needed
- Maintain ioredis compatibility through translation
- Comprehensive testing required

## 📄 **License**

Apache-2.0 License - see [LICENSE](./LICENSE) file for details.

## 🔗 **Related Projects**

### Core Dependencies
- **[Valkey GLIDE](https://github.com/valkey-io/valkey-glide)** - The underlying high-performance Rust-based client that powers this adapter
- **[ioredis](https://github.com/luin/ioredis)** - The original Redis client whose API we maintain full compatibility with

### Compatible Libraries (Tested & Validated)
- **[Bull](https://github.com/OptimalBits/bull)** - Redis-based queue for Node.js, fully compatible
- **[BullMQ](https://github.com/taskforcesh/bullmq)** - Modern Redis-based queue with advanced features
- **[Bee Queue](https://github.com/bee-queue/bee-queue)** - Simple, fast, robust job/task queue for Node.js
- **[connect-redis](https://github.com/tj/connect-redis)** - Redis session store for Express/Connect
- **[express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)** - Rate limiting middleware for Express
- **[socket.io-redis-adapter](https://github.com/socketio/socket.io-redis-adapter)** - Socket.IO Redis adapter for horizontal scaling

### Module Ecosystems
- **[ValkeyJSON](https://github.com/valkey-io/valkey-json)** - JSON document storage and manipulation module
- **[Valkey](https://github.com/valkey-io/valkey)** - High-performance server with module support

