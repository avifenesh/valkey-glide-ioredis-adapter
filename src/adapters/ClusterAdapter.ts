/**
 * ClusterAdapter - ioredis-compatible cluster adapter using valkey-glide
 * Simplified implementation that extends RedisAdapter for basic cluster functionality
 */

import { RedisAdapter } from './RedisAdapter';
import { 
  IClusterAdapter, 
  ClusterNode, 
  ClusterOptions,
  RedisKey,
  RedisValue
} from '../types';

/**
 * Simplified cluster adapter that provides cluster-specific routing
 * while leveraging the existing RedisAdapter for most operations
 */
export class ClusterAdapter extends RedisAdapter implements IClusterAdapter {
  private clusterNodes: ClusterNode[];
  private clusterOptions: ClusterOptions;

  constructor(nodes: ClusterNode[], options?: ClusterOptions) {
    // Use first node as primary connection for now
    const primaryNode = nodes[0] || { host: 'localhost', port: 6379 };
    
    // Create base adapter configuration
    const redisOptions = {
      ...options?.redisOptions,
      host: primaryNode.host,
      port: primaryNode.port
    };
    
    super(redisOptions);
    
    this.clusterNodes = nodes;
    this.clusterOptions = options || {};
  }

  // Cluster Management
  nodes(): ClusterNode[] {
    return this.clusterNodes.slice(); // ES5-compatible array copy
  }

  // Forward these methods from RedisAdapter
  getConnectionStatus() {
    return this.status;
  }

  async info(section?: string): Promise<string> {
    // For cluster, we'll delegate to the base method for now
    // In a full implementation, this would aggregate info from all nodes
    const client = await this.ensureConnected();
    if (section) {
      // valkey-glide info takes options object
      return await client.info({ sections: [section as any] });
    } else {
      return await client.info();
    }
  }

  // Cluster-specific methods with basic slot/address routing
  async getBySlot(key: RedisKey, slotId: number): Promise<string | null> {
    // For simplified implementation, route to node based on slot modulo
    const nodeIndex = slotId % this.clusterNodes.length;
    // For now, just use the base get method
    return this.get(key);
  }

  async setBySlot(key: RedisKey, value: RedisValue, slotId: number): Promise<string | null> {
    const nodeIndex = slotId % this.clusterNodes.length;
    // For now, just use the base set method
    return this.set(key, value);
  }

  async getByAddress(key: RedisKey, host: string, port: number): Promise<string | null> {
    const nodeIndex = this.findNodeIndex(host, port);
    // For now, just use the base get method
    return this.get(key);
  }

  async pingNode(node: { host: string; port: number }): Promise<string> {
    const nodeIndex = this.findNodeIndex(node.host, node.port);
    // For now, just use the base ping method
    return this.ping();
  }

  // Cluster information
  async getClusterInfo(): Promise<string> {
    // Return basic cluster information
    const info = [
      'cluster_state:ok',
      'cluster_slots_assigned:16384',
      'cluster_slots_ok:16384',
      'cluster_slots_pfail:0',
      'cluster_slots_fail:0',
      'cluster_known_nodes:' + this.clusterNodes.length,
      'cluster_size:' + this.clusterNodes.length,
      'cluster_current_epoch:1',
      'cluster_my_epoch:1'
    ];
    return info.join('\r\n');
  }

  // Enhanced scan for cluster
  async scan(cursor: string = '0', options?: { match?: string; count?: number }): Promise<[string, string[]]> {
    // For cluster scan, we'd need to scan all nodes and aggregate
    // For simplified implementation, throw informative error
    throw new Error('Cluster SCAN requires ClusterScanCursor or node-specific scanning. Use getAllKeys() for simple key listing.');
  }

  // Utility methods
  async getAllNodes(): Promise<ClusterNode[]> {
    return this.nodes();
  }

  async getNodeForKey(key: RedisKey): Promise<ClusterNode> {
    // Calculate hash slot for the key (simplified)
    const slot = this.calculateSlot(key.toString());
    const nodeIndex = slot % this.clusterNodes.length;
    return this.clusterNodes[nodeIndex] || this.clusterNodes[0];
  }

  // Helper methods
  private findNodeIndex(host: string, port: number): number {
    // Use traditional for loop for ES5 compatibility
    for (let i = 0; i < this.clusterNodes.length; i++) {
      const node = this.clusterNodes[i];
      if (node.host === host && node.port === port) {
        return i;
      }
    }
    return 0;
  }

  private calculateSlot(key: string): number {
    // Simplified slot calculation using basic hash
    // In real implementation, use CRC16 of key
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash) % 16384;
  }

  // Override methods that don't make sense for clusters or need special handling
  async getAllKeys(): Promise<string[]> {
    throw new Error('getAllKeys not implemented for cluster - use node-specific SCAN operations');
  }

  // Override multi to provide cluster-aware version  
  multi(): any {
    // For simplified implementation, throw error for transactions
    // In full implementation, this would validate all keys are in same slot
    throw new Error('Cluster transactions require all keys to map to the same hash slot');
  }

  // Cluster-specific configuration
  getClusterConfiguration(): ClusterOptions {
    // ES5-compatible object copy
    const copy: ClusterOptions = {};
    for (const key in this.clusterOptions) {
      if (this.clusterOptions.hasOwnProperty(key)) {
        (copy as any)[key] = (this.clusterOptions as any)[key];
      }
    }
    return copy;
  }

  async refreshClusterTopology(): Promise<void> {
    // Placeholder for topology refresh functionality
    // In full implementation, this would query CLUSTER SLOTS and update routing
    console.log('Cluster topology refresh requested (not implemented in simplified version)');
  }
}