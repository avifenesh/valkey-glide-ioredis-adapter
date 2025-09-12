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

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('Key Management - TTL & Persistence Patterns', () => {
  let client;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    client = new Redis(config);

    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  afterEach(async () => {
    if (client) {
      await client.quit();
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
      await client.setex(sessionKey, 1800, sessionData);

      // Verify TTL is set
      const ttl = await client.ttl(sessionKey);
      assert.ok(ttl > 1790);
      assert.ok(ttl <= 1800);

      // Verify session data
      const retrievedData = await client.get(sessionKey);
      assert.strictEqual(retrievedData, sessionData);

      // Extend session TTL (user activity)
      await client.expire(sessionKey, 3600);

      const newTtl = await client.ttl(sessionKey);
      assert.ok(newTtl > 3590);
    });

    test('should implement rolling session expiration', async () => {
      const sessionKey = 'rolling:session:' + Math.random();

      await client.setex(sessionKey, 900, 'session_data'); // 15 minutes

      // Simulate user activity - refresh TTL
      await new Promise(resolve => setTimeout(resolve, 100).unref());
      await client.expire(sessionKey, 900); // Reset to 15 minutes

      const ttl = await client.ttl(sessionKey);
      assert.ok(ttl > 890);
    });

    test('should handle session cleanup on logout', async () => {
      const sessionKey = 'logout:session:' + Math.random();

      // Create session
      await client.setex(sessionKey, 3600, 'active_session');
      assert.strictEqual(await client.exists(sessionKey), 1);

      // Logout - remove session immediately
      await client.del(sessionKey);
      assert.strictEqual(await client.exists(sessionKey), 0);

      // TTL should return -2 (key doesn't exist)
      const ttl = await client.ttl(sessionKey);
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

      await client.setex(cacheKey, 3600, routeData); // 1 hour cache

      // Verify cache hit
      const cached = await client.get(cacheKey);
      assert.strictEqual(cached, routeData);

      // Check remaining TTL
      const ttl = await client.ttl(cacheKey);
      assert.ok(ttl <= 3600);
      assert.ok(ttl > 3500);
    });

    test('should implement staggered cache expiration', async () => {
      const baseKey = 'staggered:cache:' + Math.random();

      // Create multiple cache entries with different TTLs
      await client.setex(`${baseKey}:priority:high`, 300, 'high_priority_data'); // 5 min
      await client.setex(
        `${baseKey}:priority:medium`,
        600,
        'medium_priority_data'
      ); // 10 min
      await client.setex(`${baseKey}:priority:low`, 1200, 'low_priority_data'); // 20 min

      // Verify all exist
      assert.strictEqual(await client.exists(`${baseKey}:priority:high`), 1);
      assert.strictEqual(await client.exists(`${baseKey}:priority:medium`), 1);
      assert.strictEqual(await client.exists(`${baseKey}:priority:low`), 1);

      // Check TTLs are different
      const ttlHigh = await client.ttl(`${baseKey}:priority:high`);
      const ttlMedium = await client.ttl(`${baseKey}:priority:medium`);
      const ttlLow = await client.ttl(`${baseKey}:priority:low`);

      assert.ok(ttlHigh < ttlMedium);
      assert.ok(ttlMedium < ttlLow);
    });

    test('should handle cache refresh patterns', async () => {
      const cacheKey = 'refresh:cache:' + Math.random();

      // Set initial cache
      await client.setex(cacheKey, 60, 'initial_data');

      // Refresh cache with new data and extended TTL
      await client.setex(cacheKey, 120, 'refreshed_data');

      const data = await client.get(cacheKey);
      assert.strictEqual(data, 'refreshed_data');

      const ttl = await client.ttl(cacheKey);
      assert.ok(ttl > 110);
    });
  });

  describe('Temporary Data Management', () => {
    test('should handle rate limiting windows like Amazon', async () => {
      const rateLimitKey = 'rate:limit:' + Math.random();

      // Set rate limit counter with window expiration
      await client.setex(rateLimitKey, 3600, '1'); // 1 request in 1 hour window

      // Increment counter (new request)
      const currentCount = await client.incr(rateLimitKey);
      assert.strictEqual(currentCount, 2);

      // TTL should still be maintained after increment
      const ttl = await client.ttl(rateLimitKey);
      assert.ok(ttl > 0);
      assert.ok(ttl <= 3600);
    });

    test('should implement OTP expiration like Netflix', async () => {
      const otpKey = 'otp:' + Math.random();
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // OTP expires in 5 minutes
      await client.setex(otpKey, 300, otpCode);

      // Verify OTP exists and is correct
      const storedOtp = await client.get(otpKey);
      assert.strictEqual(storedOtp, otpCode);

      // Check TTL
      const ttl = await client.ttl(otpKey);
      assert.ok(ttl <= 300);
      assert.ok(ttl > 290);

      // Consume OTP (delete after use)
      await client.del(otpKey);
      assert.strictEqual(await client.get(otpKey), null);
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
      await client.setex(tokenKey, 900, tokenData);

      // Verify token
      const token = await client.get(tokenKey);
      assert.strictEqual(token, tokenData);

      // Remove token after use
      await client.del(tokenKey);
      assert.strictEqual(await client.exists(tokenKey), 0);
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
      await client.set(configKey, configData);

      // TTL should be -1 (no expiration)
      const ttl = await client.ttl(configKey);
      assert.strictEqual(ttl, -1);

      // Data should persist
      const data = await client.get(configKey);
      assert.strictEqual(data, configData);
    });

    test('should convert expiring key to persistent', async () => {
      const dataKey = 'convert:persistent:' + Math.random();

      // Initially set with TTL
      await client.setex(dataKey, 3600, 'temporary_data');

      let ttl = await client.ttl(dataKey);
      assert.ok(ttl > 0);

      // Make it persistent
      await client.persist(dataKey);

      ttl = await client.ttl(dataKey);
      assert.strictEqual(ttl, -1); // No expiration

      const data = await client.get(dataKey);
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
      await client.setex(primaryKey, 7200, importantData);

      // Create backup (persistent)
      await client.set(backupKey, importantData);

      // Primary should have TTL, backup should not
      assert.ok((await client.ttl(primaryKey)) > 0);
      assert.strictEqual(await client.ttl(backupKey), -1);

      // Both should have same data
      assert.strictEqual(await client.get(primaryKey), importantData);
      assert.strictEqual(await client.get(backupKey), importantData);
    });
  });

  describe('Key Type and Metadata Operations', () => {
    test('should identify key types for cleanup strategies', async () => {
      const baseKey = 'type:test:' + Math.random();

      // Create different data types
      await client.set(`${baseKey}`, 'string_value');
      await client.hset(`${baseKey}:hash`, 'field', 'value');
      await client.sadd(`${baseKey}:set`, 'member1', 'member2');
      await client.zadd(`${baseKey}:zset`, 1, 'member1');
      await client.lpush(`${baseKey}:list`, 'item1');

      // Check types
      assert.strictEqual(await client.type(`${baseKey}`), 'string');
      assert.strictEqual(await client.type(`${baseKey}:hash`), 'hash');
      assert.strictEqual(await client.type(`${baseKey}:set`), 'set');
      assert.strictEqual(await client.type(`${baseKey}:zset`), 'zset');
      assert.strictEqual(await client.type(`${baseKey}:list`), 'list');
      assert.strictEqual(await client.type(`${baseKey}:nonexistent`), 'none');
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
        await client.set(keys[i], `value_${i}`);
      }

      // Check all exist
      const existsCount = await client.exists(...keys);
      assert.strictEqual(existsCount, keys.length);

      // Delete multiple keys
      const deletedCount = await client.del(...keys);
      assert.strictEqual(deletedCount, keys.length);

      // Verify all deleted
      assert.strictEqual(await client.exists(...keys), 0);
    });

    test('should handle key pattern matching for maintenance', async () => {
      const prefix = 'pattern:' + Math.random();

      // Create keys with pattern
      await client.set(`${prefix}:user:123`, 'user_data');
      await client.set(`${prefix}:user:456`, 'user_data');
      await client.set(`${prefix}:session:abc`, 'session_data');
      await client.set(`${prefix}:session:def`, 'session_data');
      await client.set(`${prefix}:other:xyz`, 'other_data');

      // Find keys by pattern using SCAN
      const scanCount = async pattern => {
        let cursor = '0';
        let total = 0;
        do {
          const res = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
          cursor = Array.isArray(res) ? res[0] : '0';
          const batch = Array.isArray(res) ? res[1] : [];
          total += Array.isArray(batch) ? batch.length : 0;
        } while (cursor !== '0');
        return total;
      };

      const userCount = await scanCount(`${prefix}:user:*`);
      assert.strictEqual(userCount, 2);

      const sessionCount = await scanCount(`${prefix}:session:*`);
      assert.strictEqual(sessionCount, 2);
    });
  });

  describe('Expiration Event Simulation', () => {
    test('should handle near-expiration scenarios', async () => {
      const shortKey = 'short:lived:' + Math.random();

      // Set very short TTL
      await client.setex(shortKey, 2, 'short_lived_data');

      // Verify exists initially
      assert.strictEqual(await client.exists(shortKey), 1);
      assert.ok((await client.ttl(shortKey)) <= 2);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 2500).unref());

      // Should be expired
      assert.strictEqual(await client.exists(shortKey), 0);
      assert.strictEqual(await client.ttl(shortKey), -2);
      assert.strictEqual(await client.get(shortKey), null);
    });

    test('should handle TTL updates and cancellations', async () => {
      const mutableKey = 'mutable:ttl:' + Math.random();

      // Set with initial TTL
      await client.setex(mutableKey, 300, 'mutable_data');
      assert.ok((await client.ttl(mutableKey)) <= 300);

      // Update TTL to longer duration
      await client.expire(mutableKey, 600);
      assert.ok((await client.ttl(mutableKey)) > 500);

      // Cancel expiration (make persistent)
      await client.persist(mutableKey);
      assert.strictEqual(await client.ttl(mutableKey), -1);

      // Data should still be there
      assert.strictEqual(await client.get(mutableKey), 'mutable_data');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle TTL operations on non-existent keys', async () => {
      const nonExistentKey = 'nonexistent:' + Math.random();

      // TTL on non-existent key should return -2
      assert.strictEqual(await client.ttl(nonExistentKey), -2);

      // EXPIRE on non-existent key should return 0
      const expireResult = await client.expire(nonExistentKey, 300);
      assert.strictEqual(expireResult, 0);

      // PERSIST on non-existent key should return 0
      const persistResult = await client.persist(nonExistentKey);
      assert.strictEqual(persistResult, 0);
    });

    test('should handle invalid TTL values gracefully', async () => {
      const testKey = 'ttl:test:' + Math.random();
      await client.set(testKey, 'test_value');

      // Zero TTL should expire immediately
      await client.expire(testKey, 0);

      // Key should be expired/deleted
      assert.strictEqual(await client.exists(testKey), 0);
    });

    test('should handle type operations on various data structures', async () => {
      const baseKey = 'type:edge:' + Math.random();

      // Test TYPE on fresh key (should be 'none')
      assert.strictEqual(await client.type(`${baseKey}:fresh`), 'none');

      // Create and delete key, then check type
      await client.set(`${baseKey}:temp`, 'temp');
      await client.del(`${baseKey}:temp`);
      assert.strictEqual(await client.type(`${baseKey}:temp`), 'none');
    });

    test('should handle concurrent TTL operations', async () => {
      const concurrentKey = 'concurrent:ttl:' + Math.random();

      await client.setex(concurrentKey, 3600, 'concurrent_data');

      // Multiple TTL checks should be consistent
      const ttl1 = await client.ttl(concurrentKey);
      const ttl2 = await client.ttl(concurrentKey);

      // TTL values should be close (within a few seconds)
      assert.ok(Math.abs(ttl1 - ttl2) <= 5);
      assert.ok(ttl1 > 3500);
      assert.ok(ttl2 > 3500);
    });
  });
});
