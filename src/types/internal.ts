/**
 * Internal type definitions for command modules
 * 
 * These interfaces expose protected methods of BaseClient to command modules
 * in a type-safe way, eliminating the need for (client as any) casting.
 */

import { GlideClientType } from '../BaseClient';
import { RedisKey } from './index';

/**
 * Internal client interface for command module access
 * Exposes protected methods that command modules need
 */
export interface IInternalClient {
  // Connection management (note: actually protected in BaseClient)
  ensureConnection(): Promise<void>;
  
  // Key normalization (note: actually protected in BaseClient)
  normalizeKey(key: RedisKey): string;
  
  // Access to underlying GLIDE client
  readonly glideClient: GlideClientType;
  
  // Connection status
  readonly connectionStatus: string;
  readonly isClosing: boolean;
  
  // Options
  readonly options: any;
  readonly keyPrefix?: string;
}

/**
 * Type guard to check if a client implements internal interface
 */
export function isInternalClient(client: any): client is IInternalClient {
  return (
    client &&
    typeof client.ensureConnection === 'function' &&
    typeof client.normalizeKey === 'function'
  );
}

/**
 * Helper to safely cast BaseClient to internal interface
 */
export function asInternal(client: any): IInternalClient {
  if (!isInternalClient(client)) {
    throw new Error('Invalid client: does not implement internal interface');
  }
  return client as IInternalClient;
}