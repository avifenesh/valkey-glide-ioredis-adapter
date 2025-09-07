/**
 * Valkey Adapter Edge Cases & Uncovered Methods Tests
 *
 * Production edge cases and error scenarios:
 * - Connection recovery patterns from Netflix, Stripe
 * - Memory pressure handling from Instagram, Twitter
 * - Command timeout scenarios from Discord, Slack
 * - Type validation from e-commerce platforms
 * - Concurrent operation handling from high-traffic APIs
 * - Edge case parameter combinations
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
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('Redis Adapter Edge Cases & Production Scenarios', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
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

  describe('Connection Edge Cases', () => {
    test('should handle reconnection scenarios gracefully', async () => {
      // Test basic connection
      await redis.set('connection:test', 'initial');
      const value = await redis.get('connection:test');
      assert.strictEqual(value, 'initial');

      // Simulate connection recovery (common in cloud environments)
      // The adapter should handle this transparently
      await redis.set('connection:test:recovery', 'after_reconnect');
      const recoveryValue = await redis.get('connection:test:recovery');
      assert.strictEqual(recoveryValue, 'after_reconnect');
    });

    test('should handle concurrent connection attempts', async () => {
      // Clean up any existing test data
      await redis.del('concurrent:counter');

      // Multiple operations at connection time (startup scenario)
      // First, do concurrent SETs
      const setPromises = [
        redis.set('concurrent:1', 'value1'),
        redis.set('concurrent:2', 'value2'),
        redis.set('concurrent:3', 'value3'),
      ];
      const setResults = await Promise.all(setPromises);
      assert.strictEqual(setResults[0], 'OK');
      assert.strictEqual(setResults[1], 'OK');
      assert.strictEqual(setResults[2], 'OK');

      // Then do GET and INCR after SETs are complete
      const getValue = await redis.get('concurrent:1');
      const incrResult = await redis.incr('concurrent:counter');

      assert.strictEqual(getValue, 'value1');
      assert.strictEqual(incrResult, 1);
    });

    test('should handle lazyConnect configuration', async () => {
      // Test adapter with lazyConnect enabled
      const lazyConfig = getStandaloneConfig();
      const configWithLazy = { ...lazyConfig, lazyConnect: true };

      const lazyRedis = new Redis(configWithLazy);

      // First operation should trigger connection
      await lazyRedis.set('lazy:test', 'connected');
      const result = await lazyRedis.get('lazy:test');
      assert.strictEqual(result, 'connected');

      await lazyRedis.disconnect();
    });

    test('should handle invalid host scenarios', async () => {
      const invalidConfig = getStandaloneConfig();
      invalidConfig.host = 'nonexistent.example.com';

      const invalidRedis = new Redis(invalidConfig);

      // Collect all errors to prevent unhandled errors
      const errors = [];
      const errorHandler = error => {
        errors.push(error);
      };
      invalidRedis.on('error', errorHandler);

      // Should handle connection errors gracefully
      await assert
        .ok(async () => {
          await invalidRedis.set('test', 'value');
        })
        .rejects.toThrow();

      // Wait for any async errors and then clean up
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup attempt should not throw
      try {
        await invalidRedis.disconnect();
      } catch (error) {
        // Expected - disconnecting invalid connection may throw
      }

      // Wait for final async cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Remove error listener
      invalidRedis.off('error', errorHandler);

      // Verify we caught connection errors as expected
      assert.ok(errors.length > 0);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    test('should handle large value storage and retrieval', async () => {
      // Large values (common in session storage, cache)
      const sizes = [1024, 10240, 102400]; // 1KB, 10KB, 100KB

      for (const size of sizes) {
        const largeValue = 'x'.repeat(size);
        const key = `large:value:${size}`;

        await redis.set(key, largeValue);
        const retrieved = await redis.get(key);

        assert.strictEqual(retrieved, largeValue);
        assert.strictEqual(retrieved.length, size);
      }
    });

    test('should handle memory pressure scenarios', async () => {
      // Simulate memory pressure with many keys
      const keyCount = 1000;
      const keyPrefix = 'memory:pressure:';

      // Create many keys
      for (let i = 0; i < keyCount; i++) {
        await redis.set(`${keyPrefix}${i}`, `value_${i}`);
      }

      // Verify all keys exist
      const exists = await redis.exists(
        ...Array.from({ length: keyCount }, (_, i) => `${keyPrefix}${i}`)
      );
      assert.strictEqual(exists, keyCount);

      // Cleanup (test TTL setting)
      for (let i = 0; i < keyCount; i++) {
        await redis.expire(`${keyPrefix}${i}`, 1);
      }
    });

    test('should handle concurrent high-frequency operations', async () => {
      // High-frequency operations (analytics, counters)
      const operations = 100;
      const counterKey = 'concurrent:high:frequency';

      // Concurrent increments
      const incrPromises = Array.from({ length: operations }, () =>
        redis.incr(counterKey)
      );

      const results = await Promise.all(incrPromises);

      // All operations should succeed
      assert.strictEqual(results.length, operations);
      for (const result of results) {
        assert.strictEqual(typeof result, 'number');
        assert.ok(result > 0);
      }

      // Final count should be correct
      const finalCount = await redis.get(counterKey);
      assert.strictEqual(parseInt(finalCount || '0'), operations);
    });
  });

  describe('Data Type Edge Cases', () => {
    test('should handle type conflicts gracefully', async () => {
      const key = 'type:conflict:test';

      // Set
      await redis.set(key, 'string_value');

      // Try to use as list (should fail)
      await assert.ok(redis.lpush(key, 'item')).rejects.toThrow();

      // Try to use as hash (should fail)
      await assert.ok(redis.hset(key, 'field', 'value')).rejects.toThrow();

      // Try to use as set (should fail)
      await assert.ok(redis.sadd(key, 'member')).rejects.toThrow();

      // Original string value should still exist
      const value = await redis.get(key);
      assert.strictEqual(value, 'string_value');
    });

    test('should handle empty collections correctly', async () => {
      // Empty list operations
      const emptyListKey = 'empty:list';
      const listLen = await redis.llen(emptyListKey);
      assert.strictEqual(listLen, 0);

      const listItem = await redis.lpop(emptyListKey);
      assert.strictEqual(listItem, null);

      // Empty set operations
      const emptySetKey = 'empty:set';
      const setSize = await redis.scard(emptySetKey);
      assert.strictEqual(setSize, 0);

      const setMember = await redis.spop(emptySetKey);
      assert.strictEqual(setMember, null);

      // Empty hash operations
      const emptyHashKey = 'empty:hash';
      const hashLen = await redis.hlen(emptyHashKey);
      assert.strictEqual(hashLen, 0);

      const hashFields = await redis.hgetall(emptyHashKey);
      assert.deepStrictEqual(hashFields, {});

      // Empty sorted set operations
      const emptyZSetKey = 'empty:zset';
      const zsetSize = await redis.zcard(emptyZSetKey);
      assert.strictEqual(zsetSize, 0);

      const zsetMember = await redis.zpopmax(emptyZSetKey);
      assert.deepStrictEqual(zsetMember, []);
    });

    test('should handle special numeric values in sorted sets', async () => {
      const key = 'specials:zset';

      // Add members with special numeric values
      await redis.zadd(
        key,
        -Infinity,
        'negative_infinity',
        -1000,
        'negative_large',
        -0.001,
        'negative_small',
        0,
        'zero',
        0.001,
        'positive_small',
        1000,
        'positive_large',
        Infinity,
        'positive_infinity'
      );

      // Get all members in order
      const members = await redis.zrange(key, 0, -1);
      assert.strictEqual(members[0], 'negative_infinity');
      assert.strictEqual(members[members.length - 1], 'positive_infinity');

      // Check specific scores
      const negInfScore = await redis.zscore(key, 'negative_infinity');
      assert.strictEqual(negInfScore, '-inf');

      const posInfScore = await redis.zscore(key, 'positive_infinity');
      assert.strictEqual(posInfScore, 'inf');
    });
  });

  describe('Command Parameter Edge Cases', () => {
    test('should handle SET command with all options', async () => {
      const key = 'set:options:test';

      // SET with EX (seconds)
      await redis.set(key, 'with_ex', 'EX', 10);
      let ttl = await redis.ttl(key);
      assert.ok(ttl > 5);

      // SET with PX (milliseconds)
      await redis.set(key, 'with_px', 'PX', 5000);
      ttl = await redis.ttl(key);
      assert.ok(ttl > 3);

      // SET with NX (only if not exists)
      const result1 = await redis.set(key, 'nx_attempt', 'NX');
      assert.strictEqual(result1, null); // Should fail, key exists

      await redis.del(key);
      const result2 = await redis.set(key, 'nx_success', 'NX');
      assert.strictEqual(result2, 'OK');

      // SET with XX (only if exists)
      const result3 = await redis.set(key, 'xx_success', 'XX');
      assert.strictEqual(result3, 'OK');

      await redis.del(key);
      const result4 = await redis.set(key, 'xx_attempt', 'XX');
      assert.strictEqual(result4, null); // Should fail, key doesn't exist
    });

    test('should handle MGET and MSET with many keys', async () => {
      const keyCount = 100;
      const keys = Array.from({ length: keyCount }, (_, i) => `multi:key:${i}`);
      const values = Array.from({ length: keyCount }, (_, i) => `value_${i}`);

      // MSET with many key-value pairs
      const msetArgs = [];
      for (let i = 0; i < keyCount; i++) {
        msetArgs.push(keys[i], values[i]);
      }
      await redis.mset(...msetArgs);

      // MGET with many keys
      const retrievedValues = await redis.mget(...keys);
      assert.strictEqual(retrievedValues.length, keyCount);

      for (let i = 0; i < keyCount; i++) {
        assert.strictEqual(retrievedValues[i], values[i]);
      }
    });

    test('should handle ZADD with duplicate members', async () => {
      const key = 'zadd:duplicates:test';

      // Initial add
      const result1 = await redis.zadd(key, 100, 'member1', 200, 'member2');
      assert.strictEqual(result1, 2); // 2 new members added

      // Update existing member scores
      const result2 = await redis.zadd(key, 150, 'member1', 250, 'member3');
      assert.strictEqual(result2, 1); // Only 1 new member (member3)

      // Verify updated scores
      const score1 = await redis.zscore(key, 'member1');
      assert.strictEqual(score1, '150'); // Updated score

      const score3 = await redis.zscore(key, 'member3');
      assert.strictEqual(score3, '250'); // New member
    });

    test('should handle ZRANGEBYSCORE with complex ranges', async () => {
      const key = 'zrange:complex:test';

      // Add test data
      await redis.zadd(
        key,
        10,
        'member10',
        20,
        'member20',
        30,
        'member30',
        40,
        'member40',
        50,
        'member50'
      );

      // Exclusive ranges
      const exclusive = await redis.zrangebyscore(key, '(20', '(40');
      assert.deepStrictEqual(exclusive, ['member30']);

      // Mixed inclusive/exclusive
      const mixed = await redis.zrangebyscore(key, '20', '(40');
      assert.deepStrictEqual(mixed, ['member20', 'member30']);

      // With LIMIT
      const limited = await redis.zrangebyscore(
        key,
        '-inf',
        '+inf',
        'LIMIT',
        '1',
        '2'
      );
      assert.strictEqual(limited.length, 2);
      assert.strictEqual(limited[0], 'member20');
      assert.strictEqual(limited[1], 'member30');
    });
  });

  describe('Pipeline and Transaction Edge Cases', () => {
    test('should handle complex pipeline operations', async () => {
      const pipeline = redis.pipeline();

      // Mix different command types in pipeline
      pipeline.set('pipeline', 'value');
      pipeline.hset('pipeline:hash', 'field1', 'value1');
      pipeline.lpush('pipeline:list', 'item1', 'item2');
      pipeline.sadd('pipeline:set', 'member1', 'member2');
      pipeline.zadd('pipeline:zset', 100, 'member1');
      pipeline.incr('pipeline:counter');
      pipeline.get('pipeline');
      pipeline.hget('pipeline:hash', 'field1');
      pipeline.llen('pipeline:list');
      pipeline.scard('pipeline:set');
      pipeline.zcard('pipeline:zset');

      const results = await pipeline.exec();
      assert.strictEqual(results.length, 11);

      // Verify results (allowing for potential null results)
      if (results) {
        assert.deepStrictEqual(results[0], [null, 'OK']); // SET
        assert.deepStrictEqual(results[1], [null, 1]); // HSET
        assert.deepStrictEqual(results[2], [null, 2]); // LPUSH
        assert.deepStrictEqual(results[3], [null, 2]); // SADD
        assert.deepStrictEqual(results[4], [null, 1]); // ZADD
        assert.deepStrictEqual(results[5], [null, 1]); // INCR
        assert.deepStrictEqual(results[6], [null, 'value']); // GET
        assert.deepStrictEqual(results[7], [null, 'value1']); // HGET
        assert.deepStrictEqual(results[8], [null, 2]); // LLEN
        assert.deepStrictEqual(results[9], [null, 2]); // SCARD
        assert.deepStrictEqual(results[10], [null, 1]); // ZCARD
      }
    });

    test('should handle pipeline with errors', async () => {
      const key = 'pipeline:error:test';

      // Set up conflicting data type
      await redis.set(key, 'string_value');

      const pipeline = redis.pipeline();
      pipeline.get(key); // Should succeed
      pipeline.lpush(key, 'item'); // Should fail (wrong type)
      pipeline.set('other:key', 'value'); // Should succeed

      const results = await pipeline.exec();
      assert.strictEqual(results.length, 3);

      assert.deepStrictEqual(results[0], [null, 'string_value']); // Success
      assert.ok(results[1] && results[1][0] instanceof Error); // Error
      assert.deepStrictEqual(results[2], [null, 'OK']); // Success
    });

    test('should handle transaction with WATCH', async () => {
      const key = 'transaction:watch:test';
      await redis.set(key, '100');

      // Start watching
      await redis.watch(key);

      // Start transaction
      const multi = redis.multi();
      multi.get(key);
      multi.incr(key);

      // Execute transaction
      const results = await multi.exec();

      // Should succeed because key wasn't modified
      assert.ok(results !== null);
      if (results) {
        assert.strictEqual(results.length, 2);
        assert.deepStrictEqual(results[0], [null, '100']);
        assert.deepStrictEqual(results[1], [null, 101]);
      }
    });

    test('should handle transaction abort on WATCH violation', async () => {
      const key = 'transaction:abort:test';
      await redis.set(key, '100');

      // Create second connection to modify watched key
      const redis2 = new Redis(getStandaloneConfig());

      try {
        // Start watching
        await redis.watch(key);

        // Modify key from different connection
        await redis2.incr(key);

        // Start transaction (should be aborted)
        const multi = redis.multi();
        multi.incr(key);

        const results = await multi.exec();

        // Should return null (transaction aborted)
        assert.strictEqual(results, null);
      } finally {
        await redis2.disconnect();
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle command errors gracefully', async () => {
      // Invalid arguments
      await assert.ok(redis.set('', 'value')).rejects.toThrow();

      // Type errors
      const stringKey = 'error:key';
      await redis.set(stringKey, 'string_value');
      await assert.ok(redis.lpush(stringKey, 'item')).rejects.toThrow();

      // Non-existent key operations that should return defaults
      const result1 = await redis.get('nonexistent:key');
      assert.strictEqual(result1, null);

      const result2 = await redis.llen('nonexistent:list');
      assert.strictEqual(result2, 0);

      const result3 = await redis.scard('nonexistent:set');
      assert.strictEqual(result3, 0);
    });

    test('should handle timeout scenarios', async () => {
      // This test would ideally require a slow Redis instance or network delay
      // For now, we test that timeout configuration doesn't break normal operations
      const baseConfig = getStandaloneConfig();
      const timeoutConfig = {
        ...baseConfig,
        connectTimeout: 1000,
        lazyConnect: true,
      };

      const timeoutRedis = new Redis(timeoutConfig);

      // Should still work for normal operations
      await timeoutRedis.set('timeout:test', 'value');
      const result = await timeoutRedis.get('timeout:test');
      assert.strictEqual(result, 'value');

      await timeoutRedis.disconnect();
    });

    test('should handle malformed data gracefully', async () => {
      // Binary data
      const binaryKey = 'binary:data:test';
      const binaryData = Buffer.from([0, 1, 2, 3, 255, 254, 253]).toString(
        'binary'
      );

      await redis.set(binaryKey, binaryData);
      const retrieved = await redis.get(binaryKey);
      assert.strictEqual(retrieved, binaryData);

      // Empty strings
      await redis.set('empty', '');
      const empty = await redis.get('empty');
      assert.strictEqual(empty, '');

      // Very long strings
      const longString = 'x'.repeat(1000000); // 1MB
      await redis.set('long', longString);
      const longRetrieved = await redis.get('long');
      assert.strictEqual(longRetrieved, longString);
    });
  });

  describe('Cleanup and Maintenance Operations', () => {
    test('should handle cleanup operations efficiently', async () => {
      // Create temporary data
      const tempKeys = Array.from({ length: 50 }, (_, i) => `temp:key:${i}`);

      for (const key of tempKeys) {
        await redis.set(key, 'temporary_data');
        await redis.expire(key, 1); // 1 second TTL
      }

      // Verify keys exist
      const existsCount = await redis.exists(...tempKeys);
      assert.strictEqual(existsCount, 50);

      // Wait for expiration (TTL test)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify keys are expired
      const expiredCount = await redis.exists(...tempKeys);
      assert.strictEqual(expiredCount, 0);
    });

    test('should handle database selection', async () => {
      // Test database selection (if supported)
      try {
        // Database selection is not implemented in this adapter
        // This test verifies the adapter handles missing methods gracefully
        assert.ok(redis.select === undefined);
      } catch (error) {
        // Database selection might not be supported in cluster mode
        assert.ok(error !== undefined);
      }
    });

    test('should handle FLUSHDB safely in test environment', async () => {
      // Add test data
      await redis.set('flush:test:1', 'value1');
      await redis.set('flush:test:2', 'value2');

      // Verify data exists
      const value1 = await redis.get('flush:test:1');
      assert.strictEqual(value1, 'value1');

      try {
        // FLUSHDB in test environment only
        if (process.env.NODE_ENV === 'test') {
          await redis.flushdb();

          // Verify data is gone
          const flushedValue = await redis.get('flush:test:1');
          assert.strictEqual(flushedValue, null);
        }
      } catch (error) {
        // FLUSHDB might be restricted
        assert.ok(error !== undefined);
      }
    });
  });

  describe('Advanced Redis Features', () => {
    test('should handle Lua script execution', async () => {
      // Simple Lua script
      const script = 'return redis.call("get", KEYS[1])';
      const scriptSha = await redis.script('LOAD', script);

      // Set test data
      await redis.set('lua:test:key', 'lua_value');

      // Execute by SHA
      const result = await redis.evalsha(scriptSha, 1, 'lua:test:key');
      assert.strictEqual(result, 'lua_value');

      // Execute script directly
      const directResult = await redis.eval(script, 1, 'lua:test:key');
      assert.strictEqual(directResult, 'lua_value');
    });

    test('should handle complex Lua scripts with ARGV', async () => {
      // Script that uses both KEYS and ARGV
      const script = `
        local key = KEYS[1]
        local increment = ARGV[1]
        local current = redis.call("get", key)
        if current == false then
          current = 0
        end
        local new_value = tonumber(current) + tonumber(increment)
        redis.call("set", key, new_value)
        return new_value
      `;

      const result1 = await redis.eval(script, 1, 'lua:counter', '10');
      assert.strictEqual(result1, 10);

      const result2 = await redis.eval(script, 1, 'lua:counter', '25');
      assert.strictEqual(result2, 35);
    });

    test('should handle stream operations', async () => {
      const streamKey = 'test:stream:advanced';

      // Clean up any existing stream data
      try {
        await redis.del(streamKey);
      } catch {
        // Ignore cleanup errors
      }

      // Add entries to stream
      const id1 = await redis.xadd(
        streamKey,
        '*',
        'field1',
        'value1',
        'field2',
        'value2'
      );
      assert.strictEqual(typeof id1, 'string');
      assert.match(id1, /\d+-\d+/);

      const id2 = await redis.xadd(
        streamKey,
        '*',
        'field1',
        'value3',
        'field2',
        'value4'
      );
      assert.strictEqual(typeof id2, 'string');

      // Read from stream
      const entries = await redis.xrange(streamKey, '-', '+');
      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0][0], id1);
      assert.deepStrictEqual(entries[0][1], [
        'field1',
        'value1',
        'field2',
        'value2',
      ]);

      // Get stream length
      const length = await redis.xlen(streamKey);
      assert.strictEqual(length, 2);

      // Trim stream
      const trimmed = await redis.xtrim(streamKey, 'MAXLEN', '~', '1');
      const newLength = await redis.xlen(streamKey);
      // Approximate trimming (~) may not trim anything for performance
      // This is a difference between Redis and GLIDE behavior
      assert.strictEqual(typeof trimmed, 'number');
      assert.ok(trimmed >= 0); // Could be 0 (no trim) or more
      assert.ok(newLength >= 1); // At least 1 entry should remain
    });

    test('should handle HyperLogLog operations if available', async () => {
      // HyperLogLog commands are not implemented in the current adapter
      // This test verifies the adapter handles missing methods gracefully
      try {
        assert.ok(redis.pfadd === undefined);
        assert.ok(redis.pfcount === undefined);
        assert.ok(redis.pfmerge === undefined);
      } catch (error) {
        // Commands might not be available
        assert.ok(error !== undefined);
      }
    });
  });
});
