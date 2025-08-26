# ioredis Adapter Layer for Valkey-Glide - Implementation Analysis & Plan

## Overview

This document provides a comprehensive analysis of ioredis usage patterns and creates an actionable implementation plan for building an adapter layer that enables seamless migration from ioredis to valkey-glide without major code changes.

## Technology Stack & Dependencies

**Target Environment:**
- Node.js >= 18 (modern LTS versions, users willing to migrate)
- TypeScript support (official declarations)
- Valkey-Glide as underlying driver
- ioredis-compatible API surface

**Core Dependencies:**
- `@valkey/valkey-glide` - The underlying high-performance driver
- `ioredis` types for API compatibility reference
- TypeScript for type safety and developer experience

## 1. Repository Analysis

### Popular Projects Using ioredis

Based on research, the following categories of applications heavily rely on ioredis:

#### Message Queue Systems (90%+ usage)
- **BullMQ** - Modern job queue system with Redis backing
  - Connection pattern: Separate publisher/subscriber connections
  - Commands: SET, GET, SADD, SREM, LPUSH, RPOP, PUBLISH, SUBSCRIBE
  - Features: Job state management, delayed jobs, repeat jobs

- **Bull** - Redis-based job queue (legacy)
  - Similar patterns to BullMQ but simpler implementation
  - Heavy use of Lua scripts for atomic operations

#### Real-time Applications (85%+ usage)
- **Socket.io Redis Adapter**
  - Connection pattern: Pub/Sub with channel-based routing
  - Commands: PUBLISH, SUBSCRIBE, PSUBSCRIBE (pattern-based)
  - Features: Room-based broadcasting, namespace isolation

#### Session & Caching Management (80%+ usage)
- **Express session stores**
  - Commands: GET, SET, SETEX, DEL, TTL
  - Features: Session expiration, session cleanup

- **NestJS Redis modules**
  - Full command spectrum usage
  - Dependency injection patterns

#### Rate Limiting & Analytics (70%+ usage)
- **Redis-based rate limiters**
  - Commands: INCR, EXPIRE, SETEX, GET
  - Features: Sliding window algorithms, token bucket

### Usage Pattern Analysis

#### Connection Patterns
```javascript
// 1. Simple standalone connection
const redis = new Redis();
const redis = new Redis(6379, 'localhost');

// 2. Configuration object
const redis = new Redis({
  port: 6379,
  host: 'localhost',
  password: 'auth',
  db: 0
});

// 3. Redis URI
const redis = new Redis('redis://user:pass@host:port/db');

// 4. Cluster mode
const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 6379 },
  { host: '127.0.0.1', port: 6380 }
]);

// 5. Separate pub/sub connections
const pub = new Redis();
const sub = new Redis();
```

## 2. Command Usage Analysis

### Tier 1 Commands (Critical - 80%+ usage)

#### String Operations (Essential)
```javascript
// Primary usage patterns from analyzed repositories
GET, SET, MGET, MSET           // Core key-value operations
INCR, DECR, INCRBY, DECRBY     // Atomic counters (rate limiting, analytics)
SETEX, SETNX, TTL, EXPIRE      // Expiration management (sessions, caching)
APPEND, GETRANGE, SETRANGE     // String manipulation (less common)
```

#### Hash Operations (High usage in session stores)
```javascript
HGET, HSET, HMGET, HMSET, HGETALL  // Session data, user profiles
HDEL, HEXISTS, HKEYS, HVALS        // Hash manipulation
HINCRBY, HLEN                      // Hash analytics
```

#### List Operations (Job queues)
```javascript
LPUSH, RPUSH, LPOP, RPOP      // Queue operations (BullMQ)
LRANGE, LLEN, LINDEX, LSET    // Queue inspection
LTRIM, LREM                   // Queue maintenance
```

#### Key Management (Universal)
```javascript
DEL, EXISTS, KEYS, SCAN       // Key lifecycle
RENAME, RENAMENX, TYPE        // Key management
```

### Tier 2 Commands (Important - 60-80% usage)

#### Set Operations (Membership tracking)
```javascript
SADD, SREM, SMEMBERS, SISMEMBER   // Set membership
SCARD, SPOP, SRANDMEMBER          // Set operations
SUNION, SINTER, SDIFF             // Set algebra
```

#### Sorted Set Operations (Leaderboards, priority queues)
```javascript
ZADD, ZRANGE, ZRANK, ZSCORE       // Ranking systems
ZCARD, ZCOUNT, ZREM               // Sorted set management
ZREVRANK, ZREVRANGE               // Reverse operations
```

#### Pub/Sub Operations (Real-time features)
```javascript
PUBLISH, SUBSCRIBE, UNSUBSCRIBE   // Basic pub/sub
PSUBSCRIBE, PUNSUBSCRIBE          // Pattern-based pub/sub
```

### Tier 3 Commands (Specialized - 20-60% usage)

#### Stream Operations (Event sourcing)
```javascript
XADD, XREAD, XRANGE          // Stream operations
XGROUP, XACK, XDEL           // Consumer groups
```

#### Transaction Operations (Atomic operations)
```javascript
MULTI, EXEC, DISCARD, WATCH  // Transactions
```

#### Script Operations (Complex logic)
```javascript
EVAL, EVALSHA, SCRIPT LOAD   // Lua scripting
```

## 3. API Analysis: ioredis vs Valkey-Glide

### Client Creation Differences

#### ioredis API
```javascript
// Standalone
const Redis = require('ioredis');
const redis = new Redis();
const redis = new Redis(6379, 'localhost');
const redis = new Redis({
  port: 6379,
  host: 'localhost',
  password: 'auth',
  db: 0
});

// Cluster
const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 6379 },
  { host: '127.0.0.1', port: 6380 }
]);
```

#### Valkey-Glide API
```javascript
import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';

// Standalone
const client = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
  credentials: { password: 'auth' }
});

// Cluster
const cluster = await GlideClusterClient.createClient({
  addresses: [
    { host: '127.0.0.1', port: 6379 },
    { host: '127.0.0.1', port: 6380 }
  ]
});
```

### Command API Differences

#### String Commands
```javascript
// ioredis
await redis.set('key', 'value', 'EX', 60);
await redis.mset('key1', 'val1', 'key2', 'val2');
await redis.mget('key1', 'key2');

// Valkey-Glide
import { TimeUnit } from '@valkey/valkey-glide';
await client.set('key', 'value', { expiry: { type: TimeUnit.Seconds, count: 60 }});
await client.mset({ key1: 'val1', key2: 'val2' });
await client.mget(['key1', 'key2']);
```

#### Hash Commands
```javascript
// ioredis
await redis.hmset('hash', 'field1', 'value1', 'field2', 'value2');
await redis.hmget('hash', 'field1', 'field2');
await redis.hgetall('hash');

// Valkey-Glide
await client.hset('hash', { field1: 'value1', field2: 'value2' });
await client.hmget('hash', ['field1', 'field2']);
await client.hgetall('hash');
```

### Behavioral Differences

#### Promise vs Callback Support
- **ioredis**: Supports both callbacks and promises
- **Valkey-Glide**: Promise-only (async/await)

#### Connection Management
- **ioredis**: Auto-reconnection, lazy connect options
- **Valkey-Glide**: Connection pooling, explicit connection management

#### Pipeline Support
- **ioredis**: `redis.pipeline()` with chainable commands
- **Valkey-Glide**: `Batch` class with explicit command building

#### Error Handling
- **ioredis**: Redis errors as JavaScript errors
- **Valkey-Glide**: Structured error types with additional context

## 4. Architecture Design

### Adapter Layer Components

```mermaid
graph TB
    A[Application Code] --> B[ioredis Adapter Layer]
    B --> C[Command Translation Layer]
    B --> D[Connection Management Layer]
    B --> E[Event Emulation Layer]
    C --> F[Valkey-Glide Client]
    D --> F
    E --> F
    F --> G[Valkey/Redis Server]
    
    subgraph "Adapter Components"
        B
        C
        D
        E
    end
    
    subgraph "Core Components"
        H[Client Factory]
        I[Pipeline Adapter]
        J[Pub/Sub Adapter]
        K[Transaction Adapter]
    end
    
    B --> H
    B --> I
    B --> J
    B --> K
```

### Core Adapter Components

#### 1. Client Factory
- **Purpose**: Creates ioredis-compatible client instances
- **Features**: 
  - Constructor parameter translation
  - Connection state management
  - Error handling alignment

#### 2. Command Translation Layer
- **Purpose**: Maps ioredis command signatures to valkey-glide equivalents
- **Features**:
  - Parameter format conversion
  - Return value transformation
  - Error message compatibility

#### 3. Pipeline Adapter
- **Purpose**: Emulates ioredis pipeline behavior using valkey-glide Batch
- **Features**:
  - Chainable command interface
  - Batch execution
  - Result mapping

#### 4. Pub/Sub Adapter
- **Purpose**: Provides ioredis-compatible pub/sub interface
- **Features**:
  - Event emitter compatibility
  - Subscription management
  - Message format consistency

## 5. Implementation Plan

### Phase 0: Test-Driven Development Foundation (1-2 weeks)
**Deliverables:**
- Test infrastructure setup with Jest/Vitest
- Copy and adapt relevant test cases from ioredis repository
- Behavior validation test suite framework
- Mock implementation stubs for TDD approach
- CI/CD pipeline for continuous testing

**Test Sources from ioredis Repository:**
- String command tests (`test/functional/string.ts`)
- Hash command tests (`test/functional/hash.ts`)
- List command tests (`test/functional/list.ts`)
- Connection management tests (`test/functional/connection.ts`)
- Pipeline tests (`test/functional/pipeline.ts`)
- Error handling tests (`test/functional/error.ts`)

**Success Criteria:**
- Comprehensive test suite covering Tier 1 command behaviors
- All tests initially failing (red phase of TDD)
- Clear test structure for iterative implementation
- Automated test execution in CI/CD

### Phase 1: Core Foundation (2-3 weeks)
**Deliverables:**
- Basic client adapter structure
- Tier 1 command implementations (GET, SET, MGET, MSET, etc.)
- Unit test suite for core commands
- Basic error handling

**Success Criteria:**
- 95%+ compatibility for Tier 1 string operations
- All basic connection patterns working
- Comprehensive test coverage

### Phase 2: Extended Commands (2-3 weeks)
**Deliverables:**
- Hash, List, Set, and Sorted Set commands
- Pipeline adapter implementation
- Transaction (MULTI/EXEC) support
- Enhanced error handling

**Success Criteria:**
- 90%+ compatibility for Tier 2 commands
- Pipeline performance within 10% of direct valkey-glide
- Transaction behavior matches ioredis

### Phase 3: Advanced Features (2-3 weeks)
**Deliverables:**
- Pub/Sub adapter with event emulation
- Cluster adapter implementation
- Stream operations support
- Lua script execution

**Success Criteria:**
- Pub/Sub events match ioredis format
- Cluster operations work seamlessly
- Script execution maintains compatibility

### Phase 4: Production Readiness (1-2 weeks)
**Deliverables:**
- Performance optimizations
- Comprehensive documentation
- Migration guide
- Real-world integration tests

**Success Criteria:**
- <5% performance overhead
- Production-ready documentation
- Successful integration with 3+ popular libraries

### Release Strategy

#### Alpha Release (v0.1.0)
- **Target**: Core string and hash operations with Node.js 18+ support
- **Audience**: Early adopters and contributors on modern Node.js versions
- **Focus**: API feedback and basic functionality
- **Requirements**: All copied ioredis tests passing for implemented commands

#### Beta Release (v0.5.0)
- **Target**: All Tier 1 and Tier 2 commands
- **Audience**: Production evaluation users
- **Focus**: Performance and reliability testing

#### Stable Release (v1.0.0)
- **Target**: Complete feature parity for common use cases
- **Audience**: General production use
- **Focus**: Long-term stability and support

## 6. Testing Strategy

### Behavioral Validation Tests

#### Test Copying Strategy from ioredis Repository
1. **Identify Source Tests**: Extract relevant test files from ioredis repository
2. **Behavior Preservation**: Copy test logic while adapting to adapter interface
3. **Edge Case Coverage**: Ensure all ioredis edge cases are covered
4. **Regression Prevention**: Use copied tests as regression suite

#### TDD Approach
```typescript
// Original ioredis test
it('should support set with ex option', async () => {
  await redis.set('foo', 'bar', 'EX', 1);
  expect(await redis.get('foo')).to.equal('bar');
  await delay(1100);
  expect(await redis.get('foo')).to.equal(null);
});

// Adapted test for adapter
it('should support set with ex option (ioredis compatibility)', async () => {
  await redisAdapter.set('foo', 'bar', 'EX', 1);
  expect(await redisAdapter.get('foo')).toBe('bar');
  await delay(1100);
  expect(await redisAdapter.get('foo')).toBeNull();
});
```

### Real-world Integration Tests

#### Popular Library Integration
- **BullMQ Integration Test**: Validate job queue operations
- **Session Store Test**: Verify session management compatibility
- **Rate Limiter Test**: Confirm rate limiting functionality

## 7. Risk Assessment & Mitigation

### Technical Risks

#### Node.js Version Strategy
- **Decision**: Target Node.js 18+ exclusively
- **Rationale**: Users on older Node.js versions (12-17) are typically not performing migrations

#### API Surface Coverage
- **Risk**: Incomplete command coverage affecting real-world usage
- **Mitigation**: Prioritize commands by usage frequency, implement iteratively

#### Performance Overhead
- **Risk**: Adapter layer introduces significant latency
- **Mitigation**: Minimize translation overhead, benchmark against targets

### Implementation Considerations

#### Connection Lifecycle
- **ioredis**: Lazy connection, auto-reconnect
- **Adapter**: Emulate lazy behavior, manage underlying connection pool

#### Command Execution
- **ioredis**: Individual command promises
- **Adapter**: Balance between individual calls and batching optimization

#### Event Handling
- **ioredis**: Rich event system (connect, ready, error, end)
- **Adapter**: Full event emulation for seamless migration

## Next Steps

1. **Immediate**: Set up test infrastructure and copy ioredis tests
2. **Week 1-2**: Implement core string operations with TDD approach
3. **Week 3-4**: Extend to hash and list operations
4. **Week 5-6**: Pipeline and pub/sub implementation
5. **Week 7-8**: Production readiness and documentation

This analysis provides a solid foundation for building a comprehensive ioredis adapter layer that enables seamless migration to valkey-glide while maintaining full compatibility with existing codebases.