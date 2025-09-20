/**
 * Cluster - Valkey Cluster client (External API)
 *
 * Drop-in replacement for ioredis Cluster class.
 * Wraps internal ClusterClient with ioredis-compatible naming.
 */

import { ClusterClient, ClusterNode, ClusterOptions } from './ClusterClient';

export { ClusterNode, ClusterOptions };

export class Cluster extends ClusterClient {
  /**
   * Creates a new Cluster instance.
   * @param nodes - Array of cluster node configurations
   * @param options - Cluster connection options
   */
  constructor(nodes: ClusterNode[], options: ClusterOptions = {}) {
    super(nodes, options);
  }

  /**
   * Bull/BullMQ createClient factory method.
   * @param type - Client type: 'client', 'subscriber', or 'bclient'
   * @param options - Cluster options including nodes array
   * @returns New Cluster instance
   */
  static createClient(
    type: 'client' | 'subscriber' | 'bclient',
    options: ClusterOptions & { nodes: ClusterNode[] }
  ): Cluster {
    const client = new Cluster(options.nodes, options);
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
   * @returns New Cluster instance with same or modified configuration
   */
  duplicate(override?: Partial<ClusterOptions>): Cluster {
    const duplicated = new Cluster(this.clusterNodes, {
      ...this.clusterOptions,
      ...override,
    });

    if ((this as any).enableBlockingOps) {
      (duplicated as any).enableBlockingOps = (this as any).enableBlockingOps;
    }
    if ((this as any).clientType) {
      (duplicated as any).clientType = (this as any).clientType;
    }

    // ioredis auto-connects duplicated instances if the source is connected
    // This is critical for BullMQ which expects duplicate() to return a connected instance
    if (this.status === 'ready' || this.status === 'connecting') {
      // Store auto-connect promise to prevent event loop warnings
      const autoConnectPromise = new Promise<void>(resolve => {
        // Use process.nextTick instead of setImmediate to avoid event loop issues
        // Also check if the duplicated instance is already closing
        process.nextTick(() => {
          if (!duplicated.isClosing && duplicated.status === 'disconnected') {
            duplicated
              .connect()
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

export default Cluster;
