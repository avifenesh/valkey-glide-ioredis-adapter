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

### 2. **Library Integration Helper** (Library Integration)
**Use Case**: Existing Redis libraries requiring ioredis-compatible interface
**Pattern**: Custom polling implementation with EventEmitter compatibility
**Advantages**: Works with existing libraries, ioredis-compatible events
**Implementation**: Custom logic built on pure GLIDE

## 🚀 **Usage Examples**

### Direct GLIDE Pub/Sub

```typescript
import { 
  createPubSubClients, 
  publishMessage, 
  pollForMessage, 
  cleanupPubSubClients 
} from './DirectGlidePubSub';

async function directPubSubExample() {
  // Create clients
  const clients = await createPubSubClients(
    { host: 'localhost', port: 6379 },
    { 
      channels: ['notifications', 'events'], 
      patterns: ['news.*', 'alerts.*'] 
    }
  );

  // Set up message handling
  const handleMessage = (message) => {
    if (message.pattern) {
      console.log(`Pattern [${message.pattern}] ${message.channel}: ${message.message}`);
    } else {
      console.log(`Channel ${message.channel}: ${message.message}`);
    }
  };

  // Start polling (in your application loop)
  const pollingPromise = createPollingLoop(clients.subscriber, handleMessage, {
    maxIterations: 1000,
    pollTimeoutMs: 100,
    loopDelayMs: 10
  });

  // Publish messages
  await publishMessage(clients.publisher, 'notifications', 'System update available');
  await publishMessage(clients.publisher, 'news.tech', 'New framework released');

  // Cleanup when done
  setTimeout(() => {
    cleanupPubSubClients(clients);
  }, 5000);
}
```

### Library Integration Helper

```typescript
import { BullGlideIntegration } from './DirectGlidePubSub';

// For job queue libraries (Bull, BullMQ, Bee-Queue)
async function jobQueueIntegration() {
  const integration = new BullGlideIntegration();
  
  await integration.initialize(
    { host: 'localhost', port: 6379 },
    ['bull:job:completed', 'bull:job:failed', 'bull:job:progress']
  );

  // Publish job events
  await integration.publish('bull:job:completed', JSON.stringify({ 
    jobId: 123, 
    result: 'success' 
  }));

  await integration.cleanup();
}

// For session stores (connect-redis)
async function sessionStoreIntegration() {
  const integration = new BullGlideIntegration();
  
  await integration.initialize(
    { host: 'localhost', port: 6379 },
    ['session:expired', 'session:created']
  );

  // Handle session events
  await integration.publish('session:expired', JSON.stringify({ 
    sessionId: 'sess_abc123' 
  }));

  await integration.cleanup();
}

// For real-time applications (Socket.IO)
async function realtimeIntegration() {
  const integration = new BullGlideIntegration();
  
  await integration.initialize(
    { host: 'localhost', port: 6379 },
    ['socket.io#/#', 'socket.io-request', 'socket.io-response']
  );

  // Handle real-time events
  await integration.publish('socket.io#/#', JSON.stringify({ 
    type: 'broadcast',
    data: { message: 'Hello all clients!' }
  }));

  await integration.cleanup();
}
```

## 🔧 **Key Points**

### Direct GLIDE Pattern
- ✅ **Maximum Performance**: Direct GLIDE API usage
- ✅ **Full Control**: Complete control over polling and message handling
- ✅ **Separate Clients**: Publisher and subscriber are different GLIDE clients
- ⚠️ **Context Sensitive**: Must be used in direct application code

### Library Integration Pattern
- ✅ **Library Compatible**: Works with existing Redis-dependent libraries
- ✅ **Event Emitter**: Provides ioredis-compatible event interface
- ✅ **Pure GLIDE**: Built entirely on GLIDE primitives
- ✅ **Flexible**: Adapts to different library requirements

## 🏗️ **Architecture Details**

### Direct Pattern Architecture
```
Application Code
       ↓
Direct GLIDE Utilities
       ↓
GLIDE Publisher + Subscriber Clients
       ↓
Redis/Valkey Server
```

### Integration Pattern Architecture
```
Redis Library (Bull/connect-redis/etc.)
       ↓
Library Integration Helper
       ↓
GLIDE Publisher + Subscriber Clients
       ↓
Redis/Valkey Server
```

## 🎯 **Supported Libraries**

This pub/sub implementation has been tested and works with:

- **Job Queues**: Bull, BullMQ, Bee-Queue
- **Session Stores**: connect-redis, express-session
- **Rate Limiting**: rate-limit-redis, express-rate-limit
- **Real-time**: Socket.IO Redis adapter
- **Custom Applications**: Any application using Redis pub/sub

## 🔍 **Technical Details**

### GLIDE Pub/Sub Characteristics
- **Connection-time Configuration**: Subscriptions must be defined when creating the client
- **Polling-based**: Messages are retrieved using `getPubSubMessage()` polling
- **Context Sensitive**: Works in direct code but fails when encapsulated
- **Separate Clients**: Publisher and subscriber must be different client instances

### Working Around Limitations
- **Direct Pattern**: Provides utilities that work with GLIDE's constraints
- **Integration Pattern**: Uses worker-based approach to handle encapsulation issues
- **Pure GLIDE**: Both patterns use only GLIDE APIs, no external dependencies

## 🚀 **Performance Considerations**

- **Direct Pattern**: Optimal performance with minimal overhead
- **Integration Pattern**: Slight overhead for compatibility but still high-performance
- **Polling Frequency**: Configurable polling intervals for different use cases
- **Memory Usage**: Efficient message queuing and processing

## 🤝 **Contributing**

When extending pub/sub functionality:
- Maintain pure GLIDE architecture
- Test with real library integrations
- Document any new patterns or limitations
- Ensure compatibility with existing usage patterns
