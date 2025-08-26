# ioredis vs Valkey-Glide API Differences Analysis

## Overview

This document provides a comprehensive analysis of API differences between ioredis and valkey-glide, serving as the foundation for building translation layers in the adapter.

## 1. Client Creation & Connection Management

### ioredis
```javascript
// Multiple constructor patterns
const redis = new Redis(); // Default localhost:6379
const redis = new Redis(6379, 'localhost');
const redis = new Redis({
  port: 6379,
  host: 'localhost',
  password: 'auth',
  db: 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3
});

// Cluster
const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 6379 },
  { host: '127.0.0.1', port: 6380 }
]);
```

### Valkey-Glide
```javascript
// Async factory pattern only
const client = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
  credentials: { password: 'auth' },
  database: 0 // databaseId property
});

// Cluster
const cluster = await GlideClusterClient.createClient({
  addresses: [
    { host: '127.0.0.1', port: 6379 },
    { host: '127.0.0.1', port: 6380 }
  ]
});
```

**Key Differences:**
1. **Constructor vs Factory**: ioredis uses constructors, valkey-glide uses async factory methods
2. **Configuration Structure**: Different property names (`db` vs `database`)
3. **Connection Management**: ioredis has auto-reconnect options, valkey-glide manages internally

## 2. String Commands

### SET Command

#### ioredis
```javascript
// Multiple signature patterns
await redis.set('key', 'value');
await redis.set('key', 'value', 'EX', 60);
await redis.set('key', 'value', 'EX', 60, 'NX');
await redis.setex('key', 60, 'value'); // Dedicated method
await redis.setnx('key', 'value'); // Dedicated method
```

#### Valkey-Glide
```javascript
// Single signature with options object
await client.set('key', 'value');
await client.set('key', 'value', {
  expiry: { type: TimeUnit.Seconds, count: 60 },
  conditionalSet: 'onlyIfDoesNotExist'
});
```

**Translation Requirements:**
- Parse ioredis variadic arguments into options object
- Map `EX`/`PX` to `TimeUnit.Seconds`/`TimeUnit.Milliseconds`
- Map `NX`/`XX` to `conditionalSet` values

### MGET/MSET Commands

#### ioredis
```javascript
// Variadic arguments
await redis.mget('key1', 'key2', 'key3');
await redis.mset('key1', 'val1', 'key2', 'val2');

// Array arguments also supported
await redis.mget(['key1', 'key2', 'key3']);
```

#### Valkey-Glide
```javascript
// Array for MGET, object for MSET
await client.mget(['key1', 'key2', 'key3']);
await client.mset({ key1: 'val1', key2: 'val2' });
```

**Translation Requirements:**
- Convert variadic args to arrays/objects
- Handle both variadic and array input patterns

## 3. Hash Commands

### HMSET/HSET Commands

#### ioredis
```javascript
// Variadic pattern
await redis.hmset('hash', 'field1', 'value1', 'field2', 'value2');
await redis.hset('hash', 'field', 'value');

// Object pattern (also supported)
await redis.hmset('hash', { field1: 'value1', field2: 'value2' });
```

#### Valkey-Glide
```javascript
// Object/HashDataType pattern only
await client.hset('hash', { field1: 'value1', field2: 'value2' });

// HashDataType format
await client.hset('hash', [
  { field: 'field1', value: 'value1' },
  { field: 'field2', value: 'value2' }
]);
```

**Translation Requirements:**
- Convert variadic field-value pairs to object format
- Support both object and HashDataType formats
- Handle deprecated `HMSET` by mapping to `HSET`

### HMGET Command

#### ioredis
```javascript
// Variadic arguments
await redis.hmget('hash', 'field1', 'field2');
// Array arguments
await redis.hmget('hash', ['field1', 'field2']);
```

#### Valkey-Glide
```javascript
// Array arguments only
await client.hmget('hash', ['field1', 'field2']);
```

**Translation Requirements:**
- Convert variadic args to array format

## 4. List Commands

### LPUSH/RPUSH Commands

#### ioredis
```javascript
// Variadic arguments
await redis.lpush('list', 'elem1', 'elem2', 'elem3');
await redis.rpush('list', 'elem1', 'elem2');
```

#### Valkey-Glide
```javascript
// Array arguments only
await client.lpush('list', ['elem1', 'elem2', 'elem3']);
await client.rpush('list', ['elem1', 'elem2']);
```

**Translation Requirements:**
- Convert variadic args to array format

## 5. Pipeline Operations

### ioredis Pipeline
```javascript
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.get('key1');
pipeline.hset('hash', 'field', 'value');
pipeline.hget('hash', 'field');

const results = await pipeline.exec();
// Returns: [[null, 'OK'], [null, 'value1'], [null, 1], [null, 'value']]
```

### Valkey-Glide Batch
```javascript
const batch = new Batch();
batch.set('key1', 'value1');
batch.get('key1');
batch.hset('hash', { field: 'value' });
batch.hget('hash', 'field');

const results = await client.exec(batch);
// Returns: ['OK', 'value1', 1, 'value']
```

**Translation Requirements:**
- Emulate chainable pipeline interface
- Convert result format from flat array to error-result tuples
- Handle pipeline abortion on errors

## 6. Pub/Sub Operations

### ioredis Pub/Sub
```javascript
// Publisher
await redis.publish('channel', 'message');

// Subscriber
const subscriber = new Redis();
subscriber.subscribe('channel1', 'channel2');
subscriber.on('message', (channel, message) => {
  console.log(`Received ${message} from ${channel}`);
});

// Pattern subscription
subscriber.psubscribe('news.*');
subscriber.on('pmessage', (pattern, channel, message) => {
  console.log(`Pattern ${pattern}: ${message} from ${channel}`);
});
```

### Valkey-Glide Pub/Sub
```javascript
// Publisher
await client.publish('message', 'channel');

// Subscriber (via configuration)
const client = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [PubSubChannelModes.Exact]: new Set(['channel1', 'channel2']),
      [PubSubChannelModes.Pattern]: new Set(['news.*'])
    },
    callback: (msg, context) => {
      console.log(`Received ${msg.message} from ${msg.channel}`);
    }
  }
});
```

**Translation Requirements:**
- Emulate EventEmitter interface for pub/sub
- Handle dynamic subscription/unsubscription
- Convert message format and event names
- Manage separate publisher/subscriber connection pattern

## 7. Transaction Operations

### ioredis Transactions
```javascript
const multi = redis.multi();
multi.set('key1', 'value1');
multi.get('key1');
multi.hset('hash', 'field', 'value');

const results = await multi.exec();
// Returns: [[null, 'OK'], [null, 'value1'], [null, 1]]
```

### Valkey-Glide Transactions
```javascript
const batch = new Batch();
batch.set('key1', 'value1');
batch.get('key1');
batch.hset('hash', { field: 'value' });

const results = await client.exec(batch, true); // atomic = true
// Returns: ['OK', 'value1', 1]
```

**Translation Requirements:**
- Emulate `multi()` interface with atomic batch execution
- Convert result format consistency
- Handle `WATCH` command compatibility

## 8. Error Handling Differences

### ioredis
```javascript
try {
  await redis.get('key');
} catch (error) {
  // Standard JavaScript Error objects
  console.log(error.message);
  console.log(error.command); // Redis command that failed
}
```

### Valkey-Glide
```javascript
try {
  await client.get('key');
} catch (error) {
  // Structured error types
  if (error instanceof RequestError) {
    console.log(error.message);
  }
}
```

**Translation Requirements:**
- Convert structured errors to ioredis-compatible format
- Preserve error context and command information
- Maintain error type hierarchy

## 9. Return Value Differences

### String Commands
| Command | ioredis | Valkey-Glide | Translation Needed |
|---------|---------|--------------|-------------------|
| GET | `string \| null` | `GlideString \| null` | Convert GlideString to string |
| SET | `'OK'` | `'OK'` | None |
| MGET | `(string \| null)[]` | `(GlideString \| null)[]` | Convert array elements |

### Hash Commands  
| Command | ioredis | Valkey-Glide | Translation Needed |
|---------|---------|--------------|-------------------|
| HGETALL | `Record<string, string>` | `Record<string, GlideString>` | Convert values |
| HMGET | `(string \| null)[]` | `(GlideString \| null)[]` | Convert array elements |

### List Commands
| Command | ioredis | Valkey-Glide | Translation Needed |
|---------|---------|--------------|-------------------|
| LRANGE | `string[]` | `GlideString[]` | Convert array elements |
| LPOP | `string \| null` | `GlideString \| null` | Convert GlideString |

## 10. Configuration Translation

### Connection Options Mapping
| ioredis | Valkey-Glide | Notes |
|---------|--------------|-------|
| `host` | `addresses[].host` | Single host to addresses array |
| `port` | `addresses[].port` | Single port to addresses array |
| `password` | `credentials.password` | Nested structure |
| `db` | `databaseId` | Different property name |
| `retryDelayOnFailover` | N/A | Handle in adapter layer |
| `maxRetriesPerRequest` | N/A | Handle in adapter layer |

### Cluster Options Mapping
| ioredis | Valkey-Glide | Notes |
|---------|--------------|-------|
| `[{host, port}]` | `addresses` | Direct mapping |
| `enableReadyCheck` | N/A | Handle in adapter |
| `redisOptions` | Global config | Flatten structure |

## 11. Implementation Strategy

### Command Translation Priority
1. **Tier 1 (High Priority)**: String, Hash, List, Key management
2. **Tier 2 (Medium Priority)**: Set, Sorted Set, Pub/Sub basic
3. **Tier 3 (Lower Priority)**: Streams, Transactions, Advanced features

### Translation Patterns
1. **Parameter Normalization**: Convert variadic args to structured formats
2. **Return Value Conversion**: Handle GlideString to string conversion
3. **Error Mapping**: Convert error types while preserving information
4. **Event Emulation**: Implement EventEmitter interface for pub/sub
5. **Connection Management**: Abstract factory pattern differences

### Compatibility Considerations
- Maintain callback support through promise-to-callback conversion
- Preserve all event names and signatures
- Handle deprecated commands by mapping to modern equivalents
- Ensure error messages remain consistent with ioredis format

This analysis provides the detailed mapping required for implementing a comprehensive adapter layer that maintains full compatibility with existing ioredis-based applications.