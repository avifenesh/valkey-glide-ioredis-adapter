/**
 * ClusterClient - Internal cluster client implementation  
 * Database-agnostic implementation using Valkey GLIDE
 * Not exposed to users directly - wrapped by Cluster class
 */

import { GlideClusterClient, GlideClusterClientConfiguration, ClusterScanCursor } from '@valkey/valkey-glide';
import { BaseClient, GlideClientType } from './BaseClient';
import { RedisOptions, ReadFrom } from './types';

export interface ClusterNode {
  host: string;
  port: number;
}

export interface ClusterOptions extends RedisOptions {
  enableReadFromReplicas?: boolean; // Legacy compatibility
  scaleReads?: 'master' | 'slave' | 'all';
  maxRedirections?: number;
  retryDelayOnFailover?: number;
  enableOfflineQueue?: boolean;
  readOnly?: boolean;
  
  // GLIDE-specific cluster features
  readFrom?: ReadFrom; // New preferred option
  clientAz?: string; // Availability Zone for AZ affinity
}

export class ClusterClient extends BaseClient {
  protected clusterNodes: ClusterNode[];
  protected clusterOptions: ClusterOptions;

  constructor(nodes: ClusterNode[], options: ClusterOptions = {}) {
    super(options);
    this.clusterNodes = nodes;
    this.clusterOptions = options;
  }

  protected async createClient(): Promise<GlideClientType> {
    const config: GlideClusterClientConfiguration = {
      addresses: this.clusterNodes.map(node => ({
        host: node.host,
        port: node.port
      })),
      
      // Direct parameter mappings
      ...(this.clusterOptions.clientName && { clientName: this.clusterOptions.clientName }),
      ...(this.clusterOptions.tls || this.clusterOptions.useTLS ? { useTLS: true } : {}),
      ...(this.clusterOptions.lazyConnect !== undefined ? { lazyConnect: this.clusterOptions.lazyConnect } : {}),
      
      // Authentication mapping
      ...(this.clusterOptions.username && this.clusterOptions.password ? {
        credentials: {
          username: this.clusterOptions.username,
          password: this.clusterOptions.password
        }
      } : {}),
      
      // Timeout mapping - prefer requestTimeout, fallback to commandTimeout
      ...(this.clusterOptions.requestTimeout ? { requestTimeout: this.clusterOptions.requestTimeout } :
         this.clusterOptions.commandTimeout ? { requestTimeout: this.clusterOptions.commandTimeout } : {}),
      
      // Read strategy mapping - support both legacy and new options
      readFrom: this.clusterOptions.readFrom || 
                (this.clusterOptions.enableReadFromReplicas ? 'preferReplica' : 'primary'),
                
      // GLIDE-specific cluster extensions
      ...(this.clusterOptions.clientAz && { clientAz: this.clusterOptions.clientAz })
    };

    // Advanced parameter translation
    const advancedConfig: any = {};
    
    // connectTimeout → advancedConfiguration.connectionTimeout
    if (this.clusterOptions.connectTimeout !== undefined) {
      advancedConfig.connectionTimeout = this.clusterOptions.connectTimeout;
    }
    
    if (Object.keys(advancedConfig).length > 0) {
      config.advancedConfiguration = advancedConfig;
    }

    // Connection backoff strategy from ioredis retry options
    const connectionBackoff: any = {};
    
    // maxRetriesPerRequest → connectionBackoff.numberOfRetries
    if (this.clusterOptions.maxRetriesPerRequest !== undefined) {
      const retries = this.clusterOptions.maxRetriesPerRequest === null ? 50 : this.clusterOptions.maxRetriesPerRequest;
      connectionBackoff.numberOfRetries = retries;
      // Let GLIDE use its own defaults for factor, exponentBase, jitterPercent
    }
    
    // retryDelayOnFailover → connectionBackoff.jitterPercent (especially important for clusters)
    if (this.clusterOptions.retryDelayOnFailover !== undefined) {
      // Convert delay (ms) to jitter percentage (5-100%)
      const jitter = Math.min(100, Math.max(5, Math.round(this.clusterOptions.retryDelayOnFailover / 5)));
      connectionBackoff.jitterPercent = jitter;
    }
    
    if (Object.keys(connectionBackoff).length > 0) {
      config.connectionBackoff = connectionBackoff;
    }

    // enableOfflineQueue → inflightRequestsLimit (only if explicitly disabled)
    if (this.clusterOptions.enableOfflineQueue === false) {
      config.inflightRequestsLimit = 0; // No queuing, immediate failure
    }
    // If true or undefined, let GLIDE use its default (1000)

    return await GlideClusterClient.createClient(config);
  }


  get isCluster(): boolean {
    return true;
  }

  // Override scanStream for cluster-specific GLIDE implementation
  scanStream(options: { match?: string; type?: string; count?: number } = {}) {
    const { Readable } = require('stream');
    
    class ClusterScanStream extends Readable {
      public cursor: string = '0';
      public clusterCursor: ClusterScanCursor;
      public finished: boolean = false;
      public client: ClusterClient;
      public options: any;

      constructor(client: ClusterClient, options: any) {
        super({ objectMode: true });
        this.client = client;
        this.options = options;
        this.clusterCursor = new ClusterScanCursor();
      }

      async _read() {
        if (this.finished) {
          this.push(null);
          return;
        }

        try {
          // Build GLIDE cluster scan options
          const scanOptions: any = {};
          
          if (this.options.match) {
            scanOptions.match = this.options.match;
          }
          
          if (this.options.count) {
            scanOptions.count = this.options.count;
          }
          
          if (this.options.type) {
            scanOptions.type = this.options.type;
          }

          const glideClient = await this.client.ensureConnected() as GlideClusterClient;
          const result = await glideClient.scan(this.clusterCursor, scanOptions);
          
          if (!Array.isArray(result) || result.length !== 2) {
            throw new Error('Invalid cluster SCAN response format');
          }

          const [newCursor, keys] = result;
          this.clusterCursor = newCursor;

          // Check if cluster scan is finished using GLIDE cursor
          this.finished = this.clusterCursor.isFinished();

          if (keys.length > 0) {
            this.push(keys);
          }

          if (this.finished) {
            this.push(null);
          }
        } catch (error) {
          this.emit('error', error);
        }
      }
    }

    return new ClusterScanStream(this, options);
  }

  // Cluster-specific methods
  async getNodes(): Promise<string[]> {
    // Return node information - implementation depends on GLIDE's cluster info
    return this.clusterNodes.map(node => `${node.host}:${node.port}`);
  }


  // KEYS method using SCAN for cluster client
  async keys(pattern: string = '*'): Promise<string[]> {
    const client = await this.ensureConnected() as GlideClusterClient;
    const { ClusterScanCursor } = require('@valkey/valkey-glide');
    
    const allKeys: string[] = [];
    let cursor = new ClusterScanCursor();
    
    while (!cursor.isFinished()) {
      const result = await client.scan(cursor, { match: pattern, count: 1000 });
      cursor = result[0];
      const keys = result[1];
      
      // Convert GlideString[] to string[]
      const convertedKeys = keys.map(key => {
        if (typeof key === 'string') return key;
        if (Buffer.isBuffer(key)) return key.toString();
        return String(key);
      });
      
      allKeys.push(...convertedKeys);
    }
    
    return allKeys;
  }

  // Binary data marker for encoding (same as standalone)
  private static readonly BINARY_MARKER = '__GLIDE_BINARY__:';

  // PUBLISH method for cluster client (supports sharded publishing and both modes with binary data handling)
  async publish(channel: string, message: string | Buffer, sharded?: boolean): Promise<number> {
    const client = await this.ensureConnected() as GlideClusterClient;
    
    // Handle binary data encoding for UTF-8 safety
    let publishMessage: string;
    if (message instanceof Buffer || message instanceof Uint8Array) {
      // Binary data: encode as base64 with marker
      const base64Data = Buffer.from(message).toString('base64');
      publishMessage = ClusterClient.BINARY_MARKER + base64Data;
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
      return await client.publish(publishMessage, channel, sharded);
    }
  }

  // Abstract methods implementation for pub/sub support
  protected async getBaseSubscriberConfig(): Promise<GlideClusterClientConfiguration> {
    return {
      addresses: this.clusterNodes.map(node => ({
        host: node.host,
        port: node.port
      })),
      clientName: `${this.clusterOptions.clientName || 'cluster-subscriber'}-${Date.now()}`,
      
      // Copy essential config from main client
      ...(this.clusterOptions.tls || this.clusterOptions.useTLS ? { useTLS: true } : {}),
      
      // Authentication mapping
      ...(this.clusterOptions.username && this.clusterOptions.password ? {
        credentials: {
          username: this.clusterOptions.username,
          password: this.clusterOptions.password
        }
      } : {}),

      // Cluster-specific options
      ...(this.clusterOptions.readFrom && { readFrom: this.clusterOptions.readFrom }),
      ...(this.clusterOptions.clientAz && { clientAz: this.clusterOptions.clientAz })
    };
  }

  protected async createSubscriberClientFromConfig(config: GlideClusterClientConfiguration): Promise<GlideClientType> {
    return await GlideClusterClient.createClient(config);
  }

  protected async createSubscriberClient(): Promise<GlideClientType> {
    const config = await this.getBaseSubscriberConfig();
    return await this.createSubscriberClientFromConfig(config);
  }

  // Override ssubscribe and sunsubscribe for cluster-specific sharded pub/sub
  async ssubscribe(...channels: string[]): Promise<number> {
    // Add new sharded channels to our subscription set
    const newChannels = channels.filter(channel => !this.subscribedShardedChannels.has(channel));
    newChannels.forEach(channel => this.subscribedShardedChannels.add(channel));

    // If we have new channels, recreate the subscription client
    if (newChannels.length > 0) {
      await this.updateSubscriberClient();
    }

    // Emit subscription events for ioredis compatibility
    for (const channel of channels) {
      this.emit('ssubscribe', channel, this.subscribedShardedChannels.size);
    }

    this.isInSubscriberMode = true;
    return this.subscribedShardedChannels.size;
  }

  async sunsubscribe(...channels: string[]): Promise<number> {
    if (channels.length === 0) {
      // Unsubscribe from all sharded channels
      this.subscribedShardedChannels.clear();
    } else {
      // Unsubscribe from specific sharded channels
      channels.forEach(channel => this.subscribedShardedChannels.delete(channel));
    }

    // Recreate subscription client with updated sharded channels
    await this.updateSubscriberClient();

    // Emit unsubscription events for ioredis compatibility
    for (const channel of channels) {
      this.emit('sunsubscribe', channel, this.subscribedShardedChannels.size);
    }

    // Exit subscriber mode if no more subscriptions
    if (this.subscribedChannels.size === 0 && this.subscribedPatterns.size === 0 && this.subscribedShardedChannels.size === 0) {
      this.isInSubscriberMode = false;
    }

    return this.subscribedShardedChannels.size;
  }

  // Transaction Commands for Bull/BullMQ compatibility
  multi(): any {
    // Returns a transaction object that collects commands
    const commands: Array<{ command: string; args: any[] }> = [];
    const self = this;
    
    // Create a proxy object that captures commands
    const multiObj = {
      commands,
      
      // Add common Redis commands to the multi object
      set: (key: string, value: any, ...args: any[]) => {
        commands.push({ command: 'SET', args: [key, value, ...args] });
        return multiObj;
      },
      get: (key: string) => {
        commands.push({ command: 'GET', args: [key] });
        return multiObj;
      },
      del: (...keys: string[]) => {
        commands.push({ command: 'DEL', args: keys });
        return multiObj;
      },
      hset: (key: string, ...args: any[]) => {
        commands.push({ command: 'HSET', args: [key, ...args] });
        return multiObj;
      },
      hget: (key: string, field: string) => {
        commands.push({ command: 'HGET', args: [key, field] });
        return multiObj;
      },
      lpush: (key: string, ...values: any[]) => {
        commands.push({ command: 'LPUSH', args: [key, ...values] });
        return multiObj;
      },
      rpush: (key: string, ...values: any[]) => {
        commands.push({ command: 'RPUSH', args: [key, ...values] });
        return multiObj;
      },
      zadd: (key: string, ...args: any[]) => {
        commands.push({ command: 'ZADD', args: [key, ...args] });
        return multiObj;
      },
      
      // Execute the transaction
      exec: async () => {
        const client = await self.ensureConnected();
        const results = [];
        
        // Execute each command in sequence
        for (const { command, args } of commands) {
          try {
            const result = await (client as any).customCommand([command, ...args]);
            results.push([null, result]);
          } catch (error) {
            results.push([error, null]);
          }
        }
        
        return results;
      }
    };
    
    return multiObj;
  }

  async exec(): Promise<any[]> {
    // This is called on the multi object, not the client directly
    throw new Error('EXEC should be called on the multi object returned by multi()');
  }

  async watch(...keys: string[]): Promise<string> {
    const client = await this.ensureConnected();
    await (client as any).customCommand(['WATCH', ...keys]);
    return 'OK';
  }

  async unwatch(): Promise<string> {
    const client = await this.ensureConnected();
    await (client as any).customCommand(['UNWATCH']);
    return 'OK';
  }
}