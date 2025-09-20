/**
 * StandaloneClient - Internal standalone client implementation
 * Database-agnostic implementation using Valkey GLIDE
 * Not exposed to users directly - wrapped by Redis class for ioredis compatibility
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { BaseClient, GlideClientType } from './BaseClient';
import { ParameterTranslator } from './utils/ParameterTranslator';
import { toGlideStandaloneConfig } from './utils/OptionsMapper';

export class StandaloneClient extends BaseClient {
  protected async createClient(): Promise<GlideClientType> {
    const config: GlideClientConfiguration = toGlideStandaloneConfig(
      this.options
    );
    return await GlideClient.createClient(config);
  }

  get isCluster(): boolean {
    return false;
  }

  // UNWATCH method specific to GlideClient (no parameters)
  async unwatch(): Promise<string> {
    await this.ensureConnection();
    await (this.glideClient as GlideClient).unwatch();
    return 'OK';
  }

  // KEYS method using SCAN for standalone client
  async keys(pattern: string = '*'): Promise<string[]> {
    await this.ensureConnection();
    const allKeys: string[] = [];
    let cursor = '0';

    do {
      const result = await (this.glideClient as GlideClient).scan(cursor, {
        match: pattern,
        count: 1000,
      });
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
    await this.ensureConnection();

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
      // Performance optimization: Use synchronous access in hot path

      // Handle binary data encoding for UTF-8 safety
      let publishMessage: string;
      if (message instanceof Buffer || message instanceof Uint8Array) {
        const base64Data = Buffer.from(message).toString('base64');
        publishMessage = StandaloneClient.BINARY_MARKER + base64Data;
      } else {
        publishMessage = String(message);
      }

      return await (this.glideClient as GlideClient).publish(
        publishMessage,
        channel
      );
    }
  }

  // Abstract methods implementation for pub/sub support
  protected async getBaseSubscriberConfig(): Promise<GlideClientConfiguration> {
    await this.ensureConnection();
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
    await this.ensureConnection();
    // Performance optimization: Use synchronous access in hot path

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
    const result = await (this.glideClient as GlideClient).scan(
      cursor,
      scanOptions
    );

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
  async scanStream(
    options: { match?: string; type?: string; count?: number } = {}
  ) {
    await this.ensureConnection();
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

    return await new ScanStream(this, options);
  }

  protected async createSubscriberClientFromConfig(
    config: GlideClientConfiguration
  ): Promise<GlideClientType> {
    await this.ensureConnection();
    return await GlideClient.createClient(config);
  }

  protected async createSubscriberClient(): Promise<GlideClientType> {
    await this.ensureConnection();
    const config = await this.getBaseSubscriberConfig();
    return await this.createSubscriberClientFromConfig(config);
  }
}
