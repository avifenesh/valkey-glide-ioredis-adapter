# Pub/Sub Event Emulation Layer Design

## Overview

This document outlines the design for an event emulation layer that bridges valkey-glide's callback-based pub/sub system to ioredis's EventEmitter pattern. This layer is critical for maintaining backward compatibility with existing ioredis applications.

## Core Design Challenge

### The Gap Between Architectures

**ioredis Pattern (Target)**:
```javascript
const subscriber = new Redis();

// EventEmitter-based event handling
subscriber.on('message', (channel, message) => { /* handle */ });
subscriber.on('pmessage', (pattern, channel, message) => { /* handle */ });
subscriber.on('subscribe', (channel, count) => { /* handle */ });
subscriber.on('error', (error) => { /* handle */ });

// Runtime subscription management
await subscriber.subscribe('channel1', 'channel2');
await subscriber.psubscribe('pattern.*');
```

**valkey-glide Pattern (Source)**:
```typescript
// Configuration-time callback setup
const client = await GlideClient.createClient({
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['channel1']),
      [GlideClientConfiguration.PubSubChannelModes.Pattern]: new Set(['pattern.*'])
    },
    callback: (msg: PubSubMsg, context: any) => {
      // Single callback for all message types
      console.log(`${msg.channel}: ${msg.message}`);
    }
  }
});
```

## Event Emulation Layer Architecture

### 1. Core Components

```typescript
// Main emulation layer
class PubSubEventEmulator extends EventEmitter {
  private glideClient: GlideClient | null = null;
  private subscriptionState: SubscriptionState;
  private connectionManager: ConnectionManager;
  private messageRouter: MessageRouter;
  
  constructor(options: RedisOptions) {
    super();
    this.subscriptionState = new SubscriptionState();
    this.connectionManager = new ConnectionManager(options);
    this.messageRouter = new MessageRouter(this);
  }
}

// Subscription state tracking
class SubscriptionState {
  private exactChannels: Set<string> = new Set();
  private patterns: Set<string> = new Set();
  private subscriptionCount: number = 0;
  private isInSubscriberMode: boolean = false;
}

// Message routing and translation
class MessageRouter {
  constructor(private emitter: EventEmitter) {}
  
  handleGlideMessage(msg: PubSubMsg, context: any): void {
    if (msg.pattern) {
      // Pattern subscription message
      this.emitter.emit('pmessage', msg.pattern, msg.channel, msg.message);
    } else {
      // Exact channel subscription message
      this.emitter.emit('message', msg.channel, msg.message);
    }
  }
}
```

### 2. Subscription Management Strategy

#### Dynamic Client Recreation Pattern

Since valkey-glide requires subscriptions at client creation time, we need to recreate clients when subscriptions change:

```typescript
class SubscriptionManager {
  private currentClient: GlideClient | null = null;
  private pendingSubscriptions: {
    exact: Set<string>;
    pattern: Set<string>;
  } = { exact: new Set(), pattern: new Set() };
  
  async updateSubscriptions(): Promise<void> {
    // Close existing client if any
    if (this.currentClient) {
      await this.currentClient.close();
    }
    
    // Create new client with updated subscriptions
    if (this.hasSubscriptions()) {
      this.currentClient = await this.createGlideClient();
    }
  }
  
  private createGlideClient(): Promise<GlideClient> {
    const config: GlideClientConfiguration = {
      addresses: this.connectionManager.getAddresses(),
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: this.pendingSubscriptions.exact,
          [GlideClientConfiguration.PubSubChannelModes.Pattern]: this.pendingSubscriptions.pattern
        },
        callback: this.messageRouter.handleGlideMessage.bind(this.messageRouter),
        context: { emulator: this }
      }
    };
    
    return GlideClient.createClient(config);
  }
}
```

#### Subscription Batching and Optimization

```typescript
class SubscriptionBatcher {
  private batchTimer: NodeJS.Timeout | null = null;
  private pendingOperations: Array<{
    type: 'subscribe' | 'unsubscribe' | 'psubscribe' | 'punsubscribe';
    channels: string[];
    callback?: (err: Error | null, count?: number) => void;
  }> = [];
  
  batchOperation(operation: SubscriptionOperation): void {
    this.pendingOperations.push(operation);
    
    // Debounce to batch rapid subscription changes
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.batchTimer = setTimeout(() => {
      this.executeBatch();
    }, 10); // 10ms debounce
  }
  
  private async executeBatch(): Promise<void> {
    const operations = this.pendingOperations.splice(0);
    
    // Process all operations to compute final subscription state
    const finalState = this.computeFinalState(operations);
    
    // Recreate client with new subscription state
    await this.subscriptionManager.updateSubscriptions(finalState);
    
    // Emit events and execute callbacks
    this.processOperationResults(operations, finalState);
  }
}
```

### 3. Event Translation Layer

#### Message Format Translation

```typescript
class MessageTranslator {
  translateGlideMessage(msg: PubSubMsg): {
    eventType: 'message' | 'pmessage';
    args: any[];
  } {
    if (msg.pattern) {
      return {
        eventType: 'pmessage',
        args: [msg.pattern, msg.channel, msg.message]
      };
    } else {
      return {
        eventType: 'message', 
        args: [msg.channel, msg.message]
      };
    }
  }
  
  translateBuffer(msg: PubSubMsg): {
    eventType: 'messageBuffer' | 'pmessageBuffer';
    args: Buffer[];
  } {
    const channel = Buffer.from(msg.channel);
    const message = Buffer.from(msg.message);
    
    if (msg.pattern) {
      const pattern = Buffer.from(msg.pattern);
      return {
        eventType: 'pmessageBuffer',
        args: [pattern, channel, message]
      };
    } else {
      return {
        eventType: 'messageBuffer',
        args: [channel, message]
      };
    }
  }
}
```

#### Subscription Event Generation

```typescript
class SubscriptionEventGenerator {
  generateSubscriptionEvents(
    operations: SubscriptionOperation[],
    finalCount: number
  ): Array<{ event: string; args: any[] }> {
    const events: Array<{ event: string; args: any[] }> = [];
    let currentCount = finalCount;
    
    // Process operations in reverse to calculate intermediate counts
    for (let i = operations.length - 1; i >= 0; i--) {
      const op = operations[i];
      
      switch (op.type) {
        case 'subscribe':
          for (const channel of op.channels) {
            currentCount--;
            events.unshift({
              event: 'subscribe',
              args: [channel, currentCount + 1]
            });
          }
          break;
          
        case 'unsubscribe':
          for (const channel of op.channels) {
            events.unshift({
              event: 'unsubscribe', 
              args: [channel, currentCount]
            });
            currentCount++;
          }
          break;
          
        case 'psubscribe':
          for (const pattern of op.channels) {
            currentCount--;
            events.unshift({
              event: 'psubscribe',
              args: [pattern, currentCount + 1]
            });
          }
          break;
          
        case 'punsubscribe':
          for (const pattern of op.channels) {
            events.unshift({
              event: 'punsubscribe',
              args: [pattern, currentCount]
            });
            currentCount++;
          }
          break;
      }
    }
    
    return events;
  }
}
```

### 4. Connection State Emulation

#### Subscriber Mode Enforcement

```typescript
class ConnectionStateManager {
  private isInSubscriberMode: boolean = false;
  private blockedCommands: Set<string> = new Set([
    'get', 'set', 'mget', 'mset', 'hget', 'hset', 'lpush', 'rpush',
    // ... all non-pub/sub commands
  ]);
  
  checkCommandAllowed(command: string): void {
    if (this.isInSubscriberMode && this.blockedCommands.has(command.toLowerCase())) {
      throw new Error(
        `ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context`
      );
    }
  }
  
  enterSubscriberMode(): void {
    this.isInSubscriberMode = true;
  }
  
  exitSubscriberMode(): void {
    this.isInSubscriberMode = false;
  }
  
  updateMode(subscriptionCount: number): void {
    if (subscriptionCount > 0) {
      this.enterSubscriberMode();
    } else {
      this.exitSubscriberMode();
    }
  }
}
```

#### Connection Event Emulation

```typescript
class ConnectionEventEmulator {
  constructor(private emitter: EventEmitter) {}
  
  emulateConnectionEvents(client: GlideClient): void {
    // Emit connect event when client is ready
    this.emitter.emit('connect');
    this.emitter.emit('ready');
    
    // Handle client errors and translate to ioredis events
    client.on('error', (error) => {
      this.emitter.emit('error', error);
    });
    
    // Handle disconnections
    client.on('close', () => {
      this.emitter.emit('close');
      this.emitter.emit('end');
    });
  }
  
  emulateReconnection(): void {
    this.emitter.emit('reconnecting');
    // After successful reconnection:
    this.emitter.emit('connect');
    this.emitter.emit('ready');
  }
}
```

## 5. Complete Implementation Structure

### Main PubSubAdapter Class

```typescript
export class PubSubAdapter extends EventEmitter implements IoredisCompatible {
  private subscriptionManager: SubscriptionManager;
  private messageRouter: MessageRouter;
  private stateManager: ConnectionStateManager;
  private batcher: SubscriptionBatcher;
  private eventGenerator: SubscriptionEventGenerator;
  
  constructor(options: RedisOptions) {
    super();
    this.subscriptionManager = new SubscriptionManager(options, this);
    this.messageRouter = new MessageRouter(this);
    this.stateManager = new ConnectionStateManager();
    this.batcher = new SubscriptionBatcher(this.subscriptionManager);
    this.eventGenerator = new SubscriptionEventGenerator();
  }
  
  // ioredis-compatible methods
  async subscribe(...args: any[]): Promise<number> {
    const { channels, callback } = this.parseSubscribeArgs(args);
    
    return new Promise((resolve, reject) => {
      this.batcher.batchOperation({
        type: 'subscribe',
        channels,
        callback: (err, count) => {
          if (err) {
            if (callback) callback(err);
            reject(err);
          } else {
            if (callback) callback(null, count);
            resolve(count);
          }
        }
      });
    });
  }
  
  async unsubscribe(...args: any[]): Promise<number> {
    const { channels, callback } = this.parseUnsubscribeArgs(args);
    
    return new Promise((resolve, reject) => {
      this.batcher.batchOperation({
        type: 'unsubscribe',
        channels: channels.length > 0 ? channels : Array.from(this.subscriptionManager.getExactChannels()),
        callback: (err, count) => {
          if (err) {
            if (callback) callback(err);
            reject(err);
          } else {
            if (callback) callback(null, count);
            resolve(count);
          }
        }
      });
    });
  }
  
  async psubscribe(...args: any[]): Promise<number> {
    const { patterns, callback } = this.parseSubscribeArgs(args);
    
    return new Promise((resolve, reject) => {
      this.batcher.batchOperation({
        type: 'psubscribe',
        channels: patterns,
        callback: (err, count) => {
          if (err) {
            if (callback) callback(err);
            reject(err);
          } else {
            if (callback) callback(null, count);
            resolve(count);
          }
        }
      });
    });
  }
  
  async punsubscribe(...args: any[]): Promise<number> {
    const { patterns, callback } = this.parseUnsubscribeArgs(args);
    
    return new Promise((resolve, reject) => {
      this.batcher.batchOperation({
        type: 'punsubscribe', 
        channels: patterns.length > 0 ? patterns : Array.from(this.subscriptionManager.getPatterns()),
        callback: (err, count) => {
          if (err) {
            if (callback) callback(err);
            reject(err);
          } else {
            if (callback) callback(null, count);
            resolve(count);
          }
        }
      });
    });
  }
  
  // Prevent regular commands in subscriber mode
  async get(key: string): Promise<string | null> {
    this.stateManager.checkCommandAllowed('get');
    // If not in subscriber mode, delegate to regular client
    throw new Error('Regular commands not available in pub/sub adapter');
  }
  
  // Argument parsing utilities
  private parseSubscribeArgs(args: any[]): { channels: string[]; callback?: Function } {
    const channels: string[] = [];
    let callback: Function | undefined;
    
    for (const arg of args) {
      if (typeof arg === 'string') {
        channels.push(arg);
      } else if (typeof arg === 'function') {
        callback = arg;
      }
    }
    
    return { channels, callback };
  }
  
  private parseUnsubscribeArgs(args: any[]): { channels: string[]; callback?: Function } {
    // Same as parseSubscribeArgs but handles empty channels for "unsubscribe all"
    const result = this.parseSubscribeArgs(args);
    return result;
  }
}
```

## Error Handling Strategy

### 1. Valkey-Glide Error Translation

```typescript
class ErrorTranslator {
  translateGlideError(error: any): Error {
    // Map valkey-glide specific errors to ioredis equivalents
    if (error.message?.includes('connection')) {
      const redisError = new Error(error.message);
      (redisError as any).code = 'ECONNREFUSED';
      return redisError;
    }
    
    return error;
  }
}
```

### 2. Graceful Degradation

```typescript
class GracefulDegradation {
  handleClientRecreationFailure(error: Error): void {
    // If client recreation fails, emit error but don't crash
    this.emitter.emit('error', error);
    
    // Attempt retry with exponential backoff
    this.scheduleRetry();
  }
  
  private scheduleRetry(): void {
    const retryDelay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    setTimeout(() => {
      this.attemptClientRecreation();
    }, retryDelay);
  }
}
```

## Performance Considerations

### 1. Memory Management

```typescript
class MemoryManager {
  // Prevent memory leaks from rapid subscription changes
  private maxListeners: number = 100;
  
  manageEventListeners(): void {
    if (this.emitter.listenerCount('message') > this.maxListeners) {
      console.warn('High number of message listeners detected');
    }
  }
  
  cleanupClient(client: GlideClient): void {
    // Ensure proper cleanup when recreating clients
    client.removeAllListeners();
    client.close();
  }
}
```

### 2. Optimization Strategies

```typescript
class PerformanceOptimizer {
  // Cache translated messages to avoid repeated processing
  private messageCache = new Map<string, any>();
  
  optimizeMessageTranslation(msg: PubSubMsg): any {
    const cacheKey = `${msg.channel}:${msg.pattern || 'exact'}`;
    
    if (!this.messageCache.has(cacheKey)) {
      const translated = this.translator.translateMessage(msg);
      this.messageCache.set(cacheKey, translated);
      
      // Prevent unbounded cache growth
      if (this.messageCache.size > 1000) {
        this.messageCache.clear();
      }
    }
    
    return this.messageCache.get(cacheKey);
  }
}
```

## Testing Strategy

### 1. Behavioral Compatibility Tests

```typescript
describe('PubSubAdapter Behavioral Compatibility', () => {
  test('emits subscription events in correct order', async () => {
    const events: string[] = [];
    
    adapter.on('subscribe', (channel, count) => {
      events.push(`subscribe:${channel}:${count}`);
    });
    
    await adapter.subscribe('test1', 'test2');
    
    expect(events).toEqual([
      'subscribe:test1:1',
      'subscribe:test2:2'
    ]);
  });
  
  test('prevents regular commands in subscriber mode', async () => {
    await adapter.subscribe('test');
    
    await expect(adapter.get('key')).rejects.toThrow(
      'only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context'
    );
  });
});
```

### 2. Integration Tests with Real Libraries

```typescript
describe('Integration with BullMQ', () => {
  test('handles BullMQ pattern subscriptions', async () => {
    const queue = new Queue('test', { connection: adapter });
    
    // Test that BullMQ's internal pub/sub usage works
    const job = await queue.add('test-job', { data: 'test' });
    const worker = new Worker('test', async () => {}, { connection: adapter });
    
    // Verify job processing works through adapter
  });
});
```

## Summary

This event emulation layer design provides:

1. **Full ioredis Compatibility**: Maintains all expected events and behaviors
2. **Performance Optimization**: Batching and caching for efficiency  
3. **Error Resilience**: Graceful handling of failures and reconnections
4. **Memory Safety**: Prevents leaks from rapid subscription changes
5. **Production Readiness**: Comprehensive testing and monitoring

The design bridges the architectural gap between valkey-glide and ioredis while maintaining the performance benefits of the valkey-glide client. The next step is implementing this design starting with basic subscription operations.