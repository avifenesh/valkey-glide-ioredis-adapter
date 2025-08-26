# Pub/Sub Usage Patterns in Major Libraries

## Overview

This document analyzes how major Node.js libraries utilize Redis pub/sub features, providing insights for ioredis adapter implementation. Understanding these patterns is crucial for ensuring compatibility with real-world applications.

## BullMQ (Job Queue Library)

### Core Pub/Sub Usage

**Primary Pattern**: BullMQ primarily uses **Redis Streams** for job events, but utilizes pub/sub for specific coordination tasks.

```javascript
// BullMQ pub/sub usage patterns from documentation research:

// 1. Queue Event Broadcasting
// Uses pub/sub to notify multiple workers about queue state changes
const queue = new Queue('myqueue', { connection: redisConnection });

// Internal BullMQ pub/sub usage:
// - Job completion notifications across workers
// - Queue pause/resume coordination
// - Worker health check broadcasting
// - Rate limiting coordination

// 2. Cross-Worker Communication
// BullMQ uses dedicated channels for worker coordination:
// - `bull:${queueName}:paused` - Queue pause notifications  
// - `bull:${queueName}:resumed` - Queue resume notifications
// - `bull:${queueName}:waiting` - New job notifications

// 3. ioredis Pub/Sub Integration
const Redis = require('ioredis');
const subscriber = new Redis(redisConfig);
const publisher = new Redis(redisConfig);

// BullMQ creates dedicated connections for pub/sub
subscriber.on('message', (channel, message) => {
  if (channel.startsWith('bull:')) {
    handleBullMQEvent(channel, message);
  }
});

// Pattern subscriptions for multiple queues
subscriber.psubscribe('bull:*:paused', 'bull:*:resumed');
```

**Key Requirements for Adapter**:
- Must support pattern subscriptions (`psubscribe`)
- Reliable message delivery for coordination
- Separate subscriber/publisher connections
- Event timing consistency for job coordination

### Critical Compatibility Points

```javascript
// BullMQ expects these ioredis behaviors:
// 1. Dedicated subscriber connection (cannot execute regular commands)
// 2. Pattern-based subscriptions for multi-queue monitoring
// 3. Message buffering during reconnection
// 4. Subscription count tracking

class BullMQPubSubManager {
  constructor(redisOptions) {
    // Separate connections - critical pattern
    this.subscriber = new Redis(redisOptions);
    this.publisher = new Redis(redisOptions);
    
    this.subscriber.on('pmessage', this.handlePatternMessage.bind(this));
    this.subscriber.on('subscribe', this.onSubscriptionConfirm.bind(this));
  }
  
  // Must handle pattern subscriptions correctly
  async subscribeToQueues(queueNames) {
    const patterns = queueNames.map(name => `bull:${name}:*`);
    await this.subscriber.psubscribe(...patterns);
  }
}
```

## Socket.io Redis Adapter

### Core Pub/Sub Usage

**Primary Pattern**: Socket.io uses pub/sub for **multi-instance message broadcasting** and room management.

```javascript
// Socket.io Redis adapter pub/sub patterns:

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis'); // or ioredis

// Socket.io creates dedicated pub/sub connections
const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

// Internal Socket.io pub/sub usage:
// 1. Room Broadcasting
// Channel: `socket.io#${namespace}#room#${roomName}`
// Message: JSON with event data and target sockets

// 2. Namespace Events  
// Channel: `socket.io#${namespace}#`
// Message: Broadcast events across server instances

// 3. Socket Management
// Channel: `socket.io#${namespace}#socket#${socketId}`
// Message: Direct socket targeting across instances
```

**Message Format Requirements**:
```javascript
// Socket.io expects specific message structures
const socketIOMessage = {
  type: 2, // EVENT type
  data: ['eventName', eventData],
  nsp: '/namespace',
  rooms: ['room1', 'room2'],
  flags: { broadcast: true }
};

// Pub/sub message flow:
// 1. Server A: socket.to('room1').emit('message', data)
// 2. Adapter publishes to: `socket.io#/namespace#room#room1`
// 3. All instances receive via subscription
// 4. Servers B,C emit to local room members
```

**Key Requirements for Adapter**:
- Exact channel subscription without pattern matching
- JSON message serialization/deserialization  
- High-frequency message handling (real-time apps)
- Connection resilience during network issues

### Critical Compatibility Points

```javascript
// Socket.io adapter expects these behaviors:
class SocketIORedisAdapter {
  constructor(pubClient, subClient) {
    this.pubClient = pubClient;    // For publishing messages
    this.subClient = subClient;    // For receiving messages
    
    // Critical: Uses exact channel subscriptions
    this.subClient.on('message', (channel, message) => {
      this.handleSocketIOMessage(channel, message);
    });
    
    // Subscribes to multiple specific channels
    this.subClient.subscribe(
      'socket.io#/namespace#',           // Namespace broadcasts
      'socket.io#/namespace#room#*'      // Room-specific (if pattern support)
    );
  }
  
  // Must support rapid publish operations
  async broadcast(packet, opts) {
    const channel = this.computeChannel(opts);
    await this.pubClient.publish(channel, JSON.stringify(packet));
  }
}
```

## Session Store Libraries

### Core Pub/Sub Usage

**Primary Pattern**: Session stores primarily use Redis for **storage**, with limited pub/sub usage for **invalidation**.

```javascript
// Connect-redis (Express session store)
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

// Minimal pub/sub usage - mainly for session invalidation
const redisClient = new Redis();
const subscriber = new Redis();

// Session invalidation pattern
subscriber.subscribe('session:invalidate');
subscriber.on('message', (channel, sessionId) => {
  if (channel === 'session:invalidate') {
    // Remove session from local cache
    localCache.delete(sessionId);
  }
});

// Publishing invalidation events
async function invalidateSession(sessionId) {
  await redisClient.publish('session:invalidate', sessionId);
}
```

**Key Requirements for Adapter**:
- Basic SUBSCRIBE/PUBLISH support
- String message handling
- Minimal latency for invalidation
- Simple channel management

## Cache Libraries (node-cache-manager-redis)

### Core Pub/Sub Usage

**Primary Pattern**: Cache invalidation and cluster coordination.

```javascript
// Cache invalidation across multiple app instances
const cacheManager = require('cache-manager');
const redisStore = require('cache-manager-redis-store');

// Pub/sub for cache coordination
const subscriber = new Redis();
const publisher = new Redis();

subscriber.subscribe('cache:invalidate', 'cache:clear');
subscriber.on('message', (channel, message) => {
  switch (channel) {
    case 'cache:invalidate':
      const { key, pattern } = JSON.parse(message);
      localCache.del(key);
      break;
    case 'cache:clear':
      localCache.flushAll();
      break;
  }
});

// Publishing cache events
async function invalidateCache(key) {
  await publisher.publish('cache:invalidate', JSON.stringify({ key }));
}
```

## Real-time Analytics Libraries

### Core Pub/Sub Usage

**Primary Pattern**: Event streaming and metrics aggregation.

```javascript
// Real-time analytics event streaming
const subscriber = new Redis();
const publisher = new Redis();

// Pattern-based event subscription
subscriber.psubscribe('analytics:*', 'metrics:*', 'events:*');

subscriber.on('pmessage', (pattern, channel, message) => {
  const eventData = JSON.parse(message);
  
  switch (pattern) {
    case 'analytics:*':
      processAnalyticsEvent(channel, eventData);
      break;
    case 'metrics:*':
      aggregateMetrics(channel, eventData);
      break;
    case 'events:*':
      logEvent(channel, eventData);
      break;
  }
});

// High-frequency event publishing
async function trackEvent(category, event, data) {
  const channel = `events:${category}:${event}`;
  await publisher.publish(channel, JSON.stringify(data));
}
```

## Summary of Critical Patterns

### 1. **Connection Patterns**
```javascript
// Dual-client pattern (most common)
const publisher = new Redis(config);  // For publishing
const subscriber = new Redis(config); // For subscribing (dedicated)

// Subscription restrictions apply to subscriber
// Regular operations use publisher connection
```

### 2. **Subscription Patterns**
```javascript
// Exact channel subscriptions
subscriber.subscribe('specific:channel');

// Pattern-based subscriptions (critical for scalability)  
subscriber.psubscribe('events:*', 'queues:*');

// Mixed subscriptions (both exact and pattern)
subscriber.subscribe('control:commands');
subscriber.psubscribe('data:*');
```

### 3. **Message Handling Patterns**
```javascript
// String messages (simple)
subscriber.on('message', (channel, message) => {
  console.log(`${channel}: ${message}`);
});

// JSON messages (structured data)
subscriber.on('message', (channel, message) => {
  const data = JSON.parse(message);
  handleStructuredEvent(channel, data);
});

// Pattern message handling
subscriber.on('pmessage', (pattern, channel, message) => {
  // Route based on pattern and channel
  routeMessage(pattern, channel, message);
});
```

### 4. **Error Handling Patterns**
```javascript
// Connection resilience (critical for production)
subscriber.on('error', (error) => {
  console.error('Pub/sub error:', error);
  // Applications expect automatic reconnection
});

subscriber.on('reconnecting', () => {
  // Subscriptions are automatically restored by ioredis
  console.log('Reconnecting to Redis...');
});
```

## Adapter Implementation Requirements

Based on this analysis, the ioredis adapter must:

### 1. **Core Compatibility**
- Support exact channel and pattern subscriptions
- Maintain separate publisher/subscriber connection behavior
- Implement proper EventEmitter interface
- Handle both string and Buffer message types

### 2. **Performance Requirements**
- Handle high-frequency publishing (Socket.io real-time)
- Minimize latency for time-sensitive events (job queues)
- Support concurrent subscriptions without blocking
- Efficient memory usage for large subscription sets

### 3. **Reliability Requirements**
- Automatic subscription restoration after reconnection
- Message ordering preservation
- Error propagation without breaking event flow
- Graceful degradation during network issues

### 4. **Library-Specific Support**
- **BullMQ**: Pattern subscriptions, coordination messages
- **Socket.io**: High-frequency exact channel subscriptions  
- **Session Stores**: Simple invalidation pub/sub
- **Analytics**: Pattern-based event routing

This analysis provides the foundation for implementing a production-ready pub/sub adapter that maintains compatibility with all major Redis-dependent libraries.