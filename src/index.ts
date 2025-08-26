/**
 * Main entry point for ioredis adapter
 */

export { RedisAdapter } from './adapters/RedisAdapter';
export * from './types';

// Default export for CommonJS compatibility (ioredis style)
import { RedisAdapter } from './adapters/RedisAdapter';
export default RedisAdapter;