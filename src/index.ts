/**
 * Valkey GLIDE ioredis adapter  
 * High-performance Rust-backed drop-in replacement for ioredis
 * 
 * Architecture:
 * - ioredis API compatibility layer
 * - Valkey GLIDE native client (Rust core)
 * - Parameter/result translation for seamless integration
 */

// Primary exports - drop-in ioredis compatibility
export { default as Redis } from './Redis';
export { Cluster } from './Cluster';
export * from './types';

// Default export (most common usage: import Redis from 'package')
import Redis from './Redis';
export default Redis;
