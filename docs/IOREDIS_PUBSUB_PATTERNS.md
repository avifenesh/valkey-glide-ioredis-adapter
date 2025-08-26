# ioredis Pub/Sub Event Patterns and Connection Behavior Analysis

## Overview

This document provides a detailed analysis of ioredis pub/sub event patterns, connection handling, and subscription state management based on official documentation and source code examination.

## Core ioredis Pub/Sub Event Model

### 1. Event-Driven Architecture

ioredis pub/sub is built on Node.js EventEmitter pattern with specific event types:

```javascript
const Redis = require('ioredis');
const subscriber = new Redis();

// Primary message events
subscriber.on('message', (channel, message) => {
  // Receives messages from exact channel subscriptions
  console.log(`Received ${message} from ${channel}`);
});

subscriber.on('messageBuffer', (channel, message) => {
  // Same as 'message' but returns buffers instead of strings
  // Both channel and message are Buffer objects
});

// Pattern message events
subscriber.on('pmessage', (pattern, channel, message) => {
  // Receives messages from pattern subscriptions
  // pattern: the pattern that matched
  // channel: actual channel name
  // message: the message content
});

subscriber.on('pmessageBuffer', (pattern, channel, message) => {
  // Buffer version of pmessage
  // All parameters are Buffer objects
});

// Subscription lifecycle events
subscriber.on('subscribe', (channel, count) => {
  // Fired when successfully subscribed to a channel
  // count: total number of active subscriptions
});

subscriber.on('psubscribe', (pattern, count) => {
  // Fired when successfully subscribed to a pattern
  // count: total number of active subscriptions
});

subscriber.on('unsubscribe', (channel, count) => {
  // Fired when unsubscribed from a channel
  // count: remaining number of active subscriptions
});

subscriber.on('punsubscribe', (pattern, count) => {
  // Fired when unsubscribed from a pattern
  // count: remaining number of active subscriptions
});

// Connection events
subscriber.on('connect', () => {
  console.log('Connected to Redis');
});

subscriber.on('ready', () => {
  console.log('Redis connection ready');
});

subscriber.on('error', (error) => {
  console.error('Redis error:', error);
});

subscriber.on('close', () => {
  console.log('Redis connection closed');
});

subscriber.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
});

subscriber.on('end', () => {
  console.log('Redis connection ended');
});
```

### 2. Subscription Operations

#### Exact Channel Subscriptions
```javascript
// Subscribe to specific channels
subscriber.subscribe('channel1', 'channel2', (err, count) => {
  if (err) {
    console.error('Failed to subscribe:', err.message);
  } else {
    console.log(`Subscribed to ${count} channels`);
  }
});

// Unsubscribe from specific channels
subscriber.unsubscribe('channel1', (err, count) => {
  console.log(`Unsubscribed. Remaining subscriptions: ${count}`);
});

// Unsubscribe from all channels
subscriber.unsubscribe((err, count) => {
  console.log(`All channel subscriptions removed. Count: ${count}`);
});
```

#### Pattern Subscriptions
```javascript
// Subscribe to pattern-based channels
subscriber.psubscribe('news.*', 'events.*', (err, count) => {
  if (err) {
    console.error('Failed to psubscribe:', err.message);
  } else {
    console.log(`Pattern subscribed to ${count} patterns`);
  }
});

// Unsubscribe from specific patterns
subscriber.punsubscribe('news.*', (err, count) => {
  console.log(`Pattern unsubscribed. Remaining: ${count}`);
});

// Unsubscribe from all patterns
subscriber.punsubscribe((err, count) => {
  console.log(`All pattern subscriptions removed. Count: ${count}`);
});
```

### 3. Connection State Management

#### Subscriber Mode Restrictions

**Critical Behavior**: When a client issues SUBSCRIBE or PSUBSCRIBE, the connection enters "subscriber mode":

```javascript
const subscriber = new Redis();

// Before subscription - can execute any command
await subscriber.set('key', 'value'); // ✓ Works

// Enter subscriber mode
await subscriber.subscribe('channel1');

// After subscription - only subscription commands allowed
await subscriber.set('key', 'value');        // ✗ Error
await subscriber.get('key');                 // ✗ Error
await subscriber.subscribe('channel2');      // ✓ Works
await subscriber.unsubscribe('channel1');    // ✓ Works
await subscriber.psubscribe('pattern.*');    // ✓ Works
await subscriber.punsubscribe('pattern.*');  // ✓ Works
await subscriber.ping();                     // ✓ Works
await subscriber.quit();                     // ✓ Works

// Exit subscriber mode when no active subscriptions
await subscriber.unsubscribe(); // Unsubscribe from all
await subscriber.punsubscribe(); // Unsubscribe from all patterns

// Now back in regular mode
await subscriber.set('key', 'value'); // ✓ Works again
```

#### Dual Client Pattern

**Standard Practice**: Use separate connections for pub/sub and regular operations:

```javascript
const Redis = require('ioredis');

// Dedicated subscriber connection
const subscriber = new Redis();
subscriber.subscribe('notifications');
subscriber.on('message', (channel, message) => {
  console.log(`Notification: ${message}`);
});

// Dedicated publisher/regular operations connection
const publisher = new Redis();
setInterval(() => {
  publisher.publish('notifications', 'Hello World!');
  publisher.set('counter', Date.now()); // Regular operations
}, 1000);
```

## Event Timing and Ordering

### 1. Subscription Confirmation Flow

```javascript
const subscriber = new Redis();

// Event order when subscribing:
subscriber.on('subscribe', (channel, count) => {
  console.log(`1. Subscribed to ${channel}, total: ${count}`);
});

subscriber.on('message', (channel, message) => {
  console.log(`2. Message received: ${message}`);
});

subscriber.subscribe('test-channel', (err, count) => {
  console.log(`3. Subscribe callback: ${count}`);
  // This callback fires AFTER the 'subscribe' event
});

// Timeline:
// 1. 'subscribe' event emitted
// 2. subscribe() callback executed
// 3. Messages start flowing to 'message' event
```

### 2. Unsubscription Cleanup Flow

```javascript
subscriber.on('unsubscribe', (channel, count) => {
  console.log(`Unsubscribed from ${channel}, remaining: ${count}`);
  
  if (count === 0) {
    console.log('Back to regular mode - can execute any command');
  }
});

subscriber.unsubscribe('test-channel', (err, count) => {
  console.log(`Unsubscribe callback: ${count}`);
});
```

## Error Handling Patterns

### 1. Subscription Errors

```javascript
subscriber.subscribe('channel1', (err, count) => {
  if (err) {
    // Network issues, authentication problems, etc.
    console.error('Subscription failed:', err.message);
    return;
  }
  console.log(`Successfully subscribed to ${count} channels`);
});

// General error handling
subscriber.on('error', (error) => {
  console.error('Redis connection error:', error);
  // Connection will automatically attempt to reconnect
});
```

### 2. Connection Recovery

```javascript
subscriber.on('reconnecting', () => {
  console.log('Connection lost, attempting to reconnect...');
});

subscriber.on('connect', () => {
  console.log('Reconnected to Redis');
  // Subscriptions are automatically restored
});

subscriber.on('ready', () => {
  console.log('Connection ready, subscriptions active');
});
```

## Message Format Specifications

### 1. Regular Messages

**Event**: `message`
**Parameters**: `(channel: string, message: string)`

```javascript
subscriber.on('message', (channel, message) => {
  // channel: exact channel name that received the message
  // message: string content (UTF-8 decoded)
});
```

### 2. Pattern Messages

**Event**: `pmessage`
**Parameters**: `(pattern: string, channel: string, message: string)`

```javascript
subscriber.on('pmessage', (pattern, channel, message) => {
  // pattern: the pattern that matched (e.g., 'news.*')
  // channel: actual channel name (e.g., 'news.sports')
  // message: string content
});
```

### 3. Binary Messages

**Events**: `messageBuffer`, `pmessageBuffer`
**Parameters**: Same as above but all parameters are Buffer objects

```javascript
subscriber.on('messageBuffer', (channel, message) => {
  // channel: Buffer containing channel name
  // message: Buffer containing raw message data
});

subscriber.on('pmessageBuffer', (pattern, channel, message) => {
  // All parameters are Buffer objects
});
```

## Subscription State Tracking

### 1. Count Management

ioredis automatically tracks subscription counts:

```javascript
let subscriptionCount = 0;

subscriber.on('subscribe', (channel, count) => {
  subscriptionCount = count;
  console.log(`Active subscriptions: ${count}`);
});

subscriber.on('psubscribe', (pattern, count) => {
  subscriptionCount = count;
  console.log(`Active subscriptions (including patterns): ${count}`);
});

subscriber.on('unsubscribe', (channel, count) => {
  subscriptionCount = count;
  if (count === 0) {
    console.log('No active subscriptions - back to regular mode');
  }
});

subscriber.on('punsubscribe', (pattern, count) => {
  subscriptionCount = count;
  if (count === 0) {
    console.log('No active subscriptions - back to regular mode');
  }
});
```

### 2. Channel/Pattern Tracking

```javascript
const activeChannels = new Set();
const activePatterns = new Set();

subscriber.on('subscribe', (channel, count) => {
  activeChannels.add(channel);
});

subscriber.on('unsubscribe', (channel, count) => {
  activeChannels.delete(channel);
});

subscriber.on('psubscribe', (pattern, count) => {
  activePatterns.add(pattern);
});

subscriber.on('punsubscribe', (pattern, count) => {
  activePatterns.delete(pattern);
});
```

## Complex Usage Patterns

### 1. Dynamic Subscription Management

```javascript
class PubSubManager {
  constructor() {
    this.subscriber = new Redis();
    this.setupEventHandlers();
    this.subscriptions = new Map();
  }
  
  setupEventHandlers() {
    this.subscriber.on('message', (channel, message) => {
      const handlers = this.subscriptions.get(channel) || [];
      handlers.forEach(handler => handler(message));
    });
    
    this.subscriber.on('subscribe', (channel, count) => {
      console.log(`Subscribed to ${channel}, total: ${count}`);
    });
  }
  
  addChannelHandler(channel, handler) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
      this.subscriber.subscribe(channel);
    }
    this.subscriptions.get(channel).push(handler);
  }
  
  removeChannelHandler(channel, handler) {
    const handlers = this.subscriptions.get(channel) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      if (handlers.length === 0) {
        this.subscriptions.delete(channel);
        this.subscriber.unsubscribe(channel);
      }
    }
  }
}
```

### 2. Pattern-Based Routing

```javascript
const subscriber = new Redis();

// Pattern subscription with routing
subscriber.psubscribe('events.*', 'logs.*');

subscriber.on('pmessage', (pattern, channel, message) => {
  switch (pattern) {
    case 'events.*':
      handleEvent(channel, message);
      break;
    case 'logs.*':
      handleLog(channel, message);
      break;
  }
});

function handleEvent(channel, message) {
  const eventType = channel.split('.')[1]; // events.user-signup -> user-signup
  console.log(`Event: ${eventType}, Data: ${message}`);
}

function handleLog(channel, message) {
  const logLevel = channel.split('.')[1]; // logs.error -> error
  console.log(`Log [${logLevel}]: ${message}`);
}
```

## Key Behavioral Requirements for Adapter

Based on this analysis, the ioredis pub/sub adapter must:

1. **Emit correct events** with exact parameter signatures
2. **Maintain connection state** and mode restrictions
3. **Handle subscription counting** accurately
4. **Support both string and buffer modes**
5. **Preserve event timing and ordering**
6. **Implement proper error propagation**
7. **Support dynamic subscription management**
8. **Handle pattern vs exact channel differentiation**
9. **Maintain backward compatibility** with existing ioredis applications

This analysis provides the foundation for implementing a compatible pub/sub adapter that can seamlessly replace ioredis in existing applications.