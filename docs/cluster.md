# Cluster Setup

Redis cluster configuration with Valkey GLIDE ioredis Adapter.

## Basic Cluster Setup

```typescript
import { Cluster } from 'valkey-glide-ioredis-adapter';

const cluster = new Cluster([
  { host: 'node1.example.com', port: 7000 },
  { host: 'node2.example.com', port: 7001 },
  { host: 'node3.example.com', port: 7002 }
]);

await cluster.connect();
```

## Cluster Configuration

```typescript
const cluster = new Cluster([
  { host: 'node1', port: 7000 },
  { host: 'node2', port: 7001 }
], {
  password: 'cluster-password',
  readFrom: 'preferReplica', // Read from replicas when possible
  maxRetriesPerRequest: 3,
  lazyConnect: false
});
```

## AZ Affinity (AWS/Multi-AZ)

```typescript
const cluster = new Cluster([
  { host: 'node1.us-east-1a.example.com', port: 7000 },
  { host: 'node2.us-east-1b.example.com', port: 7001 }
], {
  readFrom: 'AZAffinity',
  clientAz: 'us-east-1a' // Read from same AZ when possible
});
```

## Bull/BullMQ with Cluster

```typescript
import Queue from 'bull';

const myQueue = new Queue('jobs', {
  createClient: () => new Cluster([
    { host: 'node1', port: 7000 },
    { host: 'node2', port: 7001 }
  ], {
    lazyConnect: false,
    maxRetriesPerRequest: null
  })
});
```

## Cluster Operations

```typescript
// All standard Redis operations work
await cluster.set('key', 'value');
const value = await cluster.get('key');

// Multi-key operations are split by slot
await cluster.mset('key1', 'value1', 'key2', 'value2');

// Transactions require keys in same slot
const multi = cluster.multi();
multi.set('user:123:name', 'John');
multi.set('user:123:email', 'john@example.com');
await multi.exec();
```

## Sharded Pub/Sub (Redis 7.0+)

```typescript
// Publish to specific shard
await cluster.spublish('notifications', 'message');

// Subscribe to sharded channel
cluster.ssubscribe('notifications');
cluster.on('smessage', (channel, message) => {
  console.log(`Shard ${channel}: ${message}`);
});
```

## Scanning Cluster

```typescript
// Scan across all nodes
let cursor = '0';
do {
  const result = await cluster.scan(cursor, 'MATCH', 'user:*');
  cursor = result[0];
  const keys = result[1];
  console.log('Found keys:', keys);
} while (cursor !== '0');
```

## Read Preferences

```typescript
const cluster = new Cluster(nodes, {
  // Read from primary nodes only (default)
  readFrom: 'primary',

  // Prefer replicas, fallback to primary
  readFrom: 'preferReplica',

  // Read from nodes in same AZ
  readFrom: 'AZAffinity',
  clientAz: 'us-west-2a'
});
```

## Error Handling

```typescript
try {
  await cluster.set('key', 'value');
} catch (error) {
  if (error.message.includes('CLUSTERDOWN')) {
    console.log('Cluster is reconfiguring, retry...');
  }
}
```

## Cleanup

```typescript
await cluster.quit(); // Closes all node connections
```

Cluster operations work identically to ioredis with enhanced performance and reliability from GLIDE.