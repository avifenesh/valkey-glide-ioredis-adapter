/**
 * Pub/Sub Commands - Redis publish/subscribe operations
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { EventEmitter } from 'events';
import { RedisValue, RedisOptions } from '../../types';
import { ParameterTranslator } from '../../utils/ParameterTranslator';

export class PubSubCommands extends EventEmitter {
  private subscriberClient: GlideClient | null = null;
  private subscriptions = new Set<string>();
  private patternSubscriptions = new Set<string>();

  constructor(
    private getClient: () => Promise<GlideClient>,
    private options: RedisOptions
  ) {
    super();
  }

  async publish(channel: string, message: RedisValue): Promise<number> {
    const client = await this.getClient();
    const normalizedChannel = ParameterTranslator.normalizeKey(channel);
    const normalizedMessage = ParameterTranslator.normalizeValue(message);
    return await client.publish(normalizedChannel, normalizedMessage);
  }

  async subscribe(...channels: string[]): Promise<number> {
    // Create subscriber client if not exists
    if (!this.subscriberClient) {
      await this.createSubscriberConnection();
    }

    let subscribeCount = 0;
    for (const channel of channels) {
      if (!this.subscriptions.has(channel)) {
        const normalizedChannel = ParameterTranslator.normalizeKey(channel);
        
        // Use customCommand as GLIDE's pub/sub is handled differently
        await this.subscriberClient!.customCommand(['SUBSCRIBE', normalizedChannel]);
        this.subscriptions.add(channel);
        subscribeCount++;
        
        // Emit subscribe event for ioredis compatibility
        this.emit('subscribe', channel, this.subscriptions.size);
      }
    }

    return subscribeCount;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    if (!this.subscriberClient) {
      return 0;
    }

    let unsubscribeCount = 0;
    for (const channel of channels) {
      if (this.subscriptions.has(channel)) {
        const normalizedChannel = ParameterTranslator.normalizeKey(channel);
        
        await this.subscriberClient.customCommand(['UNSUBSCRIBE', normalizedChannel]);
        this.subscriptions.delete(channel);
        unsubscribeCount++;
        
        // Emit unsubscribe event for ioredis compatibility
        this.emit('unsubscribe', channel, this.subscriptions.size);
      }
    }

    return unsubscribeCount;
  }

  async psubscribe(...patterns: string[]): Promise<number> {
    // Create subscriber client if not exists
    if (!this.subscriberClient) {
      await this.createSubscriberConnection();
    }

    let subscribeCount = 0;
    for (const pattern of patterns) {
      if (!this.patternSubscriptions.has(pattern)) {
        const normalizedPattern = ParameterTranslator.normalizeKey(pattern);
        
        await this.subscriberClient!.customCommand(['PSUBSCRIBE', normalizedPattern]);
        this.patternSubscriptions.add(pattern);
        subscribeCount++;
        
        // Emit psubscribe event for ioredis compatibility
        this.emit('psubscribe', pattern, this.patternSubscriptions.size);
      }
    }

    return subscribeCount;
  }

  async punsubscribe(...patterns: string[]): Promise<number> {
    if (!this.subscriberClient) {
      return 0;
    }

    let unsubscribeCount = 0;
    for (const pattern of patterns) {
      if (this.patternSubscriptions.has(pattern)) {
        const normalizedPattern = ParameterTranslator.normalizeKey(pattern);
        
        await this.subscriberClient.customCommand(['PUNSUBSCRIBE', normalizedPattern]);
        this.patternSubscriptions.delete(pattern);
        unsubscribeCount++;
        
        // Emit punsubscribe event for ioredis compatibility
        this.emit('punsubscribe', pattern, this.patternSubscriptions.size);
      }
    }

    return unsubscribeCount;
  }

  private async createSubscriberConnection(): Promise<GlideClient> {
    if (this.subscriberClient) {
      return this.subscriberClient;
    }

    const config: GlideClientConfiguration = {
      addresses: [{ host: this.options.host!, port: this.options.port! }],
      // clientName: 'subscriber', // GLIDE handles client naming internally
      databaseId: this.options.db || 0,
    };

    if (this.options.username || this.options.password) {
      config.credentials = {
        username: this.options.username || 'default',
        password: this.options.password!,
      };
    }

    this.subscriberClient = await GlideClient.createClient(config);
    
    // Set up message handling - this would need to be adapted based on GLIDE's actual pub/sub API
    // For now, we'll use a placeholder approach
    this.setupMessageHandling();
    
    return this.subscriberClient;
  }

  private setupMessageHandling(): void {
    // This is a placeholder - GLIDE's actual pub/sub message handling would be different
    // In a real implementation, you'd need to use GLIDE's callback-based pub/sub system
    // or polling mechanism to receive messages and emit them as ioredis-compatible events
    
    // Example of what the message handling might look like:
    // this.subscriberClient.onMessage((msg) => {
    //   if (msg.pattern) {
    //     this.emit('pmessage', msg.pattern, msg.channel, msg.message);
    //   } else {
    //     this.emit('message', msg.channel, msg.message);
    //   }
    // });
  }

  async closeSubscriber(): Promise<void> {
    if (this.subscriberClient) {
      await this.subscriberClient.close();
      this.subscriberClient = null;
      this.subscriptions.clear();
      this.patternSubscriptions.clear();
    }
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  getPatternSubscriptions(): string[] {
    return Array.from(this.patternSubscriptions);
  }
}
