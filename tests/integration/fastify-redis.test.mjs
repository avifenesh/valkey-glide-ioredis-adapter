/**
 * Fastify Redis Plugin Integration Tests
 * Tests compatibility with @fastify/redis which uses ioredis internally
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pkg from "../../dist/index.js";
const { Redis } = pkg;
import clusterPkg from '../../dist/Cluster.js';
const { Cluster } = clusterPkg;

describe('Fastify Redis Plugin Compatibility', () => {
  let client;

  afterEach(async () => {
    if (client) {
      await client.flushdb();
      await client.disconnect();
      client = null;
    }
  });

  describe('Basic Operations (as used by fastify/redis)', () => {
    beforeEach(async () => {
      // Fastify plugin typically creates client like this
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6379'),
        family: 4,
        // Common fastify options
        lazyConnect: false,
        showFriendlyErrorStack: true,
      });
      await client.connect();
    });

    it('should handle GET/SET operations with callbacks (fastify pattern)', async () => {
      // Fastify often uses callback style
      await new Promise((resolve, reject) => {
        client.set('fastify:key', 'value', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await new Promise((resolve, reject) => {
        client.get('fastify:key', (err, val) => {
          if (err) reject(err);
          else {
            assert.strictEqual(val, 'value');
            resolve();
          }
        });
      });
    });

    it('should support promise-based operations', async () => {
      // Modern fastify apps use promises
      await client.set('fastify:promise', 'test');
      const value = await client.get('fastify:promise');
      assert.strictEqual(value, 'test');
    });

    it('should handle multiple key operations', async () => {
      // Common pattern in fastify apps
      await client.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');
      const values = await client.mget('key1', 'key2', 'key3');
      assert.deepStrictEqual(values, ['val1', 'val2', 'val3']);
    });

    it('should support hash operations for session data', async () => {
      // Common for session storage
      const sessionId = 'sess:123456';
      await client.hset(sessionId, {
        userId: '42',
        username: 'john',
        lastAccess: Date.now().toString(),
      });

      const session = await client.hgetall(sessionId);
      assert.strictEqual(session.userId, '42');
      assert.strictEqual(session.username, 'john');
    });

    it('should handle expiration for cache/session', async () => {
      // Common cache pattern
      await client.setex('fastify:cache:user:1', 60, JSON.stringify({ name: 'John' }));
      const ttl = await client.ttl('fastify:cache:user:1');
      assert.ok(ttl > 0 && ttl <= 60);

      // PX variant for milliseconds
      await client.set('fastify:cache:temp', 'data', 'PX', 5000);
      const pttl = await client.pttl('fastify:cache:temp');
      assert.ok(pttl > 0 && pttl <= 5000);
    });
  });

  describe('Redis Streams (as used in fastify examples)', () => {
    beforeEach(async () => {
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6379'),
      });
      await client.connect();
    });

    it('should handle stream operations like fastify example', async () => {
      const streamKey = 'my awesome fastify stream name';
      
      // Add to stream (fastify example pattern)
      const id = await client.xadd(streamKey, '*', 'hello', 'fastify is awesome');
      assert.ok(id);

      // Read from stream
      const streams = await client.xread('STREAMS', streamKey, '0');
      assert.ok(Array.isArray(streams));
      assert.strictEqual(streams[0][0], streamKey);
      
      const events = streams[0][1];
      assert.ok(events.length > 0);
      
      // Parse like fastify example
      const firstEvent = events[0];
      assert.ok(firstEvent[0]); // ID
      assert.deepStrictEqual(firstEvent[1], ['hello', 'fastify is awesome']);
    });

    it('should support blocking stream reads', async () => {
      const streamKey = 'fastify:stream:blocking';
      
      // Add initial message
      await client.xadd(streamKey, '*', 'type', 'init');
      
      // Non-blocking read
      const result = await client.xread('COUNT', 10, 'STREAMS', streamKey, '0');
      assert.ok(result);
      assert.strictEqual(result[0][0], streamKey);
    });
  });

  describe('Pub/Sub (common in fastify real-time apps)', () => {
    let subscriber;
    let publisher;

    beforeEach(async () => {
      subscriber = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      publisher = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await subscriber.connect();
      await publisher.connect();
    });

    afterEach(async () => {
      if (subscriber) {
        await subscriber.disconnect();
      }
      if (publisher) {
        await publisher.disconnect();
      }
    });

    it('should handle pub/sub for real-time updates', async () => {
      const channel = 'fastify:updates';
      const message = JSON.stringify({ type: 'user-login', userId: 42 });

      const messagePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message not received within timeout'));
        }, 5000);
        
        subscriber.on('message', (ch, msg) => {
          if (ch === channel) {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
      });

      await subscriber.subscribe(channel);
      await new Promise(resolve => setTimeout(resolve, 100));
      await publisher.publish(channel, message);

      const received = await messagePromise;
      assert.strictEqual(received, message);
    });
  });

  describe('Pipeline Operations (batch processing)', () => {
    beforeEach(async () => {
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await client.connect();
    });

    it('should handle pipeline for batch operations', async () => {
      // Common pattern for bulk updates in fastify apps
      const pipeline = client.pipeline();
      
      // Batch user data updates
      pipeline.hset('user:1', 'name', 'Alice');
      pipeline.hset('user:1', 'email', 'alice@example.com');
      pipeline.expire('user:1', 3600);
      
      pipeline.hset('user:2', 'name', 'Bob');
      pipeline.hset('user:2', 'email', 'bob@example.com');
      pipeline.expire('user:2', 3600);
      
      const results = await pipeline.exec();
      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, 6);
      
      // Verify data
      const user1 = await client.hgetall('user:1');
      assert.strictEqual(user1.name, 'Alice');
      assert.strictEqual(user1.email, 'alice@example.com');
    });
  });

  describe('Rate Limiting Patterns', () => {
    beforeEach(async () => {
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await client.connect();
    });

    it('should implement sliding window rate limit', async () => {
      const key = 'rate:api:/users:192.168.1.1';
      const window = 60; // 60 seconds
      const limit = 10; // 10 requests per window
      
      // Add request timestamps
      const now = Date.now();
      const pipeline = client.pipeline();
      
      // Add current request
      pipeline.zadd(key, now, `${now}:${Math.random()}`);
      // Remove old requests outside window
      pipeline.zremrangebyscore(key, '-inf', now - (window * 1000));
      // Count requests in window
      pipeline.zcard(key);
      // Set expiry
      pipeline.expire(key, window + 1);
      
      const results = await pipeline.exec();
      const count = results[2][1];
      
      assert.ok(count <= limit, 'Rate limit not exceeded');
    });

    it('should implement token bucket rate limit', async () => {
      const key = 'bucket:api:/posts:user:1';
      const capacity = 5;
      const refillRate = 1; // 1 token per second
      
      // Initialize bucket
      await client.set(key, capacity);
      await client.expire(key, 60);
      
      // Try to consume tokens
      const consumed = await client.eval(`
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local requested = tonumber(ARGV[2])
        local current = tonumber(redis.call('get', key) or capacity)
        
        if current >= requested then
          redis.call('decrby', key, requested)
          return 1
        else
          return 0
        end
      `, 1, key, capacity, 1);
      
      assert.ok(consumed, 'Token consumed successfully');
      
      const remaining = await client.get(key);
      assert.strictEqual(Number(remaining), capacity - 1);
    });
  });

  describe('Session Storage Patterns', () => {
    beforeEach(async () => {
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await client.connect();
    });

    it('should handle session storage like fastify-session-redis-store', async () => {
      const sessionId = 'sess:' + Math.random().toString(36).substr(2);
      const sessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000).toISOString(),
          httpOnly: true,
          path: '/',
        },
        userId: 42,
        username: 'johndoe',
        roles: ['user', 'admin'],
      };
      
      // Store session
      await client.set(sessionId, JSON.stringify(sessionData), 'EX', 86400);
      
      // Retrieve session
      const stored = await client.get(sessionId);
      const parsed = JSON.parse(stored);
      
      assert.strictEqual(parsed.userId, 42);
      assert.strictEqual(parsed.username, 'johndoe');
      assert.deepStrictEqual(parsed.roles, ['user', 'admin']);
      
      // Touch session (update TTL)
      await client.expire(sessionId, 86400);
      const ttl = await client.ttl(sessionId);
      assert.ok(ttl > 86000);
    });
  });

  describe('Caching Patterns', () => {
    beforeEach(async () => {
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await client.connect();
    });

    it('should implement cache-aside pattern', async () => {
      const cacheKey = 'cache:product:123';
      
      // Cache miss simulation
      let cached = await client.get(cacheKey);
      if (!cached) {
        // Simulate DB fetch
        const product = { id: 123, name: 'Widget', price: 29.99 };
        await client.set(cacheKey, JSON.stringify(product), 'EX', 300);
        cached = JSON.stringify(product);
      }
      
      const product = JSON.parse(cached);
      assert.strictEqual(product.id, 123);
      assert.strictEqual(product.name, 'Widget');
    });

    it('should implement cache tags pattern', async () => {
      // Store items with tags
      await client.sadd('tag:electronics', 'product:1', 'product:2', 'product:3');
      await client.sadd('tag:sale', 'product:2', 'product:4');
      
      await client.set('product:1', JSON.stringify({ name: 'Laptop' }));
      await client.set('product:2', JSON.stringify({ name: 'Phone' }));
      await client.set('product:3', JSON.stringify({ name: 'Tablet' }));
      await client.set('product:4', JSON.stringify({ name: 'Watch' }));
      
      // Invalidate by tag
      const toInvalidate = await client.smembers('tag:electronics');
      if (toInvalidate.length > 0) {
        await client.del(...toInvalidate);
      }
      
      // Verify invalidation
      const laptop = await client.get('product:1');
      assert.strictEqual(laptop, null);
    });
  });

  describe('Distributed Locking (Redlock pattern)', () => {
    beforeEach(async () => {
      client = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await client.connect();
    });

    it('should implement simple distributed lock', async () => {
      const lockKey = 'lock:resource:123';
      const lockValue = Math.random().toString(36);
      const ttl = 10; // 10 seconds
      
      // Acquire lock
      const acquired = await client.set(lockKey, lockValue, 'NX', 'EX', ttl);
      assert.strictEqual(acquired, 'OK');
      
      // Try to acquire again (should fail)
      const secondAttempt = await client.set(lockKey, 'different', 'NX', 'EX', ttl);
      assert.strictEqual(secondAttempt, null);
      
      // Release lock (only if we own it)
      const released = await client.eval(`
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `, 1, lockKey, lockValue);
      
      assert.strictEqual(released, 1);
    });
  });

  describe('Client Instance Management', () => {
    it('should support providing existing client instance', async () => {
      // Pattern used by fastify plugin
      const existingClient = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      });
      await existingClient.connect();
      
      await existingClient.set('test', 'value');
      const result = await existingClient.get('test');
      assert.strictEqual(result, 'value');
      
      await existingClient.flushdb();
      await existingClient.quit();
    });

    it('should support cluster client instance', async () => {
      // Skip if cluster not available
      if (!process.env.ENABLE_CLUSTER_TESTS) {
        return;
      }
      
      const clusterClient = new Cluster([
        { host: 'localhost', port: 17000 },
        { host: 'localhost', port: 17001 },
        { host: 'localhost', port: 17002 },
      ]);
      
      await clusterClient.connect();
      await clusterClient.set('cluster:test', 'value');
      const result = await clusterClient.get('cluster:test');
      assert.strictEqual(result, 'value');
      
      await clusterClient.quit();
    });
  });
});
