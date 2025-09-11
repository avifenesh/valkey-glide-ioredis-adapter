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
      // Don't create unresolved promises - use setImmediate with unref to not block event loop
      setImmediate(() => {
        if (!duplicated.isClosing && duplicated.status === 'disconnected') {
          duplicated.connect().catch(err => {
            // Only emit error if not closing
            if (!duplicated.isClosing) {
              duplicated.emit('error', err);
            }
          });
        }
      }).unref?.();
    }

    return duplicated;
  }

  /**
   * Static methods for emergency cleanup - Bull/BullMQ worker compatibility
   * These methods provide force close functionality when normal queue.close() 
   * doesn't terminate all background connections.
   */

  /**
   * Get the count of all active Redis client instances
   * @returns Number of active client instances
   */
  static getActiveClientCount(): number {
    // Access the global registry through the module system
    const { getGlobalClientRegistry } = require('./BaseClient');
    return getGlobalClientRegistry ? getGlobalClientRegistry().size : 0;
  }

  /**
   * Get details of all active Redis client instances
   * @returns Array of client information objects
   */
  static getActiveClients(): Array<{ id: string; status: string; host?: string; port?: number }> {
    const { getGlobalClientRegistry } = require('./BaseClient');
    if (!getGlobalClientRegistry) return [];
    
    return Array.from(getGlobalClientRegistry()).map((client: any) => ({
      id: client.instanceIdentifier,
      status: client.status,
      host: client.options?.host,
      port: client.options?.port
    }));
  }

  /**
   * Force close all Redis client instances
   * Emergency cleanup method for test environments when Bull workers hang.
   * 
   * Usage in test cleanup:
   * ```typescript
   * after(async () => {
   *   await Redis.forceCloseAllClients();
   * });
   * ```
   * 
   * @param timeout Maximum time to wait for graceful shutdown (default: 1000ms)
   * @returns Promise that resolves when all clients are closed
   */
  static async forceCloseAllClients(timeout: number = 1000): Promise<void> {
    const { getGlobalClientRegistry } = require('./BaseClient');
    if (!getGlobalClientRegistry) return;

    const registry = getGlobalClientRegistry();
    const clients = Array.from(registry);
    if (clients.length === 0) {
      return; // No clients to close
    }

    // First, try graceful shutdown with timeout
    const gracefulPromises = clients.map(async (client: any) => {
      try {
        // Race between graceful disconnect and timeout
        await Promise.race([
          client.disconnect(),
          new Promise((_, reject) => {
            const t = setTimeout(() => reject(new Error('Graceful disconnect timeout')), timeout);
            (t as any).unref?.();
          })
        ]);
      } catch (error) {
        // If graceful fails, we'll handle it in the aggressive phase
      }
    });

    // Wait for all graceful disconnects or timeout
    await Promise.allSettled(gracefulPromises);

    // Aggressive cleanup for any remaining clients
    const remainingClients = Array.from(registry);
    if (remainingClients.length > 0) {
      await Promise.all(remainingClients.map(async (client: any) => {
        try {
          // Force immediate cleanup
          client.isClosing = true;
          client.connectionStatus = 'end';
          
          // Remove all listeners to prevent event loop hanging
          client.removeAllListeners();
          
          // Force close underlying GLIDE clients without waiting
          const glideClient = client.glideClient;
          if (glideClient && typeof glideClient.close === 'function') {
            // Don't await - force immediate close
            glideClient.close().catch(() => {});
          }
          
          const subscriberClient = client.subscriberClient;
          if (subscriberClient && typeof subscriberClient.close === 'function') {
            // Don't await - force immediate close
            subscriberClient.close().catch(() => {});
          }

          // Force close pub/sub clients
          const pubSubClient = client.ioredisCompatiblePubSub;
          if (pubSubClient) {
            pubSubClient.disconnect().catch(() => {});
          }

          // Remove from registry immediately
          registry.delete(client);
        } catch (error) {
          // Ignore all errors during force close
        }
      }));
    }

    // Clear the entire registry as a final step
    registry.clear();

    // Give Node.js event loop a moment to process the closures
    await new Promise(resolve => {
      const t = setTimeout(resolve, 50);
      (t as any).unref?.();
    });
  }

  /**
   * Emergency process termination - use only in test environments
   * when forceCloseAllClients() isn't sufficient for hanging processes.
   * 
   * @param exitCode Process exit code (default: 0)
   */
  static forceTerminate(exitCode: number = 0): never {
    // Immediate cleanup without waiting
    const { getGlobalClientRegistry } = require('./BaseClient');
    if (getGlobalClientRegistry) {
      getGlobalClientRegistry().clear();
    }
    
    // Force immediate process termination
    process.exit(exitCode);
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
