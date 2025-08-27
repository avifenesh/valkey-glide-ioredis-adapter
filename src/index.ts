/**
 * Main entry point for ioredis adapter
 */

// Export both the original monolithic adapter and the new modular ones
export { RedisAdapter } from './adapters/RedisAdapter';
export { ModularRedisAdapter } from './adapters/ModularRedisAdapter';
export { ClusterAdapter } from './adapters/ClusterAdapter';
export { BaseClusterAdapter, ClusterOptions } from './adapters/BaseClusterAdapter';
export * from './types';

// Use the new modular adapter as the default export
import { ModularRedisAdapter } from './adapters/ModularRedisAdapter';
export default ModularRedisAdapter;