/**
 * Connection utilities to ensure robust standalone Redis/Valkey connections
 * Prevents cluster autodiscovery issues and provides resilient connection handling
 */

import { GlideClient, GlideClientConfiguration, ProtocolVersion } from '@valkey/valkey-glide';
import { RedisOptions } from '../types';

export interface RobustConnectionOptions {
  retryAttempts?: number;
  retryDelay?: number;
  connectionTimeout?: number;
  forceStandalone?: boolean;
}

/**
 * Create a robust GLIDE client configuration that prevents cluster autodiscovery
 */
export function createRobustGlideConfig(
  options: RedisOptions,
  clientName: string = 'ioredis-adapter',
  customOptions: RobustConnectionOptions = {}
): GlideClientConfiguration {
  const {
    connectionTimeout = 5000,
    forceStandalone = true
  } = customOptions;

  const config: GlideClientConfiguration = {
    addresses: [{ host: options.host || 'localhost', port: options.port || 6379 }],
    protocol: ProtocolVersion.RESP3,
    clientName: `${clientName}-${Date.now()}`, // Unique name to avoid conflicts
    requestTimeout: connectionTimeout,
    databaseId: options.db || 0,
  };

  // Add authentication if provided
  if (options.username || options.password) {
    config.credentials = {
      username: options.username || 'default',
      password: options.password!,
    };
  }

  // Add any additional standalone-specific configurations
  // This ensures GLIDE treats this as a pure standalone connection
  if (forceStandalone && config.addresses && config.addresses.length > 0) {
    // Force single address to prevent any cluster behavior
    const firstAddress = config.addresses[0];
    if (firstAddress) {
      config.addresses = [firstAddress];
    }
  }

  return config;
}

/**
 * Create a GLIDE client with robust connection handling and retries
 */
export async function createRobustGlideClient(
  options: RedisOptions,
  clientName: string = 'ioredis-adapter',
  customOptions: RobustConnectionOptions = {}
): Promise<GlideClient> {
  const {
    retryAttempts = 3,
    retryDelay = 1000,
  } = customOptions;

  const config = createRobustGlideConfig(options, clientName, customOptions);
  
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const client = await GlideClient.createClient(config);
      // Immediately test the connection with a ping
      await client.ping();
      return client;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All attempts failed
  const errorMessage = `Failed to create robust GLIDE client '${clientName}' after ${retryAttempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`;
  throw new Error(errorMessage);
}

/**
 * Validate that a GLIDE client is properly connected to a standalone instance
 */
export async function validateStandaloneConnection(client: GlideClient, clientName: string): Promise<void> {
  try {
    // Test basic connectivity
    await client.ping();
    
    // Get server info to verify it's standalone mode (optional validation)
    const info = await client.customCommand(['INFO', 'replication']);
    const infoStr = String(info);
    
    // Just ensure we get some response indicating a working Redis/Valkey server
    if (!infoStr.includes('role:')) {
      throw new Error(`Unexpected server response: ${infoStr.substring(0, 100)}`);
    }
    
  } catch (error) {
    throw new Error(`Connection validation failed for ${clientName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}