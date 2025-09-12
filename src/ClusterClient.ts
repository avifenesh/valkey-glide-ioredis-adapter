/**
 * ClusterClient - Internal cluster client implementation
 * Database-agnostic implementation using Valkey GLIDE
 * Not exposed to users directly - wrapped by Cluster class
 */

import {
  GlideClusterClient,
  GlideClusterClientConfiguration,
  ClusterScanCursor,
} from '@valkey/valkey-glide';
import { BaseClient, GlideClientType } from './BaseClient';
import { ParameterTranslator } from './utils/ParameterTranslator';
import { RedisOptions, ReadFrom } from './types';
import { toGlideClusterConfig } from './utils/OptionsMapper';

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
    const config: GlideClusterClientConfiguration = toGlideClusterConfig(
      this.clusterNodes,
      this.clusterOptions
    );
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
      public options: { match?: string; count?: number; type?: string };

      constructor(
        client: ClusterClient,
        options: { match?: string; count?: number; type?: string }
      ) {
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

          // Honor adapter option to allow scanning across non-covered slots
          if ((this.client as any).options?.scanAllowNonCoveredSlots) {
            (scanOptions as any).allowNonCoveredSlots = true;
          }

          const glideClient = this.client.glideClient as GlideClusterClient;
          const result = await glideClient.scan(
            this.clusterCursor,
            scanOptions
          );

          if (!Array.isArray(result) || result.length !== 2) {
            throw new Error('Invalid cluster SCAN response format');
          }

          const [newCursor, keys] = result;
          this.clusterCursor = newCursor;

          // Check if cluster scan is finished using GLIDE cursor
          this.finished = this.clusterCursor.isFinished();

          if (keys.length > 0) {
            const converted = keys.map(
              (k: any) => ParameterTranslator.convertGlideString(k) || ''
            );
            this.push(converted);
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

  // Cluster scan implementation using native GLIDE ClusterScanCursor
  async scan(cursor: string, ...args: string[]): Promise<[string, string[]]> {
    const { ClusterScanCursor } = require('@valkey/valkey-glide');

    // Construct or resume cluster cursor from the token provided by caller
    const clusterCursor =
      !cursor || cursor === '0'
        ? new ClusterScanCursor()
        : new ClusterScanCursor(cursor);

    // Parse ioredis-style SCAN arguments into GLIDE options
    const scanOptions: any = {};
    for (let i = 0; i < args.length; i += 2) {
      const opt = args[i]?.toUpperCase();
      const val = args[i + 1];
      if (opt === 'MATCH' && val != null) scanOptions.match = String(val);
      else if (opt === 'COUNT' && val != null)
        scanOptions.count = parseInt(String(val), 10);
      else if (opt === 'TYPE' && val != null) scanOptions.type = String(val);
    }

    // Honor adapter option to allow scanning across non-covered slots
    if ((this as any).options?.scanAllowNonCoveredSlots) {
      (scanOptions as any).allowNonCoveredSlots = true;
    }

    const [nextCursor, keys] = await (
      this.glideClient as GlideClusterClient
    ).scan(clusterCursor, scanOptions);

    const cursorToken = nextCursor.isFinished() ? '0' : nextCursor.getCursor();
    const keyArray = Array.isArray(keys)
      ? keys.map(k => ParameterTranslator.convertGlideString(k) || '')
      : [];
    return [cursorToken, keyArray];
  }

  // Cluster: aggregate DB size across nodes using GLIDE's native implementation
  async dbsize(): Promise<number> {
    await this.ensureConnection();
    const result = await (this.glideClient as GlideClusterClient).dbsize();
    return Number(result) || 0;
  }

  // For scripting in cluster, GLIDE handles routing and single-slot enforcement.
  // We defer to BaseClient's scripting methods which leverage GLIDE internals.

  // KEYS method using SCAN for cluster client
  async keys(pattern: string = '*'): Promise<string[]> {
    await this.ensureConnection();
    const { ClusterScanCursor } = require('@valkey/valkey-glide');

    const allKeys: string[] = [];
    let cursor = new ClusterScanCursor();

    while (!cursor.isFinished()) {
      const result = await (this.glideClient as GlideClusterClient).scan(
        cursor,
        { match: pattern, count: 1000 }
      );
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
  async publish(
    channel: string,
    message: string | Buffer,
    sharded?: boolean
  ): Promise<number> {
    await this.ensureConnection();

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
      const result = await (
        this.glideClient as GlideClusterClient
      ).customCommand(['PUBLISH', channel, publishMessage]);
      return Number(result) || 0;
    } else {
      // GLIDE mode: Use native publish (now safe for binary data)
      return await (this.glideClient as GlideClusterClient).publish(
        publishMessage,
        channel,
        sharded
      );
    }
  }

  // Abstract methods implementation for pub/sub support
  protected async getBaseSubscriberConfig(): Promise<GlideClusterClientConfiguration> {
    await this.ensureConnection();
    return {
      addresses: this.clusterNodes.map(node => ({
        host: node.host,
        port: node.port,
      })),
      clientName: `${this.clusterOptions.clientName || 'cluster-subscriber'}-${Date.now()}`,

      // Copy essential config from main client
      ...(this.clusterOptions.tls || this.clusterOptions.useTLS
        ? { useTLS: true }
        : {}),

      // Authentication mapping
      ...(this.clusterOptions.username && this.clusterOptions.password
        ? {
            credentials: {
              username: this.clusterOptions.username,
              password: this.clusterOptions.password,
            },
          }
        : {}),

      // Cluster-specific options
      ...(this.clusterOptions.readFrom && {
        readFrom: this.clusterOptions.readFrom,
      }),
      ...(this.clusterOptions.clientAz && {
        clientAz: this.clusterOptions.clientAz,
      }),
    };
  }

  protected async createSubscriberClientFromConfig(
    config: GlideClusterClientConfiguration
  ): Promise<GlideClientType> {
    return await GlideClusterClient.createClient(config);
  }

  protected async createSubscriberClient(): Promise<GlideClientType> {
    await this.ensureConnection();
    const config = await this.getBaseSubscriberConfig();
    return await this.createSubscriberClientFromConfig(config);
  }

  // Override ssubscribe and sunsubscribe for cluster-specific sharded pub/sub
  async ssubscribe(...channels: string[]): Promise<number> {
    await this.ensureConnection();
    // Add new sharded channels to our subscription set
    const newChannels = channels.filter(
      channel => !this.subscribedShardedChannels.has(channel)
    );
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
    await this.ensureConnection();
    if (channels.length === 0) {
      // Unsubscribe from all sharded channels
      this.subscribedShardedChannels.clear();
    } else {
      // Unsubscribe from specific sharded channels
      channels.forEach(channel =>
        this.subscribedShardedChannels.delete(channel)
      );
    }

    // Recreate subscription client with updated sharded channels
    await this.updateSubscriberClient();

    // Emit unsubscription events for ioredis compatibility
    for (const channel of channels) {
      this.emit('sunsubscribe', channel, this.subscribedShardedChannels.size);
    }

    // Exit subscriber mode if no more subscriptions
    if (
      this.subscribedChannels.size === 0 &&
      this.subscribedPatterns.size === 0 &&
      this.subscribedShardedChannels.size === 0
    ) {
      this.isInSubscriberMode = false;
    }

    return this.subscribedShardedChannels.size;
  }

  async unwatch(): Promise<string> {
    await this.ensureConnection();
    await (this.glideClient as GlideClusterClient).unwatch();
    return 'OK';
  }

  /**
   * Override exec method for cluster-specific batch operations.
   * In GLIDE, cluster clients use different batch mechanisms than standalone clients.
   *
   * For ioredis compatibility, this creates an empty multi transaction and executes it.
   * This is mainly for Bull/BullMQ compatibility which checks for the existence of exec method.
   */
  async exec(): Promise<Array<[Error | null, any]> | null> {
    // Create an empty multi transaction and execute it
    // This provides ioredis compatibility for libraries that call client.exec() directly
    const multi = this.multi();
    return await multi.exec();
  }
}
