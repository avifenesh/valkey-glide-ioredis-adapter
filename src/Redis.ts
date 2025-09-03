/**
 * Redis - Standalone client (External API)
 * Drop-in replacement for ioredis Redis class
 * Wraps internal StandaloneClient with ioredis-compatible naming
 */

import { StandaloneClient } from './StandaloneClient';
import { RedisOptions } from './types';

export class Redis extends StandaloneClient {
  // ioredis-style constructors
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
    // Parse constructor arguments ioredis-style
    let parsedOptions: RedisOptions = {};

    if (typeof portOrOptions === 'number') {
      parsedOptions = {
        port: portOrOptions,
        host: host || 'localhost',
        ...options,
      };
    } else if (typeof portOrOptions === 'string') {
      // URL parsing
      parsedOptions = parseUrl(portOrOptions);
    } else if (portOrOptions && typeof portOrOptions === 'object') {
      parsedOptions = portOrOptions;
    }

    super(parsedOptions);
  }

  // Bull/BullMQ createClient factory method
  static createClient(
    type: 'client' | 'subscriber' | 'bclient',
    options: RedisOptions
  ): Redis {
    const client = new Redis(options);
    (client as any).clientType = type;

    // Enable blocking operations for bclient type
    if (type === 'bclient') {
      (client as any).enableBlockingOps = true;
    }

    return client;
  }

  // ioredis compatibility method
  duplicate(override?: Partial<RedisOptions>): Redis {
    const duplicated = new Redis({ ...this.options, ...override });

    // Preserve client type and custom properties
    if ((this as any).clientType) {
      (duplicated as any).clientType = (this as any).clientType;
    }
    if ((this as any).enableBlockingOps) {
      (duplicated as any).enableBlockingOps = (this as any).enableBlockingOps;
    }

    // ioredis compatibility - expose options as _options
    (duplicated as any)._options = duplicated.options;

    return duplicated;
  }

}

function parseUrl(url: string): RedisOptions {
  try {
    // Handle simple hostname formats (BullMQ compatibility)
    if (!url.includes('://')) {
      // Simple hostname like "localhost" or "localhost:6379"
      const [host, portStr] = url.split(':');
      return {
        host: host || 'localhost',
        port: parseInt(portStr || '6379') || 6379,
      };
    }

    // Full URL format
    const parsed = new URL(url);
    const result: RedisOptions = {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
    };

    if (parsed.username) result.username = parsed.username;
    if (parsed.password) result.password = parsed.password;
    if (parsed.pathname && parsed.pathname !== '/') {
      result.db = parseInt(parsed.pathname.slice(1)) || 0;
    }
    if (parsed.protocol === 'rediss:') result.tls = true;

    return result;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}

// Default export for ioredis compatibility
export default Redis;
