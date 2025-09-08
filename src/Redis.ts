/**
 * Redis - Valkey Standalone client (External API)
 *
 * Drop-in replacement for ioredis Redis class using Valkey GLIDE.
 * Wraps internal StandaloneClient with ioredis-compatible naming.
 */

import { StandaloneClient } from './StandaloneClient';
import { RedisOptions } from './types';

export class Redis extends StandaloneClient {
  /**
   * ioredis-compatible constructors.
   * Supports multiple constructor signatures for backward compatibility.
   */
  constructor();
  constructor(port: number);
  constructor(port: number, host: string);
  constructor(port: number, host: string, options: RedisOptions);
  constructor(options: RedisOptions);
  constructor(url: string);
  constructor(
    portOrOptions?: number | RedisOptions | string,
    host?: string,
    options?: RedisOptions
  ) {
    let parsedOptions: RedisOptions = {};

    if (typeof portOrOptions === 'number') {
      parsedOptions = {
        port: portOrOptions,
        host: host || 'localhost',
        ...options,
      };
    } else if (typeof portOrOptions === 'string') {
      parsedOptions = parseUrl(portOrOptions);
    } else if (portOrOptions && typeof portOrOptions === 'object') {
      parsedOptions = portOrOptions;
    }

    super(parsedOptions);
  }

  /**
   * Bull/BullMQ createClient factory method.
   * @param type - Client type: 'client', 'subscriber', or 'bclient' (blocking client)
   * @param options - Valkey connection options
   * @returns New Redis instance
   */
  static createClient(
    type: 'client' | 'subscriber' | 'bclient',
    options: RedisOptions
  ): Redis {
    const client = new Redis(options);
    (client as any).clientType = type;

    if (type === 'bclient') {
      (client as any).enableBlockingOps = true;
    }

    return client;
  }

  /**
   * Creates a duplicate instance with optional overrides.
   * ioredis behavior: duplicate() auto-connects if the source is connected
   * @param override - Optional configuration overrides
   * @returns New Redis instance with same or modified configuration
   */
  duplicate(override?: Partial<RedisOptions>): Redis {
    const duplicated = new Redis({ ...this.options, ...override });

    if ((this as any).clientType) {
      (duplicated as any).clientType = (this as any).clientType;
    }
    if ((this as any).enableBlockingOps) {
      (duplicated as any).enableBlockingOps = (this as any).enableBlockingOps;
    }

    (duplicated as any)._options = duplicated.options;

    // ioredis auto-connects duplicated instances if the source is connected
    // This is critical for BullMQ which expects duplicate() to return a connected instance
    if (this.status === 'ready' || this.status === 'connecting') {
      // Store auto-connect promise to prevent event loop warnings
      const autoConnectPromise = new Promise<void>((resolve) => {
        // Use process.nextTick instead of setImmediate to avoid event loop issues
        // Also check if the duplicated instance is already closing
        process.nextTick(() => {
          if (!duplicated.isClosing && duplicated.status === 'disconnected') {
            duplicated.connect()
              .then(() => resolve())
              .catch(err => {
                // Only emit error if not closing
                if (!duplicated.isClosing) {
                  duplicated.emit('error', err);
                }
                resolve(); // Resolve even on error to prevent hanging
              });
          } else {
            resolve(); // Already closing or connected
          }
        });
      });
      
      // Store the promise so it can be awaited if needed
      (duplicated as any)._autoConnectPromise = autoConnectPromise;
    }

    return duplicated;
  }
}

/**
 * Parses Valkey connection URL into options object.
 * @param url - Connection URL string (supports redis:// and rediss:// for compatibility)
 * @returns Parsed connection options
 * @private
 */
function parseUrl(url: string): RedisOptions {
  try {
    if (!url.includes('://')) {
      const [host, portStr] = url.split(':');
      return {
        host: host || 'localhost',
        port: parseInt(portStr || '6379', 10) || 6379,
      };
    }

    const parsed = new URL(url);
    const result: RedisOptions = {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
    };

    if (parsed.username) result.username = parsed.username;
    if (parsed.password) result.password = parsed.password;
    if (parsed.pathname && parsed.pathname !== '/') {
      result.db = parseInt(parsed.pathname.slice(1), 10) || 0;
    }
    // Support rediss:// for TLS (maintained for ioredis compatibility)
    if (parsed.protocol === 'rediss:') result.tls = true;

    return result;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}

export default Redis;
