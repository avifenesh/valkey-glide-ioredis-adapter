/**
 * Key Management Test Suite
 * Tests for TTL, persistence, key operations, and expiration patterns
 *
 * Based on real-world patterns from:
 * - Spotify's session key management
 * - Uber's cache TTL strategies
 * - Amazon's key rotation patterns
 * - Netflix's auto-expiring data
 * - Discord's temporary data cleanup
 */

import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('Key Management - TTL & Persistence Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = {
      host: 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
      lazyConnect: true,
    };
    redis = new Redis(config);

    await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Session Management Patterns', () => {
    test('should handle user session TTL like Spotify', async () => {
      const sessionKey = 'session:user:' + Math.random();
      const sessionData = JSON.stringify({
        userId: '12345',
        loginTime: Date.now(),
        permissions: ['read', 'write'],
        preferences: { theme: 'dark', language: 'en' },
      });

      // Set session with 30-minute TTL
      await redis.setex(sessionKey, 1800, sessionData);

      // Verify TTL is set
      const ttl = await redis.ttl(sessionKey);
      assert.ok(ttl > 1790);
      assert.ok(ttl <= 1800);

      // Verify session data
      const retrievedData = await redis.get(sessionKey);
      assert.strictEqual(retrievedData, sessionData);

      // Extend session TTL (user activity)
      await redis.expire(sessionKey, 3600);

      const newTtl = await redis.ttl(sessionKey);
      assert.ok(newTtl > 3590);
    });

    test('should implement rolling session expiration', async () => {
      const sessionKey = 'rolling:session:' + Math.random();

      await redis.setex(sessionKey, 900, 'session_data'); // 15 minutes

      // Simulate user activity - refresh TTL
      await new Promise(resolve => setTimeout(resolve, 100));
      await redis.expire(sessionKey, 900); // Reset to 15 minutes

      const ttl = await redis.ttl(sessionKey);
      assert.ok(ttl > 890);
    });

    test('should handle session cleanup on logout', async () => {
      const sessionKey = 'logout:session:' + Math.random();

      // Create session
      await redis.setex(sessionKey, 3600, 'active_session');
      assert.strictEqual(await redis.exists(sessionKey), 1);

      // Logout - remove session immediately
      await redis.del(sessionKey);
      assert.strictEqual(await redis.exists(sessionKey), 0);

      // TTL should return -2 (key doesn't exist)
      const ttl = await redis.ttl(sessionKey);
      assert.strictEqual(ttl, -2);
    });
  });

  describe('Cache TTL Strategies', () => {
    test('should implement cache warming with TTL like Uber', async () => {
      const cacheKey = 'cache:route:' + Math.random();

      // Warm cache with long TTL for popular route
      const routeData = JSON.stringify({
        route: 'downtown-airport',
        estimatedTime: 25,
        trafficFactor: 1.2,
        cachedAt: Date.now(),
      });

      await redis.setex(cacheKey, 3600, routeData); // 1 hour cache

      // Verify cache hit
      const cached = await redis.get(cacheKey);
      assert.strictEqual(cached, routeData);

      // Check remaining TTL
      const ttl = await redis.ttl(cacheKey);
      assert.ok(ttl <= 3600);
      assert.ok(ttl > 3500);
    });

    test('should implement staggered cache expiration', async () => {
      const baseKey = 'staggered:cache:' + Math.random();

      // Create multiple cache entries with different TTLs
      await redis.setex(`${baseKey}:priority:high`, 300, 'high_priority_data'); // 5 min
      await redis.setex(
        `${baseKey}:priority:medium`,
        600,
        'medium_priority_data'
      ); // 10 min
      await redis.setex(`${baseKey}:priority:low`, 1200, 'low_priority_data'); // 20 min

      // Verify all exist
      assert.strictEqual(await redis.exists(`${baseKey}:priority:high`), 1);
      assert.strictEqual(await redis.exists(`${baseKey}:priority:medium`), 1);
      assert.strictEqual(await redis.exists(`${baseKey}:priority:low`), 1);

      // Check TTLs are different
      const ttlHigh = await redis.ttl(`${baseKey}:priority:high`);
      const ttlMedium = await redis.ttl(`${baseKey}:priority:medium`);
      const ttlLow = await redis.ttl(`${baseKey}:priority:low`);

      assert.ok(ttlHigh < ttlMedium);
      assert.ok(ttlMedium < ttlLow);
    });

    test('should handle cache refresh patterns', async () => {
      const cacheKey = 'refresh:cache:' + Math.random();

      // Set initial cache
      await redis.setex(cacheKey, 60, 'initial_data');

      // Refresh cache with new data and extended TTL
      await redis.setex(cacheKey, 120, 'refreshed_data');

      const data = await redis.get(cacheKey);
      assert.strictEqual(data, 'refreshed_data');

      const ttl = await redis.ttl(cacheKey);
      assert.ok(ttl > 110);
    });
  });

  describe('Temporary Data Management', () => {
    test('should handle rate limiting windows like Amazon', async () => {
      const rateLimitKey = 'rate:limit:' + Math.random();

      // Set rate limit counter with window expiration
      await redis.setex(rateLimitKey, 3600, '1'); // 1 request in 1 hour window

      // Increment counter (new request)
      const currentCount = await redis.incr(rateLimitKey);
      assert.strictEqual(currentCount, 2);

      // TTL should still be maintained after increment
      const ttl = await redis.ttl(rateLimitKey);
      assert.ok(ttl > 0);
      assert.ok(ttl <= 3600);
    });

    test('should implement OTP expiration like Netflix', async () => {
      const otpKey = 'otp:' + Math.random();
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // OTP expires in 5 minutes
      await redis.setex(otpKey, 300, otpCode);

      // Verify OTP exists and is correct
      const storedOtp = await redis.get(otpKey);
      assert.strictEqual(storedOtp, otpCode);

      // Check TTL
      const ttl = await redis.ttl(otpKey);
      assert.ok(ttl <= 300);
      assert.ok(ttl > 290);

      // Consume OTP (delete after use)
      await redis.del(otpKey);
      assert.strictEqual(await redis.get(otpKey), null);
    });

    test('should handle temporary upload tokens', async () => {
      const tokenKey = 'upload:token:' + Math.random();
      const tokenData = JSON.stringify({
        uploadId: 'upload_123',
        maxSize: 10485760, // 10MB
        allowedTypes: ['image/jpeg', 'image/png'],
        createdAt: Date.now(),
      });

      // Upload token expires in 15 minutes
      await redis.setex(tokenKey, 900, tokenData);

      // Verify token
      const token = await redis.get(tokenKey);
      assert.strictEqual(token, tokenData);

      // Remove token after use
      await redis.del(tokenKey);
      assert.strictEqual(await redis.exists(tokenKey), 0);
    });
  });

  describe('Key Persistence Patterns', () => {
    test('should handle persistent data without TTL', async () => {
      const configKey = 'config:app:' + Math.random();
      const configData = JSON.stringify({
        appName: 'MyApp',
        version: '1.0.0',
        features: { analytics: true, notifications: true },
      });

      // Set without TTL (persistent)
      await redis.set(configKey, configData);

      // TTL should be -1 (no expiration)
      const ttl = await redis.ttl(configKey);
      assert.strictEqual(ttl, -1);

      // Data should persist
      const data = await redis.get(configKey);
      assert.strictEqual(data, configData);
    });

    test('should convert expiring key to persistent', async () => {
      const dataKey = 'convert:persistent:' + Math.random();

      // Initially set with TTL
      await redis.setex(dataKey, 3600, 'temporary_data');

      let ttl = await redis.ttl(dataKey);
      assert.ok(ttl > 0);

      // Make it persistent
      await redis.persist(dataKey);

      ttl = await redis.ttl(dataKey);
      assert.strictEqual(ttl, -1); // No expiration

      const data = await redis.get(dataKey);
      assert.strictEqual(data, 'temporary_data');
    });

    test('should handle key backup and restore patterns', async () => {
      const primaryKey = 'primary:data:' + Math.random();
      const backupKey = 'backup:data:' + Math.random();

      const importantData = JSON.stringify({
        userId: '54321',
        criticalInfo: 'important_business_data',
        timestamp: Date.now(),
      });

      // Store in primary location (with TTL)
      await redis.setex(primaryKey, 7200, importantData);

      // Create backup (persistent)
      await redis.set(backupKey, importantData);

      // Primary should have TTL, backup should not
      assert.ok((await redis.ttl(primaryKey)) > 0);
      assert.strictEqual(await redis.ttl(backupKey), -1);

      // Both should have same data
      assert.strictEqual(await redis.get(primaryKey), importantData);
      assert.strictEqual(await redis.get(backupKey), importantData);
    });
  });

  describe('Key Type and Metadata Operations', () => {
    test('should identify key types for cleanup strategies', async () => {
      const baseKey = 'type:test:' + Math.random();

      // Create different data types
      await redis.set(`${baseKey}`, 'string_value');
      await redis.hset(`${baseKey}:hash`, 'field', 'value');
      await redis.sadd(`${baseKey}:set`, 'member1', 'member2');
      await redis.zadd(`${baseKey}:zset`, 1, 'member1');
      await redis.lpush(`${baseKey}:list`, 'item1');

      // Check types
      assert.strictEqual(await redis.type(`${baseKey}`), 'string');
      assert.strictEqual(await redis.type(`${baseKey}:hash`), 'hash');
      assert.strictEqual(await redis.type(`${baseKey}:set`), 'set');
      assert.strictEqual(await redis.type(`${baseKey}:zset`), 'zset');
      assert.strictEqual(await redis.type(`${baseKey}:list`), 'list');
      assert.strictEqual(await redis.type(`${baseKey}:nonexistent`), 'none');
    });

    test('should handle bulk key operations', async () => {
      const keyPrefix = 'bulk:' + Math.random();
      const keys = [
        `${keyPrefix}:key1`,
        `${keyPrefix}:key2`,
        `${keyPrefix}:key3`,
        `${keyPrefix}:key4`,
      ];

      // Create multiple keys
      for (let i = 0; i < keys.length; i++) {
        await redis.set(keys[i], `value_${i}`);
      }

      // Check all exist
      const existsCount = await redis.exists(...keys);
      assert.strictEqual(existsCount, keys.length);

      // Delete multiple keys
      const deletedCount = await redis.del(...keys);
      assert.strictEqual(deletedCount, keys.length);

      // Verify all deleted
      assert.strictEqual(await redis.exists(...keys), 0);
    });

    test('should handle key pattern matching for maintenance', async () => {
      const prefix = 'pattern:' + Math.random();

      // Create keys with pattern
      await redis.set(`${prefix}:user:123`, 'user_data');
      await redis.set(`${prefix}:user:456`, 'user_data');
      await redis.set(`${prefix}:session:abc`, 'session_data');
      await redis.set(`${prefix}:session:def`, 'session_data');
      await redis.set(`${prefix}:other:xyz`, 'other_data');

      // Find keys by pattern
      const userKeys = await redis.keys(`${prefix}:user:*`);
      assert.strictEqual(userKeys.length, 2);
      assert.strictEqual(
        userKeys.every(key => key.includes('user')),
        true
      );

      const sessionKeys = await redis.keys(`${prefix}:session:*`);
      assert.strictEqual(sessionKeys.length, 2);
      assert.strictEqual(
        sessionKeys.every(key => key.includes('session')),
        true
      );
    });
  });

  describe('Expiration Event Simulation', () => {
    test('should handle near-expiration scenarios', async () => {
      const shortKey = 'short:lived:' + Math.random();

      // Set very short TTL
      await redis.setex(shortKey, 2, 'short_lived_data');

      // Verify exists initially
      assert.strictEqual(await redis.exists(shortKey), 1);
      assert.ok((await redis.ttl(shortKey)) <= 2);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Should be expired
      assert.strictEqual(await redis.exists(shortKey), 0);
      assert.strictEqual(await redis.ttl(shortKey), -2);
      assert.strictEqual(await redis.get(shortKey), null);
    });

    test('should handle TTL updates and cancellations', async () => {
      const mutableKey = 'mutable:ttl:' + Math.random();

      // Set with initial TTL
      await redis.setex(mutableKey, 300, 'mutable_data');
      assert.ok((await redis.ttl(mutableKey)) <= 300);

      // Update TTL to longer duration
      await redis.expire(mutableKey, 600);
      assert.ok((await redis.ttl(mutableKey)) > 500);

      // Cancel expiration (make persistent)
      await redis.persist(mutableKey);
      assert.strictEqual(await redis.ttl(mutableKey), -1);

      // Data should still be there
      assert.strictEqual(await redis.get(mutableKey), 'mutable_data');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle TTL operations on non-existent keys', async () => {
      const nonExistentKey = 'nonexistent:' + Math.random();

      // TTL on non-existent key should return -2
      assert.strictEqual(await redis.ttl(nonExistentKey), -2);

      // EXPIRE on non-existent key should return 0
      const expireResult = await redis.expire(nonExistentKey, 300);
      assert.strictEqual(expireResult, 0);

      // PERSIST on non-existent key should return 0
      const persistResult = await redis.persist(nonExistentKey);
      assert.strictEqual(persistResult, 0);
    });

    test('should handle invalid TTL values gracefully', async () => {
      const testKey = 'ttl:test:' + Math.random();
      await redis.set(testKey, 'test_value');

      // Zero TTL should expire immediately
      await redis.expire(testKey, 0);

      // Key should be expired/deleted
      assert.strictEqual(await redis.exists(testKey), 0);
    });

    test('should handle type operations on various data structures', async () => {
      const baseKey = 'type:edge:' + Math.random();

      // Test TYPE on fresh key (should be 'none')
      assert.strictEqual(await redis.type(`${baseKey}:fresh`), 'none');

      // Create and delete key, then check type
      await redis.set(`${baseKey}:temp`, 'temp');
      await redis.del(`${baseKey}:temp`);
      assert.strictEqual(await redis.type(`${baseKey}:temp`), 'none');
    });

    test('should handle concurrent TTL operations', async () => {
      const concurrentKey = 'concurrent:ttl:' + Math.random();

      await redis.setex(concurrentKey, 3600, 'concurrent_data');

      // Multiple TTL checks should be consistent
      const ttl1 = await redis.ttl(concurrentKey);
      const ttl2 = await redis.ttl(concurrentKey);

      // TTL values should be close (within a few seconds)
      assert.ok(Math.abs(ttl1 - ttl2))(5);
      assert.ok(ttl1 > 3500);
      assert.ok(ttl2 > 3500);
    });
  });
});
