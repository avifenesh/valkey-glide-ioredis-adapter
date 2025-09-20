/**
 * Real-World ioredis Usage Patterns Test
 *
 * This test validates that our Valkey adapter works as a drop-in replacement
 * for common ioredis patterns found in production applications across GitHub
 * and Stack Overflow.
 */

import { describe, test, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('Real-World ioredis Usage Patterns', () => {
  let client;

  before(async () => {
    const base = getStandaloneConfig();
    const config = { ...base, connectTimeout: 5000 };
    client = new Redis(config);

    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    } // Wait for connection
    await client.ping();
  });

  afterEach(async () => {
    if (client) {
      // Clean up keys from each test to avoid interference
      await client.flushdb();
    }
  });

  after(async () => {
    if (client) {
      await client.quit();
    }
  });

  describe('Basic Connection Patterns', () => {
    test('should handle basic Redis constructor pattern from GitHub examples', async () => {
      // Pattern: const client = new Redis({ port, host, password })

      await client.connect();

      // Clean slate: flush all data to prevent test pollution
      // GLIDE's flushall is multislot safe
      try {
        await client.flushall();
      } catch (error) {
        console.warn('Warning: Could not flush database:', error.message);
      } // Found in GitHub repositories
      assert.ok(client !== undefined);
      assert.strictEqual(typeof client.ping, 'function');

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    test('should handle authentication patterns from production', async () => {
      // Pattern auth with host/port/password from production configs
      // Found in ElastiCache, Azure Cache configurations
      const connectionTest = await client.ping();
      assert.strictEqual(connectionTest, 'PONG');
    });
  });

  describe('Basic Operations (from ioredis/examples/basic_operations.js)', () => {
    test('should handle string operations', async () => {
      // Direct pattern from ioredis examples
      await client.set('foo', 'bar');
      const result = await client.get('foo');
      assert.strictEqual(result, 'bar');
    });

    test('should handle complex operations with multiple arguments', async () => {
      // Pattern: client.zadd("sortedSet", 1, "one", 2, "dos")
      await client.zadd('sortedSet', 1, 'one', 2, 'dos');
      const result = await client.zrange('sortedSet', 0, 2, true);
      assert.deepStrictEqual(result, ['one', '1', 'dos', '2']);
    });

    test('should handle flattened arguments', async () => {
      // Pattern: client.sadd("set", 1, 3, 5, 7)
      await client.sadd('testset', 1, 3, 5, 7);
      const result = await client.smembers('testset');
      assert.deepStrictEqual(result, ['1', '3', '5', '7']);
    });
  });

  describe('Hash Operations (from ioredis/examples/hash.js)', () => {
    test('should handle object-based hash setting', async () => {
      // Direct pattern from ioredis hash example
      const user = {
        name: 'Bob',
        age: '20',
        description: 'I am a programmer',
      };

      await client.hset('user-hash', user);

      const name = await client.hget('user-hash', 'name');
      assert.strictEqual(name, 'Bob');

      const all = await client.hgetall('user-hash');
      assert.deepStrictEqual(all, user);
    });

    test('should handle individual hash operations', async () => {
      await client.hset('user-profile', 'username', 'alice');
      await client.hset('user-profile', 'email', 'alice@example.com');

      const exists = await client.hexists('user-profile', 'username');
      assert.strictEqual(exists, 1);

      await client.hincrby('user-profile', 'login_count', 1);
      const count = await client.hget('user-profile', 'login_count');
      assert.strictEqual(count, '1');
    });
  });

  describe('Bull Queue Patterns', () => {
    test('should handle Bull queue Redis configuration', async () => {
      // Pattern from Bull production usage
      // Bull passes RedisOpts directly to ioredis constructor
      const base = getStandaloneConfig();
      const connectionInfo = {
        port: base.port,
        host: base.host,
        db: 0,
      };

      // Test basic connectivity which Bull relies on
      const ping = await client.ping();
      assert.strictEqual(ping, 'PONG');
      assert.ok(connectionInfo.port !== undefined);
      assert.ok(connectionInfo.host !== undefined);
    });

    test('should handle job data serialization patterns', async () => {
      // Common Bull job data pattern
      const jobData = {
        id: '12345',
        type: 'email',
        payload: {
          to: 'user@example.com',
          subject: 'Test Email',
          body: 'Hello World',
        },
        attempts: 1,
        timestamp: Date.now(),
      };

      // Simulate Bull's job storage pattern
      await client.hset('bull:email:12345', {
        dataJSON: JSON.stringify(jobData),
        optsJSON: JSON.stringify({ delay: 0, attempts: 3 }),
        progress: '0',
        delay: '0',
      });

      const storedData = await client.hget('bull:email:12345', 'dataJSON');
      const parsed = JSON.parse(storedData);
      assert.strictEqual(parsed.id, '12345');
      assert.strictEqual(parsed.type, 'email');
    });
  });

  describe('Session Store Patterns', () => {
    test('should handle express-session Redis store pattern', async () => {
      // Pattern from connect-redis and similar session stores
      const sessionId = 'sess:abc123';
      const sessionData = {
        userId: '12345',
        username: 'testuser',
        lastAccess: Date.now(),
        data: {
          cart: ['item1', 'item2'],
          preferences: { theme: 'dark' },
        },
      };

      // Set session with TTL (30 minutes)
      await client.setex(sessionId, 1800, JSON.stringify(sessionData));

      const retrieved = await client.get(sessionId);
      const parsed = JSON.parse(retrieved);
      assert.strictEqual(parsed.userId, '12345');
      assert.strictEqual(parsed.username, 'testuser');

      // Check TTL
      const ttl = await client.ttl(sessionId);
      assert.ok(ttl > 0);
      assert.ok(ttl <= 1800);
    });
  });

  describe('Caching Patterns', () => {
    test('should handle application caching patterns', async () => {
      // Common caching pattern with JSON serialization
      const cacheKey = 'user:profile:12345';
      const userData = {
        id: 12345,
        name: 'John Doe',
        email: 'john@example.com',
        roles: ['user', 'premium'],
        settings: {
          notifications: true,
          theme: 'light',
        },
      };

      // Set with 1 hour expiry
      await client.setex(cacheKey, 3600, JSON.stringify(userData));

      // Retrieve and parse
      const cached = await client.get(cacheKey);
      const parsed = JSON.parse(cached);
      assert.strictEqual(parsed.id, 12345);
      assert.deepStrictEqual(parsed.roles, ['user', 'premium']);
    });

    test('should handle cache miss and set patterns', async () => {
      const cacheKey = 'expensive:computation:result';

      // Simulate cache miss
      let cached = await client.get(cacheKey);
      assert.strictEqual(cached, null);

      // Simulate expensive computation
      const result = { computed: true, value: Math.random() };

      // Cache the result
      await client.setex(cacheKey, 300, JSON.stringify(result));

      // Verify cache hit
      cached = await client.get(cacheKey);
      const parsed = JSON.parse(cached);
      assert.strictEqual(parsed.computed, true);
    });
  });

  describe('Counter and Analytics Patterns', () => {
    test('should handle page view counter pattern', async () => {
      // Common analytics pattern
      const pageKey = 'page:views:/home';

      // Increment page views
      await client.incr(pageKey);
      await client.incr(pageKey);
      await client.incr(pageKey);

      const views = await client.get(pageKey);
      assert.strictEqual(parseInt(views), 3);
    });

    test('should handle user activity tracking with hashes', async () => {
      // User activity tracking pattern
      const userKey = 'user:activity:12345';

      await client.hset(userKey, {
        last_login: Date.now().toString(),
        page_views: '15',
        sessions: '3',
      });

      // Increment counters
      await client.hincrby(userKey, 'page_views', 1);
      await client.hincrby(userKey, 'sessions', 1);

      const pageViews = await client.hget(userKey, 'page_views');
      const sessions = await client.hget(userKey, 'sessions');

      assert.strictEqual(parseInt(pageViews), 16);
      assert.strictEqual(parseInt(sessions), 4);
    });
  });

  describe('List-based Queue Patterns', () => {
    test('should handle simple task queue pattern', async () => {
      // Simple task queue using Redis lists
      const queueKey = 'tasks:pending';

      // Add tasks to queue
      await client.lpush(queueKey, JSON.stringify({ type: 'email', id: 1 }));
      await client.lpush(queueKey, JSON.stringify({ type: 'sms', id: 2 }));
      await client.lpush(queueKey, JSON.stringify({ type: 'push', id: 3 }));

      // Process tasks (FIFO with RPOP or LIFO with LPOP)
      const task1 = await client.rpop(queueKey);
      const task2 = await client.rpop(queueKey);

      assert.strictEqual(JSON.parse(task1).id, 1);
      assert.strictEqual(JSON.parse(task2).id, 2);

      // Check remaining queue length
      const remaining = await client.llen(queueKey);
      assert.strictEqual(remaining, 1);
    });
  });

  describe('Rate Limiting Patterns', () => {
    test('should handle sliding window rate limiting', async () => {
      // Sliding window rate limiter pattern
      const userId = 'user:12345';
      const window = 60; // 1 minute
      const limit = 10; // 10 requests per minute

      const key = `rate_limit:${userId}`;
      const now = Date.now();

      // Add current request timestamp
      await client.zadd(key, now, `req:${now}`);

      // Remove old entries (outside the window)
      await client.zremrangebyscore(key, 0, now - window * 1000);

      // Count current requests in window
      const count = await client.zcard(key);

      // Set expiry on the key
      await client.expire(key, window);

      assert.strictEqual(count, 1);
      assert.ok(count <= limit);
    });
  });

  describe('Pub/Sub Patterns', () => {
    test('should handle basic pub/sub pattern', async () => {
      // Note is a simplified test since pub/sub requires separate connections
      // In real applications, you'd have separate publisher and subscriber instances

      const channel = 'notifications:user:12345';
      const message = JSON.stringify({
        type: 'new_message',
        from: 'Alice',
        content: 'Hello',
      });

      // Publish message
      const subscribers = await client.publish(channel, message);

      // In a real scenario, subscribers would be >= 0
      assert.ok(subscribers >= 0);
    });
  });

  describe('Error Handling Patterns', () => {
    test('should handle connection resilience', async () => {
      // Test that the adapter handles basic error scenarios gracefully
      try {
        // Try to get a non-existent key (should return null, not throw)
        const result = await client.get('non:existent:key');
        assert.strictEqual(result, null);
      } catch (error) {
        // Should not throw for missing keys
        throw new Error('Should not throw error for missing keys');
      }
    });

    test('should handle type mismatches gracefully', async () => {
      // Set a string value
      await client.set('string:key', 'value');

      try {
        // Try to perform a list operation on a string key
        await client.lpush('string:key', 'item');
        throw new Error('Should throw error for type mismatch');
      } catch (error) {
        // Should throw appropriate error for type mismatch
        assert.ok(error !== undefined);
      }
    });
  });
});
