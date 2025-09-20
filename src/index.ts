/**
 * Valkey GLIDE ioredis Adapter
 *
 * High-performance Rust-backed drop-in replacement for ioredis.
 * Provides complete API compatibility while leveraging GLIDE's native performance.
 */

export { default as Redis } from './Redis';
export { Cluster } from './Cluster';
export { SocketFileManager } from './utils/SocketFileManager';
export * from './types';

import Redis from './Redis';
export default Redis;
