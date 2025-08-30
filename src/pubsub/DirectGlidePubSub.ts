/**
 * Direct GLIDE Pub/Sub Utility
 * 
 * This utility provides the working GLIDE pub/sub pattern that can be used
 * directly in applications. It does NOT encapsulate the polling - instead,
 * it provides utilities to set up the working pattern.
 */

import { 
  GlideClient, 
  GlideClientConfiguration, 
  PubSubMsg
} from '@valkey/valkey-glide';
import { RedisOptions } from '../types';
import { asyncClose } from '../utils/GlideUtils';

export interface PubSubClients {
  publisher: GlideClient;
  subscriber: GlideClient;
}

export interface PubSubMessage {
  channel: string;
  message: string;
  pattern?: string;
}

/**
 * Create separate publisher and subscriber clients
 */
// Store callback functions for subscribers
const subscriberCallbacks = new Map<GlideClient, (msg: PubSubMessage) => void>();

export async function createPubSubClients(
  options: RedisOptions,
  subscriptions: {
    channels?: string[];
    patterns?: string[];
  },
  messageCallback?: (msg: PubSubMessage) => void
): Promise<PubSubClients> {
  // Create publisher config (simple, no subscriptions needed)
  const publisherConfig: GlideClientConfiguration = {
    addresses: [{ host: options.host || 'localhost', port: options.port || 6379 }],
    clientName: `pubsub-publisher-${Date.now()}`,
    databaseId: options.db || 0,
  };
  
  // Create subscriber config (simple, with callback mechanism)
  const subscriberConfig: GlideClientConfiguration = {
    addresses: [{ host: options.host || 'localhost', port: options.port || 6379 }],
    clientName: `pubsub-subscriber-${Date.now()}`,
    databaseId: options.db || 0,
  };
  
  const hasChannels = subscriptions.channels && subscriptions.channels.length > 0;
  const hasPatterns = subscriptions.patterns && subscriptions.patterns.length > 0;
  
  if (hasChannels || hasPatterns) {
    // Use GLIDE's callback mechanism - the correct way!
    subscriberConfig.pubsubSubscriptions = {
      channelsAndPatterns: {},
      callback: (msg: PubSubMsg, context: any) => {
        // Convert GLIDE message format to our format
        const convertedMessage: PubSubMessage = {
          channel: String(msg.channel),
          message: String(msg.message)
        };
        
        if (msg.pattern) {
          convertedMessage.pattern = String(msg.pattern);
        }
        
        console.log(`📨 GLIDE Callback: ${convertedMessage.channel} -> ${convertedMessage.message}`);
        
        // Call the stored callback for this subscriber
        const callback = subscriberCallbacks.get(context.subscriber);
        if (callback) {
          callback(convertedMessage);
        }
      },
      context: {} // Will be set after subscriber creation
    };

    // Add exact channels
    if (hasChannels) {
      subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
        GlideClientConfiguration.PubSubChannelModes.Exact
      ] = new Set(subscriptions.channels);
    }

    // Add pattern channels
    if (hasPatterns) {
      subscriberConfig.pubsubSubscriptions!.channelsAndPatterns![
        GlideClientConfiguration.PubSubChannelModes.Pattern
      ] = new Set(subscriptions.patterns);
    }
  }

  try {
    // Create publisher first (no subscription dependencies)
    const publisher = await GlideClient.createClient(publisherConfig);
    
    // For subscriber, we need to set up the context BEFORE creating the client
    // Create a placeholder context that will hold the subscriber reference
    const subscriberContext: { subscriber?: GlideClient } = {};
    
    if (subscriberConfig.pubsubSubscriptions) {
      subscriberConfig.pubsubSubscriptions.context = subscriberContext;
    }
    
    // Create subscriber client
    const subscriber = await GlideClient.createClient(subscriberConfig);
    
    // Now set the subscriber reference in the context
    subscriberContext.subscriber = subscriber;
    
    // Store the message callback for this subscriber
    if (messageCallback) {
      subscriberCallbacks.set(subscriber, messageCallback);
    }
    
    // Simple connection validation
    await publisher.ping();
    await subscriber.ping();
    
    console.log('✅ PubSub clients created with GLIDE callback mechanism');
    return { publisher, subscriber };
  } catch (error) {
    throw new Error(`GLIDE PubSub client creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Publish a message using GLIDE client
 */
export async function publishMessage(
  publisher: GlideClient,
  channel: string,
  message: string
): Promise<number> {
  return await publisher.publish(message, channel); // GLIDE order: message, channel
}

/**
 * Poll for messages using the working pattern
 * 
 * This function implements the exact pattern that works with GLIDE.
 * It should be called in a loop in your application code.
 */
export async function pollForMessage(
  subscriber: GlideClient,
  timeoutMs: number = 100
): Promise<PubSubMessage | null> {
  try {
    const message: PubSubMsg | null = await Promise.race([
      subscriber.getPubSubMessage(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))
    ]);

    if (message) {
      console.log(`🔍 GLIDE Message: ${message.channel} -> ${message.message}`);
      const result: PubSubMessage = {
        channel: String(message.channel),
        message: String(message.message)
      };
      
      if (message.pattern) {
        result.pattern = String(message.pattern);
      }
      
      return result;
    }

    return null;
  } catch (error) {
    // Ignore errors during client shutdown - this is expected
    if (error && typeof error === 'object' && 'name' in error) {
      if (error.name === 'ClosingError') {
        return null; // Client is closing, stop polling
      }
    }
    return null;
  }
}

/**
 * Create a simple polling loop
 * 
 * This is a utility function that implements the working polling pattern.
 * Use this in your application code where you have direct control.
 */
export async function createPollingLoop(
  subscriber: GlideClient,
  onMessage: (message: PubSubMessage) => void,
  options: {
    maxIterations?: number;
    pollTimeoutMs?: number;
    loopDelayMs?: number;
  } = {}
): Promise<void> {
  const {
    maxIterations = 1000,
    pollTimeoutMs = 100,
    loopDelayMs = 10
  } = options;

  // Use the proven for-loop pattern
  for (let i = 0; i < maxIterations; i++) {
    const message = await pollForMessage(subscriber, pollTimeoutMs);
    
    if (message) {
      onMessage(message);
    }

    // Small delay to prevent tight loop
    await new Promise(resolve => setTimeout(resolve, loopDelayMs));
  }
}

/**
 * Cleanup pub/sub clients with async close
 */
export async function cleanupPubSubClients(clients: PubSubClients): Promise<void> {
  await Promise.all([
    asyncClose(clients.publisher, 'Publisher cleanup'),
    asyncClose(clients.subscriber, 'Subscriber cleanup')
  ]);
}

/**
 * Example usage pattern for applications
 */
export const exampleUsage = `
// Example: Direct GLIDE Pub/Sub Usage

import { 
  createPubSubClients, 
  publishMessage, 
  createPollingLoop, 
  cleanupPubSubClients 
} from './DirectGlidePubSub';

async function example() {
  // Create clients
  const clients = await createPubSubClients(
    { host: 'localhost', port: 6379 },
    { 
      channels: ['my-channel'], 
      patterns: ['news.*'] 
    }
  );

  // Set up message handling
  const handleMessage = (message) => {
    if (message.pattern) {
      console.log('Pattern message:', message.pattern, message.channel, message.message);
    } else {
      console.log('Channel message:', message.channel, message.message);
    }
  };

  // Start polling (in background)
  const pollingPromise = createPollingLoop(clients.subscriber, handleMessage);

  // Publish messages
  await publishMessage(clients.publisher, 'my-channel', 'Hello World!');
  await publishMessage(clients.publisher, 'news.sports', 'Goal scored!');

  // Wait and cleanup
  setTimeout(() => {
    cleanupPubSubClients(clients);
  }, 5000);
}
`;

/**
 * Library Integration Helper
 * 
 * This provides a pattern for integrating with Redis libraries using direct GLIDE
 * Works with Bull/BullMQ, connect-redis, Socket.IO adapters, and other libraries
 */
export class LibraryGlideIntegration {
  private clients: PubSubClients | null = null;
  private channels = new Set<string>();
  private patterns = new Set<string>();
  private onMessageCallback: ((msg: PubSubMessage) => void) | null = null;
  private isShuttingDown = false;

  constructor(onMessage?: (msg: PubSubMessage) => void) {
    if (onMessage) this.onMessageCallback = onMessage;
  }

  setOnMessage(handler: (msg: PubSubMessage) => void) {
    this.onMessageCallback = handler;
  }

  async initialize(options: RedisOptions, subs: string[] | { channels?: string[]; patterns?: string[] }) {
    const channels = Array.isArray(subs) ? subs : (subs.channels || []);
    const patterns = Array.isArray(subs) ? [] : (subs.patterns || []);

    console.log(`🔧 LibraryGlideIntegration initializing with GLIDE callback mechanism`);
    console.log(`🔧 Channels: ${JSON.stringify(channels)}, patterns: ${JSON.stringify(patterns)}`);

    this.channels = new Set(channels.map(String));
    this.patterns = new Set(patterns.map(String));

    // Use the GLIDE callback mechanism instead of polling
    this.clients = await createPubSubClients(options, {
      channels: Array.from(this.channels),
      patterns: Array.from(this.patterns),
    }, (message: PubSubMessage) => {
      // This callback will be called directly by GLIDE
      console.log(`🎯 LibraryGlideIntegration callback: ${message.channel} -> ${message.message}`);
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    });
    
    console.log(`✅ LibraryGlideIntegration initialized with GLIDE callbacks`);
  }

  // Polling is no longer needed - GLIDE callbacks handle message delivery

  async publish(channel: string, message: string): Promise<number> {
    if (!this.clients) throw new Error('Not initialized');
    return await publishMessage(this.clients.publisher, channel, message);
  }

  getSubscriptions() {
    return {
      channels: Array.from(this.channels),
      patterns: Array.from(this.patterns),
    };
  }

  async updateSubscriptions(options: RedisOptions, updates: { addChannels?: string[]; removeChannels?: string[]; addPatterns?: string[]; removePatterns?: string[] }) {
    // Skip updates during shutdown
    if (this.isShuttingDown) {
      return;
    }

    // Update sets
    (updates.addChannels || []).forEach(c => this.channels.add(String(c)));
    (updates.removeChannels || []).forEach(c => this.channels.delete(String(c)));
    (updates.addPatterns || []).forEach(p => this.patterns.add(String(p)));
    (updates.removePatterns || []).forEach(p => this.patterns.delete(String(p)));

    // For removal operations during cleanup (like punsubscribe), skip reinitialization 
    // if we're only removing subscriptions and have no channels/patterns left
    const hasRemainingSubscriptions = this.channels.size > 0 || this.patterns.size > 0;
    const isRemovalOnly = (updates.removeChannels || updates.removePatterns) && 
                          !updates.addChannels && !updates.addPatterns;
    
    if (isRemovalOnly && !hasRemainingSubscriptions) {
      // Just mark for cleanup without recreating clients
      console.log('🔧 Skipping reinitialization during cleanup - no subscriptions remain');
      return;
    }

    // Recreate clients to apply new subscriptions
    await this.reinitialize(options);
  }

  private async reinitialize(options: RedisOptions) {
    // Skip reinitialization during shutdown
    if (this.isShuttingDown) {
      return;
    }

    const currentHandler = this.onMessageCallback;
    await this.cleanup();
    this.onMessageCallback = currentHandler || null;
    await this.initialize(options, { channels: Array.from(this.channels), patterns: Array.from(this.patterns) });
  }

  async cleanup() {
    this.isShuttingDown = true;
    if (this.clients) {
      // Remove the callback from our storage
      subscriberCallbacks.delete(this.clients.subscriber);
      try {
        await cleanupPubSubClients(this.clients);
      } catch (error) {
        // Ignore cleanup errors - this can happen during shutdown
        console.log('🔧 Cleanup warning (ignored):', error instanceof Error ? error.constructor.name : 'Unknown');
      }
      this.clients = null;
    }
  }
}

// Keep the old export for backward compatibility
export const BullGlideIntegration = LibraryGlideIntegration;
