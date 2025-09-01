/**
 * StandaloneClient - Internal standalone client implementation
 * Database-agnostic implementation using Valkey GLIDE
 * Not exposed to users directly - wrapped by Redis class
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { BaseClient, GlideClientType } from './BaseClient';

export class StandaloneClient extends BaseClient {
  protected async createClient(): Promise<GlideClientType> {
    const config: GlideClientConfiguration = {
      addresses: [{
        host: this.options.host || 'localhost',
        port: this.options.port || 6379
      }],
      
      // Direct parameter mappings
      ...(this.options.clientName && { clientName: this.options.clientName }),
      ...(this.options.tls || this.options.useTLS ? { useTLS: true } : {}),
      ...(this.options.db !== undefined && { databaseId: this.options.db }),
      ...(this.options.lazyConnect !== undefined ? { lazyConnect: this.options.lazyConnect } : {}),
      
      // Authentication mapping
      ...(this.options.username && this.options.password ? {
        credentials: {
          username: this.options.username,
          password: this.options.password
        }
      } : {}),
      
      // Timeout mapping - prefer requestTimeout, fallback to commandTimeout
      ...(this.options.requestTimeout ? { requestTimeout: this.options.requestTimeout } :
         this.options.commandTimeout ? { requestTimeout: this.options.commandTimeout } : {}),
      
      // GLIDE-specific extensions
      ...(this.options.readFrom && { readFrom: this.options.readFrom }),
      ...(this.options.clientAz && { clientAz: this.options.clientAz })
    };

    // Advanced parameter translation
    const advancedConfig: any = {};
    
    // connectTimeout → advancedConfiguration.connectionTimeout
    if (this.options.connectTimeout !== undefined) {
      advancedConfig.connectionTimeout = this.options.connectTimeout;
    }
    
    if (Object.keys(advancedConfig).length > 0) {
      config.advancedConfiguration = advancedConfig;
    }

    // Connection backoff strategy from ioredis retry options
    const connectionBackoff: any = {};
    
    // maxRetriesPerRequest → connectionBackoff.numberOfRetries
    if (this.options.maxRetriesPerRequest !== undefined) {
      const retries = this.options.maxRetriesPerRequest === null ? 50 : this.options.maxRetriesPerRequest;
      connectionBackoff.numberOfRetries = retries;
      // Let GLIDE use its own defaults for factor, exponentBase, jitterPercent
    }
    
    // retryDelayOnFailover → connectionBackoff.jitterPercent
    if (this.options.retryDelayOnFailover !== undefined) {
      // Convert delay (ms) to jitter percentage (5-100%)
      const jitter = Math.min(100, Math.max(5, Math.round(this.options.retryDelayOnFailover / 5)));
      connectionBackoff.jitterPercent = jitter;
    }
    
    if (Object.keys(connectionBackoff).length > 0) {
      config.connectionBackoff = connectionBackoff;
    }

    // enableOfflineQueue → inflightRequestsLimit (only if explicitly disabled)
    if (this.options.enableOfflineQueue === false) {
      config.inflightRequestsLimit = 0; // No queuing, immediate failure
    }
    // If true or undefined, let GLIDE use its default (1000)

    return await GlideClient.createClient(config);
  }


  get isCluster(): boolean {
    return false;
  }

  // UNWATCH method specific to GlideClient (no parameters)
  async unwatch(): Promise<string> {
    const client = await this.ensureConnected() as GlideClient;
    return await client.unwatch();
  }

  // KEYS method using SCAN for standalone client
  async keys(pattern: string = '*'): Promise<string[]> {
    const client = await this.ensureConnected() as GlideClient;
    const allKeys: string[] = [];
    let cursor = '0';
    
    do {
      const result = await client.scan(cursor, { match: pattern, count: 1000 });
      // Convert cursor to string for comparison
      const newCursor = result[0];
      cursor = typeof newCursor === 'string' ? newCursor : newCursor.toString();
      const keys = result[1];
      
      // Convert GlideString[] to string[]
      const convertedKeys = keys.map(key => {
        if (typeof key === 'string') return key;
        if (Buffer.isBuffer(key)) return key.toString();
        return String(key);
      });
      
      allKeys.push(...convertedKeys);
    } while (cursor !== '0');
    
    return allKeys;
  }

  // Binary data marker for encoding
  private static readonly BINARY_MARKER = '__GLIDE_BINARY__:';

  // PUBLISH method for standalone client - supports both modes with binary data handling
  async publish(channel: string, message: string | Buffer): Promise<number> {
    const client = await this.ensureConnected() as GlideClient;
    
    // Handle binary data encoding for UTF-8 safety
    let publishMessage: string;
    if (message instanceof Buffer || message instanceof Uint8Array) {
      // Binary data: encode as base64 with marker
      const base64Data = Buffer.from(message).toString('base64');
      publishMessage = StandaloneClient.BINARY_MARKER + base64Data;
    } else {
      // String data: use as-is
      publishMessage = String(message);
    }
    
    if (this.options.enableEventBasedPubSub) {
      // Event-based mode: Use customCommand (now safe for binary data)
      const result = await client.customCommand(['PUBLISH', channel, publishMessage]);
      return Number(result) || 0;
    } else {
      // GLIDE mode: Use native publish (now safe for binary data)
      return await client.publish(publishMessage, channel);
    }
  }

  // Abstract methods implementation for pub/sub support
  protected async getBaseSubscriberConfig(): Promise<GlideClientConfiguration> {
    return {
      addresses: [{
        host: this.options.host || 'localhost',
        port: this.options.port || 6379
      }],
      clientName: `${this.options.clientName || 'subscriber'}-${Date.now()}`,
      
      // Copy essential config from main client
      ...(this.options.tls || this.options.useTLS ? { useTLS: true } : {}),
      ...(this.options.db !== undefined && { databaseId: this.options.db }),
      
      // Authentication mapping
      ...(this.options.username && this.options.password ? {
        credentials: {
          username: this.options.username,
          password: this.options.password
        }
      } : {})
    };
  }

  protected async createSubscriberClientFromConfig(config: GlideClientConfiguration): Promise<GlideClientType> {
    return await GlideClient.createClient(config);
  }

  protected async createSubscriberClient(): Promise<GlideClientType> {
    const config = await this.getBaseSubscriberConfig();
    return await this.createSubscriberClientFromConfig(config);
  }
}