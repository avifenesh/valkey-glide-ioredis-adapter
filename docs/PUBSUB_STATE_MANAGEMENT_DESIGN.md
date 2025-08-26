# Pub/Sub Subscription State Management and Connection Lifecycle Design

## Overview

This document details the design for managing subscription state and connection lifecycle in the ioredis adapter for valkey-glide. The design addresses the fundamental challenge of mapping ioredis's runtime subscription management to valkey-glide's configuration-time subscription model.

## Core Design Challenges

### 1. Runtime vs Configuration-Time Subscriptions

**ioredis Model**: Dynamic subscription management
```javascript
const subscriber = new Redis();

// Runtime operations - each call modifies active subscriptions
await subscriber.subscribe('channel1');     // Count: 1
await subscriber.subscribe('channel2');     // Count: 2  
await subscriber.psubscribe('news.*');      // Count: 3
await subscriber.unsubscribe('channel1');   // Count: 2
```

**valkey-glide Model**: Configuration-time subscriptions
```typescript
// All subscriptions must be specified at client creation
const client = await GlideClient.createClient({
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [PubSubChannelModes.Exact]: new Set(['channel1', 'channel2']),
      [PubSubChannelModes.Pattern]: new Set(['news.*'])
    },
    callback: handleMessage
  }
});
```

### 2. Connection State Transitions

**ioredis Behavior**:
- Regular mode → Subscriber mode (on first subscription)
- Subscriber mode → Regular mode (when subscription count reaches 0)
- Commands blocked in subscriber mode except pub/sub and utility commands

**valkey-glide Behavior**:
- Unified client can handle both regular and pub/sub operations
- No mode restrictions

## Subscription State Management Architecture

### 1. Core State Tracking

```typescript
interface SubscriptionState {
  exactChannels: Map<string, SubscriptionMetadata>;
  patterns: Map<string, SubscriptionMetadata>;
  totalCount: number;
  isInSubscriberMode: boolean;
  lastUpdateTimestamp: number;
}

interface SubscriptionMetadata {
  subscribedAt: number;
  subscriptionOrder: number;
  isActive: boolean;
}

class SubscriptionStateManager {
  private state: SubscriptionState = {
    exactChannels: new Map(),
    patterns: new Map(),
    totalCount: 0,
    isInSubscriberMode: false,
    lastUpdateTimestamp: Date.now()
  };
  
  private stateHistory: SubscriptionState[] = [];
  private maxHistorySize: number = 50;
  
  // Core state operations
  addExactSubscription(channel: string): number {
    if (!this.state.exactChannels.has(channel)) {
      this.state.exactChannels.set(channel, {
        subscribedAt: Date.now(),
        subscriptionOrder: this.state.totalCount,
        isActive: true
      });
      this.state.totalCount++;
      this.updateSubscriberMode();
      this.recordStateChange();
    }
    return this.state.totalCount;
  }
  
  removeExactSubscription(channel: string): number {
    if (this.state.exactChannels.has(channel)) {
      this.state.exactChannels.delete(channel);
      this.state.totalCount--;
      this.updateSubscriberMode();
      this.recordStateChange();
    }
    return this.state.totalCount;
  }
  
  addPatternSubscription(pattern: string): number {
    if (!this.state.patterns.has(pattern)) {
      this.state.patterns.set(pattern, {
        subscribedAt: Date.now(),
        subscriptionOrder: this.state.totalCount,
        isActive: true
      });
      this.state.totalCount++;
      this.updateSubscriberMode();
      this.recordStateChange();
    }
    return this.state.totalCount;
  }
  
  removePatternSubscription(pattern: string): number {
    if (this.state.patterns.has(pattern)) {
      this.state.patterns.delete(pattern);
      this.state.totalCount--;
      this.updateSubscriberMode();
      this.recordStateChange();
    }
    return this.state.totalCount;
  }
  
  private updateSubscriberMode(): void {
    const wasInSubscriberMode = this.state.isInSubscriberMode;
    this.state.isInSubscriberMode = this.state.totalCount > 0;
    
    if (wasInSubscriberMode !== this.state.isInSubscriberMode) {
      this.emitModeChangeEvent();
    }
  }
  
  private recordStateChange(): void {
    this.state.lastUpdateTimestamp = Date.now();
    
    // Keep history for debugging and rollback scenarios
    this.stateHistory.push(this.cloneState());
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }
  
  // State queries
  getExactChannels(): Set<string> {
    return new Set(this.state.exactChannels.keys());
  }
  
  getPatterns(): Set<string> {
    return new Set(this.state.patterns.keys());
  }
  
  getTotalCount(): number {
    return this.state.totalCount;
  }
  
  isInSubscriberMode(): boolean {
    return this.state.isInSubscriberMode;
  }
  
  hasSubscriptions(): boolean {
    return this.state.totalCount > 0;
  }
  
  // Bulk operations for optimization
  bulkUpdateSubscriptions(operations: SubscriptionOperation[]): {
    finalCount: number;
    events: SubscriptionEvent[];
  } {
    const events: SubscriptionEvent[] = [];
    let currentCount = this.state.totalCount;
    
    for (const op of operations) {
      switch (op.type) {
        case 'subscribe':
          for (const channel of op.channels) {
            if (!this.state.exactChannels.has(channel)) {
              currentCount = this.addExactSubscription(channel);
              events.push({
                type: 'subscribe',
                channel,
                count: currentCount
              });
            }
          }
          break;
          
        case 'unsubscribe':
          const channelsToRemove = op.channels.length > 0 
            ? op.channels 
            : Array.from(this.state.exactChannels.keys());
          
          for (const channel of channelsToRemove) {
            if (this.state.exactChannels.has(channel)) {
              currentCount = this.removeExactSubscription(channel);
              events.push({
                type: 'unsubscribe',
                channel,
                count: currentCount
              });
            }
          }
          break;
          
        case 'psubscribe':
          for (const pattern of op.channels) {
            if (!this.state.patterns.has(pattern)) {
              currentCount = this.addPatternSubscription(pattern);
              events.push({
                type: 'psubscribe',
                pattern,
                count: currentCount
              });
            }
          }
          break;
          
        case 'punsubscribe':
          const patternsToRemove = op.channels.length > 0
            ? op.channels
            : Array.from(this.state.patterns.keys());
          
          for (const pattern of patternsToRemove) {
            if (this.state.patterns.has(pattern)) {
              currentCount = this.removePatternSubscription(pattern);
              events.push({
                type: 'punsubscribe',
                pattern,
                count: currentCount
              });
            }
          }
          break;
      }
    }
    
    return { finalCount: currentCount, events };
  }
}
```

### 2. Operation Batching and Debouncing

```typescript
interface SubscriptionOperation {
  type: 'subscribe' | 'unsubscribe' | 'psubscribe' | 'punsubscribe';
  channels: string[];
  callback?: (err: Error | null, count?: number) => void;
  timestamp: number;
  operationId: string;
}

class SubscriptionBatcher {
  private pendingOperations: SubscriptionOperation[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private batchDelay: number = 10; // 10ms debounce
  private isProcessing: boolean = false;
  
  constructor(
    private stateManager: SubscriptionStateManager,
    private connectionManager: ConnectionLifecycleManager
  ) {}
  
  queueOperation(operation: SubscriptionOperation): Promise<number> {
    return new Promise((resolve, reject) => {
      // Add to pending operations
      this.pendingOperations.push({
        ...operation,
        callback: (err, count) => {
          if (operation.callback) operation.callback(err, count);
          if (err) reject(err);
          else resolve(count || 0);
        }
      });
      
      // Schedule batch processing
      this.scheduleBatch();
    });
  }
  
  private scheduleBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }
  
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.pendingOperations.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Extract current batch
      const operations = this.pendingOperations.splice(0);
      
      // Compute final state
      const { finalCount, events } = this.stateManager.bulkUpdateSubscriptions(operations);
      
      // Update connection with new subscription state
      await this.connectionManager.updateSubscriptions(
        this.stateManager.getExactChannels(),
        this.stateManager.getPatterns()
      );
      
      // Emit events in order
      this.emitSubscriptionEvents(events);
      
      // Execute callbacks
      this.executeCallbacks(operations, events, finalCount);
      
    } catch (error) {
      // Handle batch processing errors
      this.handleBatchError(error, this.pendingOperations);
    } finally {
      this.isProcessing = false;
      
      // Process any new operations that arrived during processing
      if (this.pendingOperations.length > 0) {
        this.scheduleBatch();
      }
    }
  }
  
  private emitSubscriptionEvents(events: SubscriptionEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'subscribe':
          this.eventEmitter.emit('subscribe', event.channel, event.count);
          break;
        case 'unsubscribe':
          this.eventEmitter.emit('unsubscribe', event.channel, event.count);
          break;
        case 'psubscribe':
          this.eventEmitter.emit('psubscribe', event.pattern, event.count);
          break;
        case 'punsubscribe':
          this.eventEmitter.emit('punsubscribe', event.pattern, event.count);
          break;
      }
    }
  }
  
  private executeCallbacks(
    operations: SubscriptionOperation[],
    events: SubscriptionEvent[],
    finalCount: number
  ): void {
    // Map operations to their result events and execute callbacks
    for (const operation of operations) {
      const relevantEvents = events.filter(event => 
        operation.channels.includes(event.channel || event.pattern || '')
      );
      
      if (operation.callback) {
        if (relevantEvents.length > 0) {
          // Use the count from the last relevant event
          const lastEvent = relevantEvents[relevantEvents.length - 1];
          operation.callback(null, lastEvent.count);
        } else {
          // No change occurred (already subscribed/not subscribed)
          operation.callback(null, finalCount);
        }
      }
    }
  }
}
```

## Connection Lifecycle Management

### 1. Client Recreation Strategy

```typescript
interface ClientConfiguration {
  addresses: { host: string; port: number }[];
  credentials?: { username?: string; password?: string };
  clientName?: string;
  requestTimeout?: number;
  connectionRetryDelay?: number;
}

class ConnectionLifecycleManager {
  private currentClient: GlideClient | null = null;
  private clientConfig: ClientConfiguration;
  private subscriptionCallback: (msg: PubSubMsg, context: any) => void;
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 50;
  private reconnectDelay: number = 1000;
  
  constructor(
    config: ClientConfiguration,
    private eventEmitter: EventEmitter,
    private messageRouter: MessageRouter
  ) {
    this.clientConfig = config;
    this.subscriptionCallback = this.messageRouter.handleMessage.bind(this.messageRouter);
  }
  
  async updateSubscriptions(
    exactChannels: Set<string>,
    patterns: Set<string>
  ): Promise<void> {
    const hasSubscriptions = exactChannels.size > 0 || patterns.size > 0;
    
    if (!hasSubscriptions) {
      // No subscriptions - close pub/sub client if exists
      await this.closeClient();
      return;
    }
    
    // Need subscriptions - recreate client with new configuration
    await this.recreateClientWithSubscriptions(exactChannels, patterns);
  }
  
  private async recreateClientWithSubscriptions(
    exactChannels: Set<string>,
    patterns: Set<string>
  ): Promise<void> {
    // Close existing client
    await this.closeClient();
    
    try {
      // Create new client configuration
      const glideConfig: GlideClientConfiguration = {
        addresses: this.clientConfig.addresses,
        credentials: this.clientConfig.credentials,
        clientName: this.clientConfig.clientName,
        requestTimeout: this.clientConfig.requestTimeout,
        pubsubSubscriptions: {
          channelsAndPatterns: {
            [GlideClientConfiguration.PubSubChannelModes.Exact]: exactChannels,
            [GlideClientConfiguration.PubSubChannelModes.Pattern]: patterns
          },
          callback: this.subscriptionCallback,
          context: { manager: this }
        }
      };
      
      // Create new client
      this.connectionState = ConnectionState.Connecting;
      this.eventEmitter.emit('reconnecting');
      
      this.currentClient = await GlideClient.createClient(glideConfig);
      
      // Setup client event handlers
      this.setupClientEventHandlers();
      
      // Connection successful
      this.connectionState = ConnectionState.Connected;
      this.reconnectAttempts = 0;
      this.eventEmitter.emit('connect');
      this.eventEmitter.emit('ready');
      
    } catch (error) {
      this.connectionState = ConnectionState.Disconnected;
      this.handleConnectionError(error);
    }
  }
  
  private async closeClient(): Promise<void> {
    if (this.currentClient) {
      try {
        await this.currentClient.close();
      } catch (error) {
        // Log but don't throw - we're cleaning up
        console.warn('Error closing client:', error);
      } finally {
        this.currentClient = null;
      }
    }
  }
  
  private setupClientEventHandlers(): void {
    if (!this.currentClient) return;
    
    // Handle client errors
    this.currentClient.on('error', (error) => {
      this.handleConnectionError(error);
    });
    
    // Handle client disconnection
    this.currentClient.on('close', () => {
      this.connectionState = ConnectionState.Disconnected;
      this.eventEmitter.emit('close');
      this.eventEmitter.emit('end');
      
      // Attempt reconnection if we have subscriptions
      if (this.shouldReconnect()) {
        this.scheduleReconnect();
      }
    });
  }
  
  private handleConnectionError(error: any): void {
    this.connectionState = ConnectionState.Error;
    this.eventEmitter.emit('error', error);
    
    // Attempt reconnection
    if (this.shouldReconnect()) {
      this.scheduleReconnect();
    }
  }
  
  private shouldReconnect(): boolean {
    return this.reconnectAttempts < this.maxReconnectAttempts &&
           this.connectionState !== ConnectionState.Disconnected;
  }
  
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );
    
    setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }
  
  private async attemptReconnect(): Promise<void> {
    if (this.connectionState === ConnectionState.Connecting) {
      return; // Already attempting to connect
    }
    
    try {
      // Get current subscription state
      const stateManager = this.getStateManager();
      await this.updateSubscriptions(
        stateManager.getExactChannels(),
        stateManager.getPatterns()
      );
    } catch (error) {
      // Reconnection failed, will be retried by error handler
      this.handleConnectionError(error);
    }
  }
  
  // Client access for message publishing
  getClient(): GlideClient | null {
    return this.currentClient;
  }
  
  isConnected(): boolean {
    return this.connectionState === ConnectionState.Connected && 
           this.currentClient !== null;
  }
  
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
}

enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting', 
  Connected = 'connected',
  Error = 'error'
}
```

### 2. Connection Health Monitoring

```typescript
class ConnectionHealthMonitor {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckFrequency: number = 30000; // 30 seconds
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 3;
  
  constructor(
    private connectionManager: ConnectionLifecycleManager,
    private eventEmitter: EventEmitter
  ) {}
  
  startMonitoring(): void {
    this.stopMonitoring(); // Ensure no duplicate intervals
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckFrequency);
  }
  
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  private async performHealthCheck(): Promise<void> {
    const client = this.connectionManager.getClient();
    
    if (!client) {
      this.consecutiveFailures++;
      this.handleHealthCheckFailure();
      return;
    }
    
    try {
      // Perform a simple ping to check connection health
      await client.ping();
      
      // Health check successful
      this.consecutiveFailures = 0;
      
    } catch (error) {
      this.consecutiveFailures++;
      this.handleHealthCheckFailure();
    }
  }
  
  private handleHealthCheckFailure(): void {
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.eventEmitter.emit('error', new Error(
        `Connection health check failed ${this.consecutiveFailures} consecutive times`
      ));
      
      // Trigger reconnection attempt
      this.connectionManager.scheduleReconnect();
    }
  }
}
```

### 3. Graceful Shutdown Handling

```typescript
class GracefulShutdownHandler {
  private isShuttingDown: boolean = false;
  private shutdownTimeout: number = 5000; // 5 seconds
  
  constructor(
    private connectionManager: ConnectionLifecycleManager,
    private healthMonitor: ConnectionHealthMonitor,
    private batcher: SubscriptionBatcher
  ) {
    // Register process exit handlers
    process.on('SIGINT', this.handleShutdown.bind(this));
    process.on('SIGTERM', this.handleShutdown.bind(this));
    process.on('beforeExit', this.handleShutdown.bind(this));
  }
  
  async handleShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }
    
    this.isShuttingDown = true;
    
    const shutdownPromise = this.performGracefulShutdown();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Shutdown timeout exceeded'));
      }, this.shutdownTimeout);
    });
    
    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
    } catch (error) {
      console.warn('Graceful shutdown failed:', error.message);
    }
  }
  
  private async performGracefulShutdown(): Promise<void> {
    // Stop health monitoring
    this.healthMonitor.stopMonitoring();
    
    // Wait for pending operations to complete
    await this.batcher.waitForPendingOperations();
    
    // Close connection
    await this.connectionManager.closeClient();
  }
}
```

## State Persistence and Recovery

### 1. Subscription State Persistence

```typescript
class SubscriptionStatePersistence {
  private persistenceKey: string = 'ioredis-adapter:subscription-state';
  private persistenceEnabled: boolean = false;
  
  constructor(private stateManager: SubscriptionStateManager) {}
  
  enablePersistence(): void {
    this.persistenceEnabled = true;
    
    // Restore state on startup
    this.restoreState();
    
    // Persist state on changes
    this.stateManager.on('stateChanged', () => {
      this.persistState();
    });
  }
  
  private persistState(): void {
    if (!this.persistenceEnabled) return;
    
    try {
      const state = {
        exactChannels: Array.from(this.stateManager.getExactChannels()),
        patterns: Array.from(this.stateManager.getPatterns()),
        timestamp: Date.now()
      };
      
      // Use localStorage in browser or file system in Node.js
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.persistenceKey, JSON.stringify(state));
      } else {
        // Node.js file system persistence
        const fs = require('fs');
        const path = require('path');
        const stateFile = path.join(process.cwd(), '.ioredis-adapter-state.json');
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      }
    } catch (error) {
      console.warn('Failed to persist subscription state:', error);
    }
  }
  
  private restoreState(): void {
    try {
      let stateData: string | null = null;
      
      if (typeof localStorage !== 'undefined') {
        stateData = localStorage.getItem(this.persistenceKey);
      } else {
        // Node.js file system restoration
        const fs = require('fs');
        const path = require('path');
        const stateFile = path.join(process.cwd(), '.ioredis-adapter-state.json');
        
        if (fs.existsSync(stateFile)) {
          stateData = fs.readFileSync(stateFile, 'utf8');
        }
      }
      
      if (stateData) {
        const state = JSON.parse(stateData);
        
        // Restore subscriptions
        for (const channel of state.exactChannels) {
          this.stateManager.addExactSubscription(channel);
        }
        
        for (const pattern of state.patterns) {
          this.stateManager.addPatternSubscription(pattern);
        }
      }
    } catch (error) {
      console.warn('Failed to restore subscription state:', error);
    }
  }
}
```

## Performance Optimization

### 1. Subscription Change Optimization

```typescript
class SubscriptionOptimizer {
  private lastKnownState: {
    exactChannels: Set<string>;
    patterns: Set<string>;
  } = {
    exactChannels: new Set(),
    patterns: new Set()
  };
  
  optimizeSubscriptionUpdate(
    newExactChannels: Set<string>,
    newPatterns: Set<string>
  ): boolean {
    // Check if subscription state actually changed
    const exactChannelsChanged = !this.setsEqual(
      this.lastKnownState.exactChannels,
      newExactChannels
    );
    
    const patternsChanged = !this.setsEqual(
      this.lastKnownState.patterns,
      newPatterns
    );
    
    if (!exactChannelsChanged && !patternsChanged) {
      // No change needed
      return false;
    }
    
    // Update last known state
    this.lastKnownState.exactChannels = new Set(newExactChannels);
    this.lastKnownState.patterns = new Set(newPatterns);
    
    return true; // Update needed
  }
  
  private setsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
    if (set1.size !== set2.size) return false;
    
    for (const item of set1) {
      if (!set2.has(item)) return false;
    }
    
    return true;
  }
}
```

### 2. Memory Management

```typescript
class MemoryManager {
  private readonly maxEventListeners: number = 100;
  private readonly maxStateHistory: number = 50;
  
  constructor(private eventEmitter: EventEmitter) {}
  
  manageEventListeners(): void {
    // Monitor event listener count
    const messageListeners = this.eventEmitter.listenerCount('message');
    const pmessageListeners = this.eventEmitter.listenerCount('pmessage');
    
    if (messageListeners > this.maxEventListeners) {
      console.warn(`High number of message listeners: ${messageListeners}`);
    }
    
    if (pmessageListeners > this.maxEventListeners) {
      console.warn(`High number of pmessage listeners: ${pmessageListeners}`);
    }
    
    // Set max listeners to prevent warnings
    this.eventEmitter.setMaxListeners(this.maxEventListeners * 2);
  }
  
  cleanupResources(): void {
    // Remove all listeners when shutting down
    this.eventEmitter.removeAllListeners();
  }
}
```

## Integration with Main Adapter

### Complete Integration Pattern

```typescript
export class PubSubAdapter extends EventEmitter {
  private stateManager: SubscriptionStateManager;
  private connectionManager: ConnectionLifecycleManager;
  private batcher: SubscriptionBatcher;
  private healthMonitor: ConnectionHealthMonitor;
  private shutdownHandler: GracefulShutdownHandler;
  private persistence: SubscriptionStatePersistence;
  private optimizer: SubscriptionOptimizer;
  private memoryManager: MemoryManager;
  
  constructor(options: RedisOptions) {
    super();
    
    // Initialize core components
    this.stateManager = new SubscriptionStateManager();
    this.connectionManager = new ConnectionLifecycleManager(
      options,
      this,
      new MessageRouter(this)
    );
    this.batcher = new SubscriptionBatcher(
      this.stateManager,
      this.connectionManager
    );
    this.healthMonitor = new ConnectionHealthMonitor(
      this.connectionManager,
      this
    );
    this.shutdownHandler = new GracefulShutdownHandler(
      this.connectionManager,
      this.healthMonitor,
      this.batcher
    );
    this.persistence = new SubscriptionStatePersistence(this.stateManager);
    this.optimizer = new SubscriptionOptimizer();
    this.memoryManager = new MemoryManager(this);
    
    // Start monitoring
    this.healthMonitor.startMonitoring();
    this.persistence.enablePersistence();
  }
  
  // ioredis-compatible public interface
  async subscribe(...args: any[]): Promise<number> {
    const { channels, callback } = this.parseSubscribeArgs(args);
    
    return this.batcher.queueOperation({
      type: 'subscribe',
      channels,
      callback,
      timestamp: Date.now(),
      operationId: this.generateOperationId()
    });
  }
  
  // ... other public methods
}
```

## Summary

This design provides:

1. **Robust State Management**: Comprehensive tracking of subscription state with history and persistence
2. **Intelligent Batching**: Debounced operation processing for optimal performance
3. **Resilient Connections**: Health monitoring, automatic reconnection, and graceful degradation
4. **Memory Safety**: Resource cleanup and listener management
5. **Production Ready**: Graceful shutdown, error handling, and monitoring capabilities

The design bridges the gap between ioredis's dynamic subscription model and valkey-glide's configuration-based approach while maintaining full compatibility and performance.