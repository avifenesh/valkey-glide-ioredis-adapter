/**
 * GLIDE Pub/Sub Bridge
 * 
 * Implements ioredis-compatible pub/sub functionality using GLIDE's native pub/sub
 * with the correct polling pattern (getPubSubMessage()).
 * 
 * Based on the working valkey-pubsub implementation and our successful polling tests.
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

export class GlidePubSubBridge extends EventEmitter {
  private baseConfig: GlideClientConfiguration;
  private subscribeClient: GlideClient | null = null;
  private publishClient: GlideClient | null = null;
  private subscribedChannels = new Set<string>();
  private subscribedPatterns = new Set<string>();
  private pollingActive = false;
  private pollingPromise: Promise<void> | null = null;

  constructor(options: RedisOptions) {
    super();
    
    this.baseConfig = {
      addresses: [{ host: options.host || 'localhost', port: options.port || 6379 }],
      protocol: ProtocolVersion.RESP3,
      // Additional config options can be added here
    };
  }

  /**
   * Subscribe to channels using GLIDE's native pub/sub
   */
  async subscribe(...channels: string[]): Promise<number> {
    // Add new channels to our subscription set
    const newChannels = channels.filter(channel => !this.subscribedChannels.has(channel));
    newChannels.forEach(channel => this.subscribedChannels.add(channel));

    // If we have new channels, recreate the subscription client
    if (newChannels.length > 0) {
      await this.updateSubscriptionClient();
    }

    // Emit subscription events for ioredis compatibility
    for (const channel of channels) {
      this.emit('subscribe', channel, this.subscribedChannels.size);
    }

    return this.subscribedChannels.size;
  }

  /**
   * Subscribe to patterns using GLIDE's native pub/sub
   */
  async psubscribe(...patterns: string[]): Promise<number> {
    // Add new patterns to our subscription set
    const newPatterns = patterns.filter(pattern => !this.subscribedPatterns.has(pattern));
    newPatterns.forEach(pattern => this.subscribedPatterns.add(pattern));

    // If we have new patterns, recreate the subscription client
    if (newPatterns.length > 0) {
      await this.updateSubscriptionClient();
    }

    // Emit subscription events for ioredis compatibility
    for (const pattern of patterns) {
      this.emit('psubscribe', pattern, this.subscribedPatterns.size);
    }

    return this.subscribedPatterns.size;
  }

  /**
   * Unsubscribe from channels
   */
  async unsubscribe(...channels: string[]): Promise<number> {
    if (channels.length === 0) {
      // Unsubscribe from all channels
      this.subscribedChannels.clear();
    } else {
      // Unsubscribe from specific channels
      channels.forEach(channel => this.subscribedChannels.delete(channel));
    }

    // Recreate subscription client with updated channels
    await this.updateSubscriptionClient();

    // Emit unsubscription events for ioredis compatibility
    for (const channel of channels) {
      this.emit('unsubscribe', channel, this.subscribedChannels.size);
    }

    return this.subscribedChannels.size;
  }

  /**
   * Unsubscribe from patterns
   */
  async punsubscribe(...patterns: string[]): Promise<number> {
    if (patterns.length === 0) {
      // Unsubscribe from all patterns
      this.subscribedPatterns.clear();
    } else {
      // Unsubscribe from specific patterns
      patterns.forEach(pattern => this.subscribedPatterns.delete(pattern));
    }

    // Recreate subscription client with updated patterns
    await this.updateSubscriptionClient();

    // Emit unsubscription events for ioredis compatibility
    for (const pattern of patterns) {
      this.emit('punsubscribe', pattern, this.subscribedPatterns.size);
    }

    return this.subscribedPatterns.size;
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: string): Promise<number> {
    await this.ensurePublishClient();
    return await this.publishClient!.publish(message, channel);
  }

  /**
   * Update the subscription client with current channels and patterns
   */
  private async updateSubscriptionClient(): Promise<void> {
    // Stop current polling
    await this.stopPolling();

    // Close existing subscription client
    if (this.subscribeClient) {
      this.subscribeClient.close();
      this.subscribeClient = null;
    }

    // If we have subscriptions, create a new client
    if (this.subscribedChannels.size > 0 || this.subscribedPatterns.size > 0) {
      // Create subscription config without spreading baseConfig to avoid issues
      const subscriptionConfig: GlideClientConfiguration = {
        addresses: this.baseConfig.addresses,
        protocol: this.baseConfig.protocol || ProtocolVersion.RESP3,
        pubsubSubscriptions: {
          channelsAndPatterns: {}
        }
      };
      
      console.log('🔧 DEBUG: Base config:', this.baseConfig);
      console.log('🔧 DEBUG: Initial subscription config:', subscriptionConfig);

      // Add exact channels - ensure we create a proper Set
      if (this.subscribedChannels.size > 0) {
        const exactChannels = new Set(Array.from(this.subscribedChannels));
        console.log('🔧 DEBUG: Creating exact channels Set:', exactChannels, 'from:', Array.from(this.subscribedChannels));
        subscriptionConfig.pubsubSubscriptions!.channelsAndPatterns![
          GlideClientConfiguration.PubSubChannelModes.Exact
        ] = exactChannels;
      }

      // Add pattern channels - ensure we create a proper Set  
      if (this.subscribedPatterns.size > 0) {
        const patternChannels = new Set(Array.from(this.subscribedPatterns));
        console.log('🔧 DEBUG: Creating pattern channels Set:', patternChannels, 'from:', Array.from(this.subscribedPatterns));
        subscriptionConfig.pubsubSubscriptions!.channelsAndPatterns![
          GlideClientConfiguration.PubSubChannelModes.Pattern
        ] = patternChannels;
      }

      // Create new subscription client
      console.log('🔧 DEBUG: Creating new subscription client with config:', {
        exactChannels: Array.from(this.subscribedChannels),
        patternChannels: Array.from(this.subscribedPatterns),
        fullConfig: JSON.stringify(subscriptionConfig, null, 2)
      });
      
      // Debug the actual object structure before passing to GLIDE
      console.log('🔧 DEBUG: Actual channelsAndPatterns object:', subscriptionConfig.pubsubSubscriptions?.channelsAndPatterns);
      console.log('🔧 DEBUG: Exact channels Set before client creation:', subscriptionConfig.pubsubSubscriptions?.channelsAndPatterns?.[GlideClientConfiguration.PubSubChannelModes.Exact]);
      
      this.subscribeClient = await GlideClient.createClient(subscriptionConfig);
      
      console.log('🔧 DEBUG: Subscription client created, waiting for subscriptions to be established...');
      
      // Wait for subscriptions to be established
      // This is crucial - GLIDE needs time to establish the subscriptions
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('🔧 DEBUG: Starting polling after subscription establishment wait');

      // Start polling for messages
      await this.startPolling();
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
   * Start polling for messages using getPubSubMessage()
   */
  private async startPolling(): Promise<void> {
    if (this.pollingActive || !this.subscribeClient) {
      console.log('🔄 DEBUG: startPolling - already active or no client', { 
        pollingActive: this.pollingActive, 
        hasClient: !!this.subscribeClient 
      });
      return;
    }

    console.log('🔄 DEBUG: Starting polling...');
    this.pollingActive = true;
    this.pollingPromise = this.pollForMessages();
    console.log('🔄 DEBUG: Polling promise created');
  }

  /**
   * Stop polling for messages
   */
  private async stopPolling(): Promise<void> {
    this.pollingActive = false;
    if (this.pollingPromise) {
      // Give the polling loop a moment to exit gracefully
      try {
        await Promise.race([
          this.pollingPromise,
          new Promise(resolve => setTimeout(resolve, 1000)) // 1 second timeout
        ]);
      } catch (error) {
        // Ignore errors during shutdown
      }
      this.pollingPromise = null;
    }
  }

  /**
   * Main polling loop - based on valkey-pubsub implementation
   */
  private async pollForMessages(): Promise<void> {
    let retryCount = 0;
    const maxRetries = 3;
    let pollCount = 0;

    console.log('🔄 DEBUG: Starting polling loop');

    while (this.pollingActive && this.subscribeClient) {
      try {
        pollCount++;
        console.log(`🔄 DEBUG: Poll iteration ${pollCount}, active: ${this.pollingActive}, hasClient: ${!!this.subscribeClient}`);

        // Use the simple approach that worked in our polling test
        let message: PubSubMsg | null = null;
        
        console.log('🔄 DEBUG: About to call getPubSubMessage...');
        try {
          // Use getPubSubMessage with a timeout to avoid blocking indefinitely
          message = await Promise.race([
            this.subscribeClient.getPubSubMessage(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 100)) // 100ms timeout
          ]);
          
          console.log('🔄 DEBUG: getPubSubMessage completed, message:', !!message);
          
          if (message) {
            console.log('📨 DEBUG: Got message from getPubSubMessage:', message);
          }
        } catch (error) {
          console.log('❌ DEBUG: Error in getPubSubMessage:', error);
          if (error instanceof ClosingError) {
            console.log('🔄 DEBUG: Client closing, exiting polling loop');
            break;
          }
          // Continue on other errors
        }
        
        if (message) {
          console.log('🎯 DEBUG: Processing message:', message);
          // Convert GLIDE message to ioredis-compatible events
          const channel = String(message.channel);
          const messageContent = String(message.message);
          
          console.log('🎯 DEBUG: Emitting event for channel:', channel, 'message:', messageContent);
          
          if (message.pattern) {
            // Pattern message
            const pattern = String(message.pattern);
            this.emit('pmessage', pattern, channel, messageContent);
          } else {
            // Regular message
            this.emit('message', channel, messageContent);
          }
          
          // Reset retry count on successful message
          retryCount = 0;
        } else {
          // Small delay to prevent tight loop when no messages
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
      } catch (error) {
        if (error instanceof ClosingError) {
          // Client is closing, exit gracefully
          break;
        } else {
          console.error('Error in pub/sub polling:', error);
          
          if (retryCount < maxRetries) {
            retryCount++;
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          } else {
            // Max retries reached, emit error and break
            this.emit('error', error);
            break;
          }
        }
      }
    }
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    return {
      subscribedChannels: Array.from(this.subscribedChannels),
      subscribedPatterns: Array.from(this.subscribedPatterns),
      pollingActive: this.pollingActive,
      hasSubscribeClient: !!this.subscribeClient,
      hasPublishClient: !!this.publishClient
    };
  }

  /**
   * Clean up all connections and stop polling
   */
  async cleanup(): Promise<void> {
    // Stop polling
    await this.stopPolling();

    // Close clients
    if (this.subscribeClient) {
      this.subscribeClient.close();
      this.subscribeClient = null;
    }
    
    if (this.publishClient) {
      this.publishClient.close();
      this.publishClient = null;
    }

    // Clear subscriptions
    this.subscribedChannels.clear();
    this.subscribedPatterns.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}
