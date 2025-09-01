# AZ Affinity Examples

This ioredis adapter now supports Valkey GLIDE's AZ Affinity features for optimized performance in multi-AZ deployments.

## Usage Examples

### Standalone Client with AZ Affinity

```javascript
import Redis from 'valkey-glide-ioredis-adapter';

// Basic AZ affinity - read from nodes in same AZ
const redis = new Redis({
  host: 'myserver.com',
  port: 6379,
  readFrom: 'AZAffinity',
  clientAz: 'us-east-1a'
});

// AZ affinity with fallback to primary
const redis2 = new Redis({
  host: 'myserver.com', 
  port: 6379,
  readFrom: 'AZAffinityReplicasAndPrimary',
  clientAz: 'us-west-2b'
});
```

### Cluster Client with AZ Affinity

```javascript
import { Cluster } from 'valkey-glide-ioredis-adapter';

const cluster = new Cluster([
  { host: 'node1.myapp.com', port: 7000 },
  { host: 'node2.myapp.com', port: 7001 },
  { host: 'node3.myapp.com', port: 7002 }
], {
  readFrom: 'AZAffinity',
  clientAz: 'us-east-1a'
});

// Legacy compatibility still works
const legacyCluster = new Cluster([
  { host: 'node1.myapp.com', port: 7000 },
  { host: 'node2.myapp.com', port: 7001 }
], {
  enableReadFromReplicas: true  // Still supported
});
```

## Available ReadFrom Options

- `'primary'` - Always read from primary nodes (default)
- `'preferReplica'` - Prefer replica nodes when available, fallback to primary
- `'AZAffinity'` - Read from nodes in same AZ as client
- `'AZAffinityReplicasAndPrimary'` - Read from any nodes in same AZ

## Benefits

- **Lower latency**: Read from geographically closest nodes
- **Reduced cross-AZ traffic**: Saves bandwidth costs in AWS, reducing costs  
- **Better fault tolerance**: Graceful degradation when AZ is unavailable
- **Drop-in compatibility**: Works with existing ioredis code

This feature leverages GLIDE's high-performance Rust core while maintaining 100% ioredis API compatibility.