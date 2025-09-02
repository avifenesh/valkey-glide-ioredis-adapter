# Pub/Sub Architecture Guide

## Overview

The Valkey GLIDE ioredis adapter implements a **dual pub/sub architecture** that provides optimal performance for different use cases while maintaining full ioredis compatibility.

## Dual Architecture Components

### 1. Direct GLIDE Pub/Sub (Default)
**High-Performance Native Callbacks**

- **Use Case**: High-throughput applications with text-only messaging
- **Performance**: Zero-copy message delivery, no polling overhead
- **Message Types**: Text only (strings)
- **Implementation**: Uses GLIDE's native callback mechanism
- **Advantages**: Maximum performance, lowest latency
- **Limitations**: Text messages only, no binary data support

```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';

const subscriber = new Redis({ host: 'localhost', port: 6379 });

// Direct GLIDE pub/sub (default mode)
await subscriber.subscribe('channel1');
subscriber.on('message', (channel, message) => {
  console.log(`Received: ${message} on ${channel}`);
});
```

### 2. ioredis-Compatible Pub/Sub
**Full Binary Support with Direct TCP**

- **Use Case**: Socket.IO, MessagePack, binary data applications
- **Performance**: Slightly higher overhead due to RESP parsing
- **Message Types**: Full binary support (Buffer/string)
- **Implementation**: Direct TCP connection with RESP protocol parsing
- **Advantages**: Full ioredis compatibility, binary data support
- **Activation**: Set `enableEventBasedPubSub: true`

```typescript
import { Redis } from 'valkey-glide-ioredis-adapter';

const subscriber = new Redis({ 
  host: 'localhost', 
  port: 6379,
  enableEventBasedPubSub: true // Enable binary-compatible mode
});

await subscriber.subscribe('channel1');
subscriber.on('messageBuffer', (channel, message) => {
  // message is Buffer for binary compatibility
  console.log(`Binary message:`, message);
});
```

## Architecture Decision Matrix

| Feature | Direct GLIDE | ioredis-Compatible |
|---------|-------------|-------------------|
| **Performance** | ✅ Maximum | ⚡ High |
| **Binary Data** | ❌ No | ✅ Full Support |
| **Socket.IO** | ❌ Not Compatible | ✅ Full Support |
| **MessagePack** | ❌ No | ✅ Supported |
| **Memory Usage** | ✅ Minimal | ⚡ Low |
| **CPU Overhead** | ✅ None | ⚡ Minimal |
| **ioredis Events** | ⚡ Basic | ✅ Complete |

## Socket.IO Integration

For Socket.IO applications, the adapter automatically enables binary-compatible mode:

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'valkey-glide-ioredis-adapter';

// Socket.IO automatically uses binary-compatible mode
const pubClient = new Redis({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## Automatic Mode Selection

The adapter intelligently selects the appropriate mode:

1. **Default**: Direct GLIDE for maximum performance
2. **Auto-Detection**: Switches to ioredis-compatible mode when:
   - `enableEventBasedPubSub: true` is set
   - Socket.IO adapter patterns are detected
   - Binary event listeners are registered

## Performance Characteristics

### Direct GLIDE Mode
```
Architecture: Native GLIDE callbacks
Memory: Minimal overhead  
CPU: Optimized native calls
Protocol: Direct GLIDE interface
```

### ioredis-Compatible Mode
```
Architecture: Direct TCP with RESP parsing
Memory: RESP parsing buffers
CPU: Protocol parsing required
Protocol: Full RESP compatibility
```

## Advanced Usage

### Pattern Subscriptions

Both modes support pattern subscriptions:

```typescript
// Works in both modes
await subscriber.psubscribe('user:*', 'order:*');

subscriber.on('pmessage', (pattern, channel, message) => {
  console.log(`Pattern ${pattern}: ${message} on ${channel}`);
});
```

### Cluster Support

Cluster clients support sharded pub/sub (Valkey 7.0+):

```typescript
import { Cluster } from 'valkey-glide-ioredis-adapter';

const cluster = new Cluster([
  { host: '127.0.0.1', port: 7000 }
]);

// Sharded pub/sub (cluster only)
await cluster.ssubscribe('shard-channel');

// Regular pub/sub also available
await cluster.subscribe('global-channel');
```

## Migration Guide

### From Pure ioredis
```typescript
// Before (ioredis)
import Redis from 'ioredis';
const redis = new Redis();

// After (GLIDE adapter) - no changes needed!
import { Redis } from 'valkey-glide-ioredis-adapter';
const redis = new Redis();
```

### Enabling Binary Support
```typescript
// If you need binary data support
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  enableEventBasedPubSub: true // Enable for binary compatibility
});
```

## Best Practices

1. **Use Direct GLIDE Mode** for high-performance text messaging
2. **Use ioredis-Compatible Mode** for Socket.IO, binary data, or complex integrations
3. **Test Both Modes** in your specific use case to measure performance impact
4. **Monitor Resource Usage** when switching between modes

## Troubleshooting

### Common Issues

**Binary Data Not Working**
- Solution: Enable `enableEventBasedPubSub: true`

**Socket.IO Compatibility Issues** 
- Solution: Ensure binary mode is enabled (usually automatic)

**Performance Lower Than Expected**
- Check if you need binary support - use Direct GLIDE if text-only

**Message Loss**
- Verify proper error handling and connection management
- Consider connection resilience patterns

## Implementation Details

The dual architecture is implemented through:

1. **BaseClient**: Manages mode selection and routing
2. **DirectGlidePubSub**: GLIDE native callback implementation  
3. **IoredisPubSubClient**: Direct TCP with RESP protocol parsing
4. **Automatic Detection**: Smart switching based on usage patterns

This architecture ensures optimal performance while maintaining complete compatibility with existing ioredis applications.