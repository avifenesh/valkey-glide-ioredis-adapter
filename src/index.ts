/**
 * Main entry point for ioredis adapter
 * Drop-in replacement for ioredis with Valkey GLIDE backend
 */

// Primary exports - drop-in ioredis compatibility
export { default as Redis } from './Redis';
export { Cluster } from './Cluster';
export * from './types';

// Default export (most common usage: import Redis from 'package')
import Redis from './Redis';
export default Redis;
