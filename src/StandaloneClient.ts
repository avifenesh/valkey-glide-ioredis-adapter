/**
 * StandaloneClient - Internal standalone client implementation
 * Database-agnostic implementation using Valkey GLIDE
 * Not exposed to users directly - wrapped by Redis class
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { BaseClient, GlideClientType } from './BaseClient';
import { ParameterTranslator } from './utils/ParameterTranslator';

export class StandaloneClient extends BaseClient {
  protected async createClient(): Promise<GlideClientType> {
    const finalHost = this.options.host || 'localhost';
    const finalPort = this.options.port || 6379;

    const config: GlideClientConfiguration = {
      addresses: [
        {
          host: finalHost,
          port: finalPort,
        },
      ],

      // Direct parameter mappings
      ...(this.options.clientName && { clientName: this.options.clientName }),
      ...(this.options.tls || this.options.useTLS ? { useTLS: true } : {}),
      ...(this.options.db !== undefined && { databaseId: this.options.db }),
      ...(this.options.lazyConnect !== undefined
        ? { lazyConnect: this.options.lazyConnect }
        : {}),

      // Authentication mapping
      ...(this.options.username && this.options.password
        ? {
            credentials: {
              username: this.options.username,
              password: this.options.password,
            },
          }
        : {}),

      // Timeout mapping - prefer requestTimeout, fallback to commandTimeout
      ...(this.options.requestTimeout
        ? { requestTimeout: this.options.requestTimeout }
        : this.options.commandTimeout
          ? { requestTimeout: this.options.commandTimeout }
          : {}),

      // GLIDE-specific extensions
      ...(this.options.readFrom && { readFrom: this.options.readFrom }),
      ...(this.options.clientAz && { clientAz: this.options.clientAz }),
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
      const retries =
        this.options.maxRetriesPerRequest === null
          ? 50
          : this.options.maxRetriesPerRequest;
      connectionBackoff.numberOfRetries = retries;
      // Let GLIDE use its own defaults for factor, exponentBase, jitterPercent
    }

    // retryDelayOnFailover → connectionBackoff.jitterPercent
    if (this.options.retryDelayOnFailover !== undefined) {
      // Convert delay (ms) to jitter percentage (5-100%)
      const jitter = Math.min(
        100,
        Math.max(5, Math.round(this.options.retryDelayOnFailover / 5))
      );
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
    const client = (await this.ensureConnected()) as GlideClient;
    return await client.unwatch();
  }

  // KEYS method using SCAN for standalone client
  async keys(pattern: string = '*'): Promise<string[]> {
    const client = (await this.ensureConnected()) as GlideClient;
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

  // PUBLISH method for standalone client - supports hybrid pub/sub modes
  async publish(channel: string, message: string | Buffer): Promise<number> {
    // Debug logging for Socket.IO

    if (this.options.enableEventBasedPubSub) {
      // ioredis-compatible mode: Use direct TCP connection for Socket.IO compatibility
      if (!this.ioredisCompatiblePubSub) {
        const { IoredisPubSubClient } = await import(
          './utils/IoredisPubSubClient'
        );
        this.ioredisCompatiblePubSub = new IoredisPubSubClient(this.options);
        await this.ioredisCompatiblePubSub.connect();
      }
      return await this.ioredisCompatiblePubSub.publish(channel, message);
    } else {
      // Pure GLIDE mode: Use native GLIDE publish
      const client = (await this.ensureConnected()) as GlideClient;

      // Handle binary data encoding for UTF-8 safety
      let publishMessage: string;
      if (message instanceof Buffer || message instanceof Uint8Array) {
        const base64Data = Buffer.from(message).toString('base64');
        publishMessage = StandaloneClient.BINARY_MARKER + base64Data;
      } else {
        publishMessage = String(message);
      }

      return await client.publish(publishMessage, channel);
    }
  }

  // Abstract methods implementation for pub/sub support
  protected async getBaseSubscriberConfig(): Promise<GlideClientConfiguration> {
    return {
      addresses: [
        {
          host: this.options.host || 'localhost',
          port: this.options.port || 6379,
        },
      ],
      clientName: `${this.options.clientName || 'subscriber'}-${Date.now()}`,

      // Copy essential config from main client
      ...(this.options.tls || this.options.useTLS ? { useTLS: true } : {}),
      ...(this.options.db !== undefined && { databaseId: this.options.db }),

      // Authentication mapping
      ...(this.options.username && this.options.password
        ? {
            credentials: {
              username: this.options.username,
              password: this.options.password,
            },
          }
        : {}),
    };
  }

  // Standalone scan implementation using native GLIDE scan method
  async scan(cursor: string, ...args: string[]): Promise<[string, string[]]> {
    const client = (await this.ensureConnected()) as GlideClient;

    // Parse ioredis-style scan arguments into GLIDE options
    const scanOptions: any = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.toUpperCase();
      const value = args[i + 1];

      if (key === 'MATCH' && value) {
        scanOptions.match = value;
      } else if (key === 'COUNT' && value) {
        scanOptions.count = parseInt(value, 10);
      } else if (key === 'TYPE' && value) {
        scanOptions.type = value;
      }
    }

    // Use GLIDE native scan method with string cursor
    const result = await client.scan(cursor, scanOptions);

    if (Array.isArray(result) && result.length === 2) {
      const [nextCursor, keys] = result;
      const cursorStr =
        ParameterTranslator.convertGlideString(nextCursor) || '0';
      const keyArray = Array.isArray(keys)
        ? keys.map(k => ParameterTranslator.convertGlideString(k) || '')
        : [];
      return [cursorStr, keyArray];
    }

    return ['0', []];
  }

  // Key scanning with stream interface (critical for BullMQ cleanup)
  scanStream(options: { match?: string; type?: string; count?: number } = {}) {
    const { Readable } = require('stream');

    class ScanStream extends Readable {
      public cursor: string = '0';
      public finished: boolean = false;
      public client: StandaloneClient;
      public options: any;

      constructor(client: StandaloneClient, options: any) {
        super({ objectMode: true });
        this.client = client;
        this.options = options;
      }

      async _read() {
        if (this.finished) {
          this.push(null);
          return;
        }

        try {
          const result = await this.client.scan(
            this.cursor,
            ...(this.options.match ? ['MATCH', this.options.match] : []),
            ...(this.options.count
              ? ['COUNT', this.options.count.toString()]
              : []),
            ...(this.options.type ? ['TYPE', this.options.type] : [])
          );

          const [newCursor, keys] = result;
          this.cursor = newCursor;

          if (newCursor === '0') {
            this.finished = true;
          }

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

    return new ScanStream(this, options);
  }

  protected async createSubscriberClientFromConfig(
    config: GlideClientConfiguration
  ): Promise<GlideClientType> {
    return await GlideClient.createClient(config);
  }

  protected async createSubscriberClient(): Promise<GlideClientType> {
    const config = await this.getBaseSubscriberConfig();
    return await this.createSubscriberClientFromConfig(config);
  }
}
