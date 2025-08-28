/**
 * Custom GLIDE Pub/Sub Manager
 * 
 * This implementation works around GLIDE's execution context sensitivity by using
 * a different architectural approach - instead of trying to encapsulate the polling,
 * we use a worker-based pattern with message queues.
 */

import { EventEmitter } from 'events';
import { 
  GlideClient, 
  GlideClientConfiguration, 
  PubSubMsg, 
  ProtocolVersion,
  ClosingError 
} from '@valkey/valkey-glide';
import { RedisOptions } from '../types';

interface PubSubWorker {
  client: GlideClient;
  channels: Set<string>;
  patterns: Set<string>;
  messageQueue: PubSubMsg[];
  active: boolean;
}

export class GlidePubSubManager extends EventEmitter {
  private baseConfig: GlideClientConfiguration;
  private publishClient: GlideClient | null = null;
  private workers = new Map<string, PubSubWorker>();
  private subscribedChannels = new Set<string>();
  private subscribedPatterns = new Set<string>();
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(options: RedisOptions) {
    super();

    this.baseConfig = {
      addresses: [{ host: options.host || 'localhost', port: options.port || 6379 }],
      protocol: ProtocolVersion.RESP3,
    };

    // Start message processing
    this.startMessageProcessing();
  }

  /**
   * Subscribe to channels
   */
  async subscribe(...channels: string[]): Promise<number> {
    for (const channel of channels) {
      if (!this.subscribedChannels.has(channel)) {
        this.subscribedChannels.add(channel);
        await this.createWorkerForChannel(channel);
        this.emit('subscribe', channel, this.subscribedChannels.size);
      }
    }
    return this.subscribedChannels.size;
  }

  /**
   * Unsubscribe from channels
   */
  async unsubscribe(...channels: string[]): Promise<number> {
    if (channels.length === 0) {
      // Unsubscribe from all channels
      const channels = Array.from(this.subscribedChannels);
      for (const channel of channels) {
        await this.removeWorkerForChannel(channel);
        this.emit('unsubscribe', channel, 0);
      }
      this.subscribedChannels.clear();
    } else {
      for (const channel of channels) {
        if (this.subscribedChannels.has(channel)) {
          this.subscribedChannels.delete(channel);
          await this.removeWorkerForChannel(channel);
          this.emit('unsubscribe', channel, this.subscribedChannels.size);
        }
      }
    }
    return this.subscribedChannels.size;
  }

  /**
   * Subscribe to patterns
   */
  async psubscribe(...patterns: string[]): Promise<number> {
    for (const pattern of patterns) {
      if (!this.subscribedPatterns.has(pattern)) {
        this.subscribedPatterns.add(pattern);
        await this.createWorkerForPattern(pattern);
        this.emit('psubscribe', pattern, this.subscribedPatterns.size);
      }
    }
    return this.subscribedPatterns.size;
  }

  /**
   * Unsubscribe from patterns
   */
  async punsubscribe(...patterns: string[]): Promise<number> {
    if (patterns.length === 0) {
      // Unsubscribe from all patterns
      const patterns = Array.from(this.subscribedPatterns);
      for (const pattern of patterns) {
        await this.removeWorkerForPattern(pattern);
        this.emit('punsubscribe', pattern, 0);
      }
      this.subscribedPatterns.clear();
    } else {
      for (const pattern of patterns) {
        if (this.subscribedPatterns.has(pattern)) {
          this.subscribedPatterns.delete(pattern);
          await this.removeWorkerForPattern(pattern);
          this.emit('punsubscribe', pattern, this.subscribedPatterns.size);
        }
      }
    }
    return this.subscribedPatterns.size;
  }

  /**
   * Publish a message
   */
  async publish(channel: string, message: string): Promise<number> {
    await this.ensurePublishClient();
    return await this.publishClient!.publish(message, channel); // GLIDE order: message, channel
  }

  /**
   * Create a dedicated worker for a channel
   * 
   * CRITICAL: This uses a different approach - instead of encapsulating the polling
   * in a class method, we create individual workers that run independently
   */
  private async createWorkerForChannel(channel: string): Promise<void> {
    const workerId = `channel:${channel}`;
    
    if (this.workers.has(workerId)) {
      return; // Worker already exists
    }

    try {
      // Create a dedicated GLIDE client for this channel
      const client = await GlideClient.createClient({
        ...this.baseConfig,
        pubsubSubscriptions: {
          channelsAndPatterns: {
            [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set([channel])
          }
        }
      });

      const worker: PubSubWorker = {
        client,
        channels: new Set([channel]),
        patterns: new Set(),
        messageQueue: [],
        active: true
      };

      this.workers.set(workerId, worker);

      // Start the worker's message collection
      this.startWorkerMessageCollection(workerId, worker);

    } catch (error) {
      console.error(`Failed to create worker for channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Create a dedicated worker for a pattern
   */
  private async createWorkerForPattern(pattern: string): Promise<void> {
    const workerId = `pattern:${pattern}`;
    
    if (this.workers.has(workerId)) {
      return; // Worker already exists
    }

    try {
      // Create a dedicated GLIDE client for this pattern
      const client = await GlideClient.createClient({
        ...this.baseConfig,
        pubsubSubscriptions: {
          channelsAndPatterns: {
            [GlideClientConfiguration.PubSubChannelModes.Pattern]: new Set([pattern])
          }
        }
      });

      const worker: PubSubWorker = {
        client,
        channels: new Set(),
        patterns: new Set([pattern]),
        messageQueue: [],
        active: true
      };

      this.workers.set(workerId, worker);

      // Start the worker's message collection
      this.startWorkerMessageCollection(workerId, worker);

    } catch (error) {
      console.error(`Failed to create worker for pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Start message collection for a worker
   * 
   * CRITICAL: This runs the polling in a separate async context to avoid
   * the encapsulation issue. Each worker polls independently.
   */
  private startWorkerMessageCollection(workerId: string, worker: PubSubWorker): void {
    // Use setImmediate to run in a separate execution context
    setImmediate(async () => {
      try {
        // Use the direct polling pattern that works
        while (worker.active && worker.client) {
          try {
            const message: PubSubMsg | null = await Promise.race([
              worker.client.getPubSubMessage(),
              new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
            ]);

            if (message) {
              // Add message to worker's queue for processing
              worker.messageQueue.push(message);
            }

            // Small delay to prevent tight loop
            await new Promise(resolve => setTimeout(resolve, 10));

          } catch (error) {
            if (error instanceof ClosingError) {
              break;
            }
            console.error(`Worker ${workerId} polling error:`, error);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        console.error(`Worker ${workerId} collection error:`, error);
      }
    });
  }

  /**
   * Start message processing from all workers
   */
  private startMessageProcessing(): void {
    this.processingInterval = setInterval(() => {
      const workers = Array.from(this.workers.values());
      for (const worker of workers) {
        // Process messages from worker's queue
        while (worker.messageQueue.length > 0) {
          const message = worker.messageQueue.shift()!;
          this.processMessage(message);
        }
      }
    }, 5); // Process every 5ms for low latency
  }

  /**
   * Process a message and emit appropriate events
   */
  private processMessage(message: PubSubMsg): void {
    const channel = String(message.channel);
    const messageContent = String(message.message);

    if (message.pattern) {
      // Pattern message
      const pattern = String(message.pattern);
      this.emit('pmessage', pattern, channel, messageContent);
    } else {
      // Regular message
      this.emit('message', channel, messageContent);
    }
  }

  /**
   * Remove worker for a channel
   */
  private async removeWorkerForChannel(channel: string): Promise<void> {
    const workerId = `channel:${channel}`;
    const worker = this.workers.get(workerId);
    
    if (worker) {
      worker.active = false;
      worker.client.close();
      this.workers.delete(workerId);
    }
  }

  /**
   * Remove worker for a pattern
   */
  private async removeWorkerForPattern(pattern: string): Promise<void> {
    const workerId = `pattern:${pattern}`;
    const worker = this.workers.get(workerId);
    
    if (worker) {
      worker.active = false;
      worker.client.close();
      this.workers.delete(workerId);
    }
  }

  /**
   * Ensure publish client exists
   */
  private async ensurePublishClient(): Promise<void> {
    if (!this.publishClient) {
      this.publishClient = await GlideClient.createClient(this.baseConfig);
    }
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    return {
      subscribedChannels: Array.from(this.subscribedChannels),
      subscribedPatterns: Array.from(this.subscribedPatterns),
      activeWorkers: this.workers.size,
      hasPublishClient: !!this.publishClient,
      workers: Array.from(this.workers.keys())
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    // Stop message processing
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Stop all workers
    const workers = Array.from(this.workers.values());
    for (const worker of workers) {
      worker.active = false;
      worker.client.close();
    }
    this.workers.clear();

    // Close publish client
    if (this.publishClient) {
      this.publishClient.close();
      this.publishClient = null;
    }

    // Clear subscriptions
    this.subscribedChannels.clear();
    this.subscribedPatterns.clear();
  }
}
