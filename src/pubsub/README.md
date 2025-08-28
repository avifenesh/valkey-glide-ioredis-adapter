# GLIDE Pub/Sub Implementation Guide

## Overview

This project implements **two distinct pub/sub patterns** using **pure GLIDE** to handle different use cases while working around GLIDE's execution context sensitivity.

## 🎯 **Pure GLIDE Architecture**

**IMPORTANT**: This project uses **exclusively Valkey GLIDE**.

## 📋 **Two Pub/Sub Patterns**

### 1. **Direct GLIDE Pub/Sub** (General Usage)
**Use Case**: User applications that can integrate GLIDE directly
**Pattern**: Direct GLIDE client usage with `getPubSubMessage()` polling
**Advantages**: Maximum performance, direct GLIDE integration
**Limitations**: Must be used in direct test/application code (no encapsulation)

### 2. **Custom GLIDE Pub/Sub Bridge** (Library Integration)
**Use Case**: Bull/BullMQ and other libraries requiring ioredis-compatible interface
**Pattern**: Custom polling implementation with EventEmitter compatibility
**Advantages**: Works with existing libraries, ioredis-compatible events
**Implementation**: Custom logic built on pure GLIDE

## 🔧 **Pattern 1: Direct GLIDE Pub/Sub**

### Usage Example

```typescript
import { GlideClient, GlideClientConfiguration, ProtocolVersion } from '@valkey/valkey-glide';

// Create separate clients (as recommended)
const publishClient = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
  protocol: ProtocolVersion.RESP3
});

const subscribeClient = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
  protocol: ProtocolVersion.RESP3,
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['my-channel'])
    }
  }
});

// Publishing
await publishClient.publish('Hello World!', 'my-channel');

// Receiving (polling pattern)
for (let i = 0; i < 100; i++) {
  const message = await subscribeClient.getPubSubMessage();
  if (message) {
    console.log('Received:', message.message, 'on channel:', message.channel);
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 10));
}
```

### Key Points
- ✅ **Maximum Performance**: Direct GLIDE API usage
- ✅ **Separate Clients**: Publisher and subscriber are different clients
- ✅ **Connection-time Configuration**: Subscriptions defined at client creation
- ⚠️ **Direct Usage Only**: Must be used in application code, not encapsulated

## 🔧 **Pattern 2: Custom GLIDE Pub/Sub Bridge**

### Usage Example

```typescript
import { GlidePubSubManager } from './GlidePubSubManager';

// Create the bridge
const pubsub = new GlidePubSubManager({
  host: 'localhost',
  port: 6379
});

// ioredis-compatible event handling
pubsub.on('message', (channel, message) => {
  console.log('Received:', message, 'on channel:', channel);
});

// Subscribe and publish
await pubsub.subscribe('my-channel');
await pubsub.publish('my-channel', 'Hello World!');

// Pattern subscriptions
pubsub.on('pmessage', (pattern, channel, message) => {
  console.log('Pattern match:', pattern, 'channel:', channel, 'message:', message);
});

await pubsub.psubscribe('news.*');
```

### Key Points
- ✅ **Library Compatible**: Works with Bull/BullMQ and other libraries
- ✅ **ioredis Events**: Emits `message`, `pmessage`, `subscribe`, etc.
- ✅ **Dynamic Subscriptions**: Can subscribe/unsubscribe at runtime
- ✅ **Pure GLIDE**: Custom implementation using only GLIDE APIs

## 🏗️ **Implementation Architecture**

### Pattern 1: Direct GLIDE
```
Application Code
       ↓
   GLIDE Client
       ↓
   Redis/Valkey
```

### Pattern 2: Custom Bridge
```
Library (Bull/BullMQ)
       ↓
  EventEmitter API
       ↓
Custom Polling Logic
       ↓
   GLIDE Clients
       ↓
   Redis/Valkey
```

## 🎯 **When to Use Which Pattern**

### Use **Direct GLIDE Pub/Sub** when:
- Building new applications
- Can integrate GLIDE directly
- Need maximum performance
- Have control over the execution context

### Use **Custom GLIDE Bridge** when:
- Integrating with existing libraries (Bull/BullMQ)
- Need ioredis-compatible events
- Require dynamic subscription management
- Working with encapsulated environments

## 🔍 **Technical Details**

### GLIDE Pub/Sub Characteristics
1. **Connection-time Configuration**: Subscriptions must be defined when creating the client
2. **Polling-based**: Use `getPubSubMessage()` to retrieve messages
3. **Context Sensitive**: Direct usage works, encapsulation requires custom logic
4. **Separate Clients**: Publisher and subscriber should be different client instances

### Custom Bridge Implementation
1. **Dynamic Client Management**: Creates new GLIDE clients when subscriptions change
2. **Event Translation**: Converts GLIDE messages to ioredis-compatible events
3. **Polling Management**: Handles continuous polling with proper lifecycle
4. **Error Handling**: Comprehensive error handling and reconnection logic

## 📚 **Examples**

See the `/examples` directory for complete working examples of both patterns:
- `direct-glide-pubsub.ts` - Direct GLIDE usage
- `bridge-pubsub.ts` - Custom bridge usage
- `bull-integration.ts` - Bull/BullMQ integration example

## 🧪 **Testing**

Both patterns are thoroughly tested:
- Unit tests for individual components
- Integration tests with real Redis/Valkey
- Bull/BullMQ compatibility tests
- Performance benchmarks

## 🎯 **Performance Considerations**

### Direct GLIDE Pub/Sub
- **Latency**: Minimal (direct GLIDE API)
- **Throughput**: Maximum (no translation layer)
- **Memory**: Minimal overhead

### Custom Bridge
- **Latency**: Small overhead for event translation
- **Throughput**: High (optimized polling)
- **Memory**: Moderate overhead for event management

## 🔧 **Configuration**

Both patterns support full GLIDE configuration options:
- Connection settings (host, port, TLS)
- Protocol version (RESP2/RESP3)
- Authentication
- Timeout settings
- Retry logic

## 🚀 **Migration Guide**

### From ioredis to Direct GLIDE
1. Replace ioredis client creation with GLIDE client
2. Configure subscriptions at connection time
3. Replace event listeners with polling loop
4. Update publish calls to GLIDE format

### From ioredis to Custom Bridge
1. Replace ioredis import with GlidePubSubManager
2. Keep existing event listener code
3. Update configuration format
4. Test compatibility with existing code

---

**Remember**: This is a **pure GLIDE** implementation, ensuring consistency and leveraging GLIDE's performance benefits.
