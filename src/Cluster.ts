/**
 * Cluster - Valkey/Redis Cluster client (External API)
 * Drop-in replacement for ioredis Cluster class
 * Wraps internal ClusterClient with ioredis-compatible naming
 */

import { ClusterClient, ClusterNode, ClusterOptions } from './ClusterClient';

// Re-export types for external API
export { ClusterNode, ClusterOptions };

export class Cluster extends ClusterClient {
  // ioredis-style constructor
  constructor(nodes: ClusterNode[], options: ClusterOptions = {}) {
    super(nodes, options);
  }

  // Bull/BullMQ createClient factory method
  static createClient(
    type: 'client' | 'subscriber' | 'bclient',
    options: ClusterOptions & { nodes: ClusterNode[] }
  ): Cluster {
    const client = new Cluster(options.nodes, options);
    (client as any).clientType = type;

    // Enable blocking operations for bclient type
    if (type === 'bclient') {
      (client as any).enableBlockingOps = true;
    }

    return client;
  }

  // ioredis compatibility method
  duplicate(override?: Partial<ClusterOptions>): Cluster {
    const duplicated = new Cluster(this.clusterNodes, {
      ...this.clusterOptions,
      ...override,
    });

    // Preserve instance properties
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
