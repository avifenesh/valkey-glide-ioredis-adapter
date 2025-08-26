import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { EventEmitter } from 'events';

// Define PubSubMsg interface to match valkey-glide's internal structure
export interface PubSubMsg {
  message: string;
  channel: string;
  pattern?: string | null;
}

export interface RedisOptions {
  host?: string;
  port?: number;
  family?: number;
  keepAlive?: boolean;
  connectionName?: string;
  username?: string;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number | null;
  lazyConnect?: boolean;
  keyPrefix?: string;
  retryDelayOnClusterDown?: number;
  retryDelayOnFail?: number;
  enableReadyCheck?: boolean;
  autoResubscribe?: boolean;
  autoResendUnfulfilledCommands?: boolean;
  enableOfflineQueue?: boolean;
}

interface SubscriptionOperation {
  type: 'subscribe' | 'unsubscribe' | 'psubscribe' | 'punsubscribe';
  channels: string[];
  callback?: ((err: Error | null, count?: number) => void) | undefined;
  timestamp: number;
  operationId: string;
}

interface SubscriptionEvent {
  type: 'subscribe' | 'unsubscribe' | 'psubscribe' | 'punsubscribe';
  channel?: string;
  pattern?: string;
  count: number;
}

interface SubscriptionMetadata {
  subscribedAt: number;
  subscriptionOrder: number;
  isActive: boolean;
}

interface SubscriptionState {
  exactChannels: Map<string, SubscriptionMetadata>;
  patterns: Map<string, SubscriptionMetadata>;
  totalCount: number;
  isInSubscriberMode: boolean;
  lastUpdateTimestamp: number;
}

enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error'
}

/**
 * Message router to handle valkey-glide messages and emit ioredis-compatible events
 */
class MessageRouter {
  constructor(private emitter: EventEmitter) {}

  handleMessage(msg: PubSubMsg, context?: any): void {
    try {
      if (msg.pattern) {
        // Pattern subscription message
        this.emitter.emit('pmessage', msg.pattern, msg.channel, msg.message);
        
        // Also emit buffer version if requested
        if (this.emitter.listenerCount('pmessageBuffer') > 0) {
          const pattern = Buffer.from(msg.pattern);
          const channel = Buffer.from(msg.channel);
          const message = Buffer.from(msg.message);
          this.emitter.emit('pmessageBuffer', pattern, channel, message);
        }
      } else {
        // Exact channel subscription message
        this.emitter.emit('message', msg.channel, msg.message);
        
        // Also emit buffer version if requested
        if (this.emitter.listenerCount('messageBuffer') > 0) {
          const channel = Buffer.from(msg.channel);
          const message = Buffer.from(msg.message);
          this.emitter.emit('messageBuffer', channel, message);
        }
      }
    } catch (error) {
      this.emitter.emit('error', error);
    }
  }
}

/**
 * Manages subscription state and provides ioredis-compatible tracking
 */
class SubscriptionStateManager extends EventEmitter {
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
      this.emit('modeChanged', this.state.isInSubscriberMode);
    }
  }

  private recordStateChange(): void {
    this.state.lastUpdateTimestamp = Date.now();

    // Keep history for debugging and rollback scenarios
    this.stateHistory.push(this.cloneState());
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    this.emit('stateChanged', this.state);
  }

  private cloneState(): SubscriptionState {
    return {
      exactChannels: new Map(this.state.exactChannels),
      patterns: new Map(this.state.patterns),
      totalCount: this.state.totalCount,
      isInSubscriberMode: this.state.isInSubscriberMode,
      lastUpdateTimestamp: this.state.lastUpdateTimestamp
    };
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

/**
 * Manages valkey-glide client lifecycle and recreates clients when subscriptions change
 */
class ConnectionLifecycleManager {
  private currentClient: GlideClient | null = null;
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 50;
  private reconnectDelay: number = 1000;
  private stateManager: SubscriptionStateManager | null = null;

  constructor(
    private clientConfig: {
      addresses: { host: string; port: number }[];
      credentials?: { username?: string; password?: string };
      clientName?: string;
      requestTimeout?: number;
    },
    private eventEmitter: EventEmitter,
    private messageRouter: MessageRouter
  ) {}

  setStateManager(stateManager: SubscriptionStateManager): void {
    this.stateManager = stateManager;
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
      const glideConfig = {
        addresses: this.clientConfig.addresses,
        ...(this.clientConfig.credentials ? { credentials: this.clientConfig.credentials } : {}),
        ...(this.clientConfig.clientName ? { clientName: this.clientConfig.clientName } : {}),
        ...(this.clientConfig.requestTimeout ? { requestTimeout: this.clientConfig.requestTimeout } : {}),
        pubsubSubscriptions: {
          channelsAndPatterns: {
            [GlideClientConfiguration.PubSubChannelModes.Exact]: exactChannels,
            [GlideClientConfiguration.PubSubChannelModes.Pattern]: patterns
          },
          callback: this.messageRouter.handleMessage.bind(this.messageRouter),
          context: { manager: this }
        }
      };

      // Create new client
      this.connectionState = ConnectionState.Connecting;
      this.eventEmitter.emit('reconnecting');

      this.currentClient = await GlideClient.createClient(glideConfig as any);

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

    // Handle client errors - valkey-glide may not support event emitters
    // Connection monitoring will be handled through health checks instead
    // Note: valkey-glide uses different error handling mechanisms
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
           (this.stateManager?.hasSubscriptions() ?? false);
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
      if (this.stateManager) {
        await this.updateSubscriptions(
          this.stateManager.getExactChannels(),
          this.stateManager.getPatterns()
        );
      }
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

/**
 * Batches subscription operations for performance optimization
 */
class SubscriptionBatcher {
  private pendingOperations: SubscriptionOperation[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private batchDelay: number = 10; // 10ms debounce
  private isProcessing: boolean = false;
  private operationCounter: number = 0;

  constructor(
    private stateManager: SubscriptionStateManager,
    private connectionManager: ConnectionLifecycleManager,
    private eventEmitter: EventEmitter
  ) {}

  queueOperation(operation: Omit<SubscriptionOperation, 'operationId' | 'timestamp'>): Promise<number> {
    return new Promise((resolve, reject) => {
      // Add to pending operations
      this.pendingOperations.push({
        ...operation,
        timestamp: Date.now(),
        operationId: `op_${++this.operationCounter}`,
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
    let operations: SubscriptionOperation[] = [];

    try {
      // Extract current batch
      operations = this.pendingOperations.splice(0);

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
      this.handleBatchError(error, operations);
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
          if (lastEvent) {
            operation.callback(null, lastEvent.count);
          }
        } else {
          // No change occurred (already subscribed/not subscribed)
          operation.callback(null, finalCount);
        }
      }
    }
  }

  private handleBatchError(error: any, operations: SubscriptionOperation[]): void {
    // Execute all callbacks with error
    for (const operation of operations) {
      if (operation.callback) {
        operation.callback(error);
      }
    }

    // Emit error event
    this.eventEmitter.emit('error', error);
  }

  async waitForPendingOperations(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pendingOperations.length === 0 && !this.isProcessing) {
        resolve();
        return;
      }

      const checkPending = () => {
        if (this.pendingOperations.length === 0 && !this.isProcessing) {
          resolve();
        } else {
          setTimeout(checkPending, 10);
        }
      };

      checkPending();
    });
  }
}

/**
 * Connection state manager to enforce ioredis subscriber mode restrictions
 */
class ConnectionStateManager {
  private isInSubscriberMode: boolean = false;
  private blockedCommands: Set<string> = new Set([
    'get', 'set', 'mget', 'mset', 'hget', 'hset', 'lpush', 'rpush',
    'sadd', 'smembers', 'zadd', 'zrange', 'incr', 'decr', 'del',
    'exists', 'expire', 'ttl', 'keys', 'scan', 'flushdb', 'flushall'
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

  isSubscriberMode(): boolean {
    return this.isInSubscriberMode;
  }
}

/**
 * Main PubSubAdapter that provides ioredis-compatible pub/sub interface
 */
export class PubSubAdapter extends EventEmitter {
  private stateManager: SubscriptionStateManager;
  private connectionManager: ConnectionLifecycleManager;
  private batcher: SubscriptionBatcher;
  private stateManager_: ConnectionStateManager;
  private messageRouter: MessageRouter;
  private publisherClient: GlideClient | null = null;
  private publisherConfig: {
    addresses: { host: string; port: number }[];
    credentials?: { username: string; password: string };
    clientName?: string;
    requestTimeout: number;
  };

  constructor(options: RedisOptions = {}) {
    super();

    // Initialize core components
    this.messageRouter = new MessageRouter(this);
    this.stateManager = new SubscriptionStateManager();
    
    // Configure client addresses
    const addresses = [{
      host: options.host || 'localhost',
      port: options.port || 6379
    }];

    const clientConfig: {
      addresses: { host: string; port: number }[];
      credentials?: { username: string; password: string };
      clientName?: string;
      requestTimeout: number;
    } = {
      addresses,
      requestTimeout: options.maxRetriesPerRequest || 5000
    };

    if (options.username && options.password) {
      clientConfig.credentials = {
        username: options.username,
        password: options.password
      };
    }
    
    // Store publisher config for separate client
    this.publisherConfig = { ...clientConfig };

    this.connectionManager = new ConnectionLifecycleManager(
      clientConfig,
      this,
      this.messageRouter
    );

    this.connectionManager.setStateManager(this.stateManager);

    this.batcher = new SubscriptionBatcher(
      this.stateManager,
      this.connectionManager,
      this
    );

    this.stateManager_ = new ConnectionStateManager();

    // Listen to state changes to update connection mode
    this.stateManager.on('stateChanged', (state: SubscriptionState) => {
      this.stateManager_.updateMode(state.totalCount);
    });

    // Set max listeners to prevent warnings
    this.setMaxListeners(100);
  }

  // ioredis-compatible public interface
  async subscribe(...args: any[]): Promise<number> {
    const { channels, callback } = this.parseSubscribeArgs(args);

    if (channels.length === 0) {
      const error = new Error('SUBSCRIBE requires at least one channel');
      if (callback) callback(error);
      throw error;
    }

    return this.batcher.queueOperation({
      type: 'subscribe',
      channels,
      ...(callback ? { callback } : {})
    });
  }

  async unsubscribe(...args: any[]): Promise<number> {
    const { channels, callback } = this.parseUnsubscribeArgs(args);

    return this.batcher.queueOperation({
      type: 'unsubscribe',
      channels, // Empty array means unsubscribe from all
      ...(callback ? { callback } : {})
    });
  }

  async psubscribe(...args: any[]): Promise<number> {
    const { channels: patterns, callback } = this.parseSubscribeArgs(args);

    if (patterns.length === 0) {
      const error = new Error('PSUBSCRIBE requires at least one pattern');
      if (callback) callback(error);
      throw error;
    }

    return this.batcher.queueOperation({
      type: 'psubscribe',
      channels: patterns,
      ...(callback ? { callback } : {})
    });
  }

  async punsubscribe(...args: any[]): Promise<number> {
    const { channels: patterns, callback } = this.parseUnsubscribeArgs(args);

    return this.batcher.queueOperation({
      type: 'punsubscribe',
      channels: patterns, // Empty array means unsubscribe from all patterns
      ...(callback ? { callback } : {})
    });
  }

  // PUBLISH command implementation
  async publish(channel: string, message: string): Promise<number> {
    if (typeof channel !== 'string' || typeof message !== 'string') {
      throw new Error('PUBLISH requires channel and message as strings');
    }

    // Ensure we have a publisher client
    await this.ensurePublisherClient();

    if (!this.publisherClient) {
      throw new Error('Publisher client not available');
    }

    try {
      // Use valkey-glide's publish command
      const result = await this.publisherClient.publish(channel, message);
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  // Ensure publisher client is available for PUBLISH operations
  private async ensurePublisherClient(): Promise<void> {
    if (this.publisherClient) {
      return; // Already have a client
    }

    try {
      // Create a regular client (no pub/sub subscriptions) for publishing
      const config = {
        addresses: this.publisherConfig.addresses,
        ...(this.publisherConfig.credentials ? { credentials: this.publisherConfig.credentials } : {}),
        ...(this.publisherConfig.clientName ? { clientName: `${this.publisherConfig.clientName}-publisher` } : {}),
        ...(this.publisherConfig.requestTimeout ? { requestTimeout: this.publisherConfig.requestTimeout } : {})
      };

      this.publisherClient = await GlideClient.createClient(config as any);

      // Handle publisher client errors if event emitter is supported
      if (typeof this.publisherClient.on === 'function') {
        this.publisherClient.on('error', (error: any) => {
          this.emit('error', error);
          this.publisherClient = null; // Reset client on error
        });

        this.publisherClient.on('close', () => {
          this.publisherClient = null; // Reset client on close
        });
      }
    } catch (error) {
      this.publisherClient = null;
      throw error;
    }
  }

  // Utility methods to prevent regular commands in subscriber mode
  checkSubscriberMode(): void {
    if (this.stateManager_.isSubscriberMode()) {
      throw new Error(
        'ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context'
      );
    }
  }

  // Connection information
  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  getSubscriptionCount(): number {
    return this.stateManager.getTotalCount();
  }

  getSubscribedChannels(): string[] {
    return Array.from(this.stateManager.getExactChannels());
  }

  getSubscribedPatterns(): string[] {
    return Array.from(this.stateManager.getPatterns());
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.batcher.waitForPendingOperations();
    
    // Close publisher client
    if (this.publisherClient) {
      try {
        await this.publisherClient.close();
      } catch (error) {
        console.warn('Error closing publisher client:', error);
      } finally {
        this.publisherClient = null;
      }
    }
    
    // Connection manager will handle cleanup when no subscriptions remain
    await this.connectionManager.updateSubscriptions(new Set(), new Set());
  }

  // Argument parsing utilities
  private parseSubscribeArgs(args: any[]): { channels: string[]; callback?: (err: Error | null, count?: number) => void } {
    const channels: string[] = [];
    let callback: ((err: Error | null, count?: number) => void) | undefined;

    for (const arg of args) {
      if (typeof arg === 'string') {
        channels.push(arg);
      } else if (typeof arg === 'function') {
        callback = arg as (err: Error | null, count?: number) => void;
      }
    }

    return {
      channels,
      ...(callback ? { callback } : {})
    };
  }

  private parseUnsubscribeArgs(args: any[]): { channels: string[]; callback?: (err: Error | null, count?: number) => void } {
    // Same as parseSubscribeArgs but handles empty channels for "unsubscribe all"
    const result = this.parseSubscribeArgs(args);
    return result;
  }
}

// Export the main adapter class
export default PubSubAdapter;
