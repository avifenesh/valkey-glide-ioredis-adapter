/**
 * PubSubMessageHandler - Incremental Step 1
 * 
 * This is a minimal implementation to fix the critical gap in message reception.
 * It bridges GLIDE's callback-based pub/sub to ioredis EventEmitter pattern.
 * 
 * This is NOT the full PubSubBridge from our Phase 2 plan - it's a careful
 * incremental step to validate the core concept before building the complete solution.
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg } from '@valkey/valkey-glide';

export class PubSubMessageHandler {
  private messageClients = new Map<string, GlideClient>();
  private patternClients = new Map<string, GlideClient>();
  
  constructor(
    private baseConfig: GlideClientConfiguration,
    private eventEmitter: EventEmitter
  ) {}
  
  /**
   * Create a GLIDE client configured for message reception on a specific channel
   */
  async createMessageClient(channel: string): Promise<GlideClient> {
    if (this.messageClients.has(channel)) {
      return this.messageClients.get(channel)!;
    }
    
    const config: GlideClientConfiguration = {
      ...this.baseConfig,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set([channel])
        },
        callback: (msg: PubSubMsg, _context: any) => {
          // Bridge GLIDE callback to ioredis event
          this.eventEmitter.emit('message', msg.channel, msg.message);
        },
        context: { channel, type: 'exact' }
      }
    };
    
    const client = await GlideClient.createClient(config);
    this.messageClients.set(channel, client);
    return client;
  }
  
  /**
   * Create a GLIDE client configured for pattern message reception
   */
  async createPatternClient(pattern: string): Promise<GlideClient> {
    if (this.patternClients.has(pattern)) {
      return this.patternClients.get(pattern)!;
    }
    
    const config: GlideClientConfiguration = {
      ...this.baseConfig,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Pattern]: new Set([pattern])
        },
        callback: (msg: PubSubMsg, _context: any) => {
          // Bridge GLIDE callback to ioredis pattern event
          this.eventEmitter.emit('pmessage', msg.pattern || pattern, msg.channel, msg.message);
        },
        context: { pattern, type: 'pattern' }
      }
    };
    
    const client = await GlideClient.createClient(config);
    this.patternClients.set(pattern, client);
    return client;
  }
  
  /**
   * Clean up message client for a channel
   */
  async removeMessageClient(channel: string): Promise<void> {
    const client = this.messageClients.get(channel);
    if (client) {
      await client.close();
      this.messageClients.delete(channel);
    }
  }
  
  /**
   * Clean up pattern client
   */
  async removePatternClient(pattern: string): Promise<void> {
    const client = this.patternClients.get(pattern);
    if (client) {
      await client.close();
      this.patternClients.delete(pattern);
    }
  }
  
  /**
   * Clean up all clients
   */
  async cleanup(): Promise<void> {
    const closePromises = [
      ...Array.from(this.messageClients.values()).map(client => client.close()),
      ...Array.from(this.patternClients.values()).map(client => client.close())
    ];
    
    await Promise.all(closePromises);
    this.messageClients.clear();
    this.patternClients.clear();
  }
  
  /**
   * Get status for debugging
   */
  getStatus() {
    return {
      messageClients: Array.from(this.messageClients.keys()),
      patternClients: Array.from(this.patternClients.keys()),
      totalClients: this.messageClients.size + this.patternClients.size
    };
  }
}
