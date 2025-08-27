# Cluster Support

The ioredis-adapter now supports Redis cluster mode through the `ClusterAdapter` class, built on top of Valkey GLIDE's cluster client.

## Basic Usage

```typescript
import { ClusterAdapter } from '@valkey/valkey-glide-ioredis-adapter';

// Single node cluster (for testing)
const cluster = new ClusterAdapter({
  host: 'localhost',
  port: 7000
});

// Multi-node cluster
const cluster = new ClusterAdapter({
  nodes: [
    { host: 'cluster-node-1', port: 7000 },
    { host: 'cluster-node-2', port: 7001 },
    { host: 'cluster-node-3', port: 7002 }
  ]
});

await cluster.connect();
```

## Configuration Options

The `ClusterAdapter` accepts all standard Redis options plus cluster-specific options:

```typescript
interface ClusterOptions extends RedisOptions {
  enableReadFromReplicas?: boolean;  // Default: false
  scaleReads?: 'master' | 'slave' | 'all';  // Default: 'master'
  maxRedirections?: number;  // Default: 16
  retryDelayOnFailover?: number;  // Default: 100
  enableOfflineQueue?: boolean;  // Default: true
  readOnly?: boolean;  // Default: false
  nodes?: Array<{ host: string; port: number }>;
}
```

## Bull/BullMQ Compatibility

The cluster adapter is fully compatible with Bull and BullMQ:

```typescript
import { ClusterAdapter } from '@valkey/valkey-glide-ioredis-adapter';
import Queue from 'bull';

// Create cluster-aware Bull queue
const cluster = new ClusterAdapter({
  nodes: [
    { host: 'cluster-node-1', port: 7000 },
    { host: 'cluster-node-2', port: 7001 },
    { host: 'cluster-node-3', port: 7002 }
  ]
});

const queue = new Queue('my queue', {
  createClient: (type) => {
    return ClusterAdapter.createClient(type, {
      nodes: [
        { host: 'cluster-node-1', port: 7000 },
        { host: 'cluster-node-2', port: 7001 },
        { host: 'cluster-node-3', port: 7002 }
      ]
    });
  }
});
```

## Key Features

### Automatic Failover
The cluster adapter automatically handles node failures and redirections, ensuring high availability.

### Read Scaling
Configure read operations to be distributed across replica nodes:

```typescript
const cluster = new ClusterAdapter({
  nodes: [...],
  enableReadFromReplicas: true,
  scaleReads: 'all'  // Read from both masters and replicas
});
```

### Pub/Sub Support
Cluster pub/sub is fully supported with automatic subscription management across cluster nodes.

### Lua Script Support
Custom Lua scripts work seamlessly across the cluster, with proper key routing.

## Differences from Single-Node Mode

1. **No Database Selection**: Cluster mode doesn't support the `SELECT` command or `db` option
2. **Key Distribution**: Keys are automatically distributed across cluster nodes based on hash slots
3. **Cross-Slot Operations**: Some operations that span multiple hash slots may have limitations
4. **Pub/Sub Behavior**: Messages are distributed across the entire cluster

## Migration from ioredis Cluster

The `ClusterAdapter` is designed to be a drop-in replacement for ioredis cluster:

```typescript
// Before (ioredis)
import { Cluster } from 'ioredis';
const cluster = new Cluster([
  { host: 'localhost', port: 7000 },
  { host: 'localhost', port: 7001 }
]);

// After (ioredis-adapter)
import { ClusterAdapter } from '@valkey/valkey-glide-ioredis-adapter';
const cluster = new ClusterAdapter({
  nodes: [
    { host: 'localhost', port: 7000 },
    { host: 'localhost', port: 7001 }
  ]
});
```

## Performance Considerations

- **Connection Pooling**: GLIDE manages connections efficiently across cluster nodes
- **Request Routing**: Commands are automatically routed to the correct cluster node
- **Batch Operations**: Pipeline and multi operations are optimized for cluster topology
- **Memory Usage**: Lower memory footprint compared to ioredis cluster due to GLIDE's Rust core

## Error Handling

The cluster adapter handles common cluster errors automatically:

- **MOVED redirections**: Automatically retried on the correct node
- **ASK redirections**: Handled transparently
- **Node failures**: Automatic failover to healthy nodes
- **Cluster topology changes**: Automatic slot map updates

## Monitoring and Debugging

Enable debug logging to monitor cluster operations:

```typescript
const cluster = new ClusterAdapter({
  nodes: [...],
  // Add any debug options as needed
});

cluster.on('error', (err) => {
  console.error('Cluster error:', err);
});

cluster.on('connect', () => {
  console.log('Connected to cluster');
});
```
