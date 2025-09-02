/**
 * GLIDE Utilities
 *
 * Utility functions for working with GLIDE clients and making them more ioredis-compatible.
 */

import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';

/**
 * Async wrapper for GLIDE client close method
 *
 * GLIDE's close() method is synchronous and can throw ClosingError synchronously
 * due to internal promise rejections. This wrapper makes it async and ioredis-compatible.
 *
 * @param client GLIDE client to close
 * @param reason Optional reason for closing
 * @returns Promise that resolves when close is complete
 */
export async function asyncClose(
  client: GlideClient | GlideClusterClient,
  reason: string = 'Connection closed'
): Promise<void> {
  return new Promise<void>(resolve => {
    // Defer the actual close to next tick to avoid synchronous ClosingError
    setTimeout(() => {
      try {
        client.close(reason);
      } catch (error) {
        // Silently ignore close errors - they're expected during shutdown
        // This includes ClosingError from GLIDE's internal promise rejections
      }
      resolve();
    }, 0);
  });
}

/**
 * Check if a GLIDE client is closed
 *
 * @param client GLIDE client to check
 * @returns true if client is closed, false otherwise
 */
export function isClientClosed(
  client: GlideClient | GlideClusterClient
): boolean {
  try {
    // @ts-ignore - accessing internal property to check state
    return client.isClosed === true;
  } catch {
    // If we can't access the property, assume it's closed
    return true;
  }
}

/**
 * Safe close that checks if client is already closed before attempting to close
 *
 * @param client GLIDE client to close
 * @param reason Optional reason for closing
 * @returns Promise that resolves when close is complete
 */
export async function safeClose(
  client: GlideClient | GlideClusterClient,
  reason: string = 'Connection closed'
): Promise<void> {
  if (isClientClosed(client)) {
    return; // Already closed
  }

  return asyncClose(client, reason);
}
