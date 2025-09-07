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

    return duplicated;
  }
}

export default Cluster;
