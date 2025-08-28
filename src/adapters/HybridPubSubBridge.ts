/**
 * HybridPubSubBridge - Native Redis Pub/Sub Implementation
 * 
 * This bridge uses native ioredis for pub/sub functionality while allowing
 * GLIDE to handle all other Redis commands. This hybrid approach ensures
 * 100% Bull/BullMQ compatibility while achieving our customCommand reduction goals.
 * 
 * Architecture Decision: After extensive testing, we discovered that GLIDE's
 * pub/sub implementation is not functional (messages are never delivered).
 * This hybrid approach provides the best of both worlds.
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { RedisOptions } from '../types';

export class HybridPubSubBridge extends EventEmitter {
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private subscribedChannels = new Set<string>();
  private subscribedPatterns = new Set<string>();
  private isInSubscriberMode = false;
  
  constructor(private options: RedisOptions) {
    super();
  }
  
  /**
   * Initialize the pub/sub bridge with native Redis clients
   */
  private async ensureClients(): Promise<void> {
    if (!this.subscriber) {
      // Create dedicated subscriber client
      const subscriberConfig: any = {
        host: this.options.host || 'localhost',
        port: this.options.port || 6379,
        db: this.options.db || 0,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
      };
      
      if (this.options.password) {
        subscriberConfig.password = this.options.password;
      }
      
      this.subscriber = new Redis(subscriberConfig);
      
      // Set up event forwarding
      this.subscriber.on('message', (channel, message) => {
        this.emit('message', channel, message);
      });
      
      this.subscriber.on('pmessage', (pattern, channel, message) => {
        this.emit('pmessage', pattern, channel, message);
      });
      
      this.subscriber.on('subscribe', (channel, count) => {
        this.emit('subscribe', channel, count);
      });
      
      this.subscriber.on('psubscribe', (pattern, count) => {
        this.emit('psubscribe', pattern, count);
      });
      
      this.subscriber.on('unsubscribe', (channel, count) => {
        this.emit('unsubscribe', channel, count);
      });
      
      this.subscriber.on('punsubscribe', (pattern, count) => {
        this.emit('punsubscribe', pattern, count);
      });
      
      await this.subscriber.connect();
    }
    
    if (!this.publisher) {
      // Create dedicated publisher client
      const publisherConfig: any = {
        host: this.options.host || 'localhost',
        port: this.options.port || 6379,
        db: this.options.db || 0,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
      };
      
      if (this.options.password) {
        publisherConfig.password = this.options.password;
      }
      
      this.publisher = new Redis(publisherConfig);
      
      await this.publisher.connect();
    }
  }
  
  /**
   * Subscribe to channels - 100% ioredis compatible
   */
  async subscribe(...channels: string[]): Promise<number> {
    await this.ensureClients();
    
    for (const channel of channels) {
      if (!this.subscribedChannels.has(channel)) {
        await this.subscriber!.subscribe(channel);
        this.subscribedChannels.add(channel);
      }
    }
    
    this.isInSubscriberMode = true;
    return this.subscribedChannels.size;
  }
  
  /**
   * Unsubscribe from channels
   */
  async unsubscribe(...channels: string[]): Promise<number> {
    if (!this.subscriber || !this.isInSubscriberMode) {
      return 0;
    }
    
    if (channels.length === 0) {
      // Unsubscribe from all channels
      const allChannels = Array.from(this.subscribedChannels);
      if (allChannels.length > 0) {
        await this.subscriber.unsubscribe(...allChannels);
        this.subscribedChannels.clear();
      }
    } else {
      // Unsubscribe from specific channels
      const channelsToUnsubscribe = channels.filter(ch => this.subscribedChannels.has(ch));
      if (channelsToUnsubscribe.length > 0) {
        await this.subscriber.unsubscribe(...channelsToUnsubscribe);
        channelsToUnsubscribe.forEach(ch => this.subscribedChannels.delete(ch));
      }
    }
    
    // Exit subscriber mode if no more subscriptions
    if (this.subscribedChannels.size === 0 && this.subscribedPatterns.size === 0) {
      this.isInSubscriberMode = false;
    }
    
    return this.subscribedChannels.size;
  }
  
  /**
   * Subscribe to patterns
   */
  async psubscribe(...patterns: string[]): Promise<number> {
    await this.ensureClients();
    
    for (const pattern of patterns) {
      if (!this.subscribedPatterns.has(pattern)) {
        await this.subscriber!.psubscribe(pattern);
        this.subscribedPatterns.add(pattern);
      }
    }
    
    this.isInSubscriberMode = true;
    return this.subscribedPatterns.size;
  }
  
  /**
   * Unsubscribe from patterns
   */
  async punsubscribe(...patterns: string[]): Promise<number> {
    if (!this.subscriber || !this.isInSubscriberMode) {
      return 0;
    }
    
    if (patterns.length === 0) {
      // Unsubscribe from all patterns
      const allPatterns = Array.from(this.subscribedPatterns);
      if (allPatterns.length > 0) {
        await this.subscriber.punsubscribe(...allPatterns);
        this.subscribedPatterns.clear();
      }
    } else {
      // Unsubscribe from specific patterns
      const patternsToUnsubscribe = patterns.filter(p => this.subscribedPatterns.has(p));
      if (patternsToUnsubscribe.length > 0) {
        await this.subscriber.punsubscribe(...patternsToUnsubscribe);
        patternsToUnsubscribe.forEach(p => this.subscribedPatterns.delete(p));
      }
    }
    
    // Exit subscriber mode if no more subscriptions
    if (this.subscribedChannels.size === 0 && this.subscribedPatterns.size === 0) {
      this.isInSubscriberMode = false;
    }
    
    return this.subscribedPatterns.size;
  }
  
  /**
   * Publish messages - uses dedicated publisher client
   */
  async publish(channel: string, message: string): Promise<number> {
    await this.ensureClients();
    return await this.publisher!.publish(channel, message);
  }
  
  /**
   * Get subscription status for debugging
   */
  getStatus() {
    return {
      subscribedChannels: Array.from(this.subscribedChannels),
      subscribedPatterns: Array.from(this.subscribedPatterns),
      isInSubscriberMode: this.isInSubscriberMode,
      hasSubscriber: !!this.subscriber,
      hasPublisher: !!this.publisher,
    };
  }
  
  /**
   * Clean up all connections
   */
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];
    
    if (this.subscriber) {
      cleanupPromises.push(Promise.resolve(this.subscriber.disconnect()));
      this.subscriber = null;
    }
    
    if (this.publisher) {
      cleanupPromises.push(Promise.resolve(this.publisher.disconnect()));
      this.publisher = null;
    }
    
    await Promise.all(cleanupPromises);
    
    this.subscribedChannels.clear();
    this.subscribedPatterns.clear();
    this.isInSubscriberMode = false;
  }
}
