/**
 * Error Handling and Edge Case Tests
 * Real-world patterns resilience, command failures, recovery scenarios
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;;
import { getStandaloneConfig } from '../utils/test-config.mjs';;

describe('Error Handling and Edge Cases', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    redis = new Redis(config);
    await redis.connect();
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Connection Error Handling', () => {
    it('should handle graceful disconnection', async () => {
      // Verify we can perform operations
      await redis.set('test', 'value');
      const value = await redis.get('test');
      assert.strictEqual(value, 'value');

      // Disconnect and verify
      await redis.quit();

      // Should be able to reconnect
      const config = await getRedisTestConfig();
      redis = new Redis(config);

      const reconnectedValue = await redis.get('test');
      assert.strictEqual(reconnectedValue, 'value');
    });

    it('should handle invalid configuration gracefully', async () => {
      // Test with various invalid configs that should not crash
      expect(() => {
        new Redis({ host: '', port });
      }).not.toThrow();
    });
  });

  describe('Command Error Scenarios', () => {
    it('should handle type conflicts gracefully', async () => {
      const key = 'type:' + Math.random();

      // Set
      await redis.set(key, 'string_value');

      // Try to use - should throw appropriate error
      await expect(redis.lpush(key, 'value')).rejects.toThrow();

      // Try to use - should throw appropriate error
      await expect(redis.hset(key, 'field', 'value')).rejects.toThrow();

      // Try to use - should throw appropriate error
      await expect(redis.sadd(key, 'member')).rejects.toThrow();

      // Try to use - should throw appropriate error
      await expect(redis.zadd(key, 1, 'member')).rejects.toThrow();
    });

    it('should handle invalid command arguments', async () => {
      const key = 'invalid:' + Math.random();

      // Invalid LSET arguments
      await redis.rpush(key, 'a', 'b', 'c');
      await expect(redis.lset(key, 999, 'value')).rejects.toThrow();
      await expect(redis.lset(key, -999, 'value')).rejects.toThrow();

      // Invalid INCR on non-numeric value
      await redis.set(key + '', 'not_a_number');
      await expect(redis.incr(key + '')).rejects.toThrow();
    });

    it('should handle memory pressure scenarios', async () => {
      const largeKey = 'memory:' + Math.random();

      // Create a large string (within reasonable test limits)
      const largeValue = 'x'.repeat(100000); // 100KB

      try {
        await redis.set(largeKey, largeValue);
        const retrieved = await redis.get(largeKey);
        assert.strictEqual(retrieved, largeValue);
      } catch (error) {
        // If memory is limited, should get appropriate error
        expect((error).message).toMatch(/memory|space|limit/i);
      }

      // Clean up
      await redis.del(largeKey);
    });
  });

  describe('Transaction Error Handling', () => {
    it('should handle transaction failures gracefully', async () => {
      const multi = redis.multi();

      // Add some valid commands
      multi.set('tx', 'value1');
      multi.set('tx', 'value2');

      // Add a command that might fail
      multi.incr('tx'); // Will fail because it's a string

      // Execute transaction
      const results = await multi.exec();

      // Should get results for all commands, even if some fail
      assert.ok(results);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty transactions', async () => {
      const multi = redis.multi();
      const results = await multi.exec();

      assert.ok(results);
      expect(Array.isArray(results)).toBe(true);
      assert.strictEqual(results.length, 0);
    });
  });

  describe('Pipeline Error Recovery', () => {
    it('should handle mixed success/failure in pipelines', async () => {
      const pipeline = redis.pipeline();

      // Valid commands
      pipeline.set('pipe', 'ok');
      pipeline.set('pipe', 'ok');

      // Invalid command
      pipeline.incr('pipe'); // Will fail

      // More valid commands
      pipeline.get('pipe');

      const results = await pipeline.exec();

      assert.ok(results);
      expect(Array.isArray(results)).toBe(true);
      assert.strictEqual(results.length, 4);

      // First two should succeed
      assert.strictEqual(results[0].[1], 'OK');
      assert.strictEqual(results[1].[1], 'OK');

      // Third should fail
      assert.ok(results[2].[0]); // Should have error

      // Fourth should succeed
      assert.strictEqual(results[3].[1], 'ok');
    });

    it('should handle pipeline abort scenarios', async () => {
      const pipeline = redis.pipeline();

      pipeline.set('abort', 'value');
      pipeline.get('abort');

      // Should be able to execute normally
      const results = await pipeline.exec();
      assert.strictEqual(results.length, 2);
    });
  });

  describe('Data Structure Edge Cases', () => {
    it('should handle empty data structures', async () => {
      const baseKey = 'empty:' + Math.random();

      // Empty list operations
      const listKey = baseKey + '';
      expect(await redis.llen(listKey)).toBe(0);
      expect(await redis.lpop(listKey)).toBeNull();
      expect(await redis.lrange(listKey, 0, -1)).toEqual([]);

      // Empty set operations
      const setKey = baseKey + '';
      expect(await redis.scard(setKey)).toBe(0);
      expect(await redis.spop(setKey)).toBeNull();
      expect(await redis.smembers(setKey)).toEqual([]);

      // Empty hash operations
      const hashKey = baseKey + '';
      expect(await redis.hlen(hashKey)).toBe(0);
      expect(await redis.hkeys(hashKey)).toEqual([]);
      expect(await redis.hgetall(hashKey)).toEqual({});

      // Empty zset operations
      const zsetKey = baseKey + '';
      expect(await redis.zcard(zsetKey)).toBe(0);
      expect(await redis.zrange(zsetKey, 0, -1)).toEqual([]);
    });

    it('should handle boundary value operations', async () => {
      const key = 'boundary:' + Math.random();

      // Test with empty strings
      await redis.set(key + '', '');
      const empty = await redis.get(key + '');
      assert.strictEqual(empty, '');

      // Test with very long field names in hashes
      const longField = 'field_' + 'x'.repeat(1000);
      await redis.hset(key + '', longField, 'value');
      const longFieldValue = await redis.hget(key + '', longField);
      assert.strictEqual(longFieldValue, 'value');

      // Test with special characters
      const specialChars = '!@#$%^&*()_+{}|:"<>?[];\'\\,./~`';
      await redis.set(key + '', specialChars);
      const specialValue = await redis.get(key + '');
      assert.strictEqual(specialValue, specialChars);
    });

    it('should handle numeric edge cases', async () => {
      const key = 'numeric:' + Math.random();

      // Test with zero
      await redis.set(key + '', '0');
      const incremented = await redis.incr(key + '');
      assert.strictEqual(incremented, 1);

      // Test with negative numbers
      await redis.set(key + '', '-5');
      const decremented = await redis.decr(key + '');
      assert.strictEqual(decremented, -6);

      // Test with float precision
      const floatKey = key + '';
      await redis.set(floatKey, '0.0');
      const floatIncr = await redis.incrbyfloat(floatKey, 0.1);
      expect(parseFloat(floatIncr.toString())).toBeCloseTo(0.1, 10);
    });
  });

  describe('Concurrency and Race Conditions', () => {
    it('should handle concurrent operations on same key', async () => {
      const key = 'concurrent:' + Math.random();
      await redis.set(key, '0');

      // Simulate concurrent increments
      const concurrentOperations = Array.from({ length }, () =>
        redis.incr(key)
      );

      const results = await Promise.all(concurrentOperations);

      // All operations should succeed
      assert.strictEqual(results.length, 10);
      results.forEach(result => {
        assert.strictEqual(typeof result, 'number');
        assert.ok(result > 0);
      });

      // Final value should be 10
      const finalValue = await redis.get(key);
      expect(parseInt(finalValue!)).toBe(10);
    });

    it('should handle concurrent pipeline executions', async () => {
      const baseKey = 'pipe_concurrent:' + Math.random();

      const createPipeline = (suffix) => {
        const pipeline = redis.pipeline();
        pipeline.set(baseKey + ':' + suffix, suffix);
        pipeline.get(baseKey + ':' + suffix);
        return pipeline.exec();
      };

      const pipelines = Array.from({ length }, (_, i) =>
        createPipeline(i.toString())
      );

      const results = await Promise.all(pipelines);

      // All pipelines should succeed
      assert.strictEqual(results.length, 5);
      results.forEach((result, index) => {
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result.[0].[1], 'OK'); // SET result
        assert.strictEqual(result.[1].[1], index.toString()); // GET result
      });
    });
  });

  describe('Resource Cleanup and Lifecycle', () => {
    it('should handle proper cleanup of expired keys', async () => {
      const key = 'cleanup:' + Math.random();

      // Set key with very short TTL
      await redis.setex(key, 1, 'temporary');

      // Verify it exists
      const beforeExpiry = await redis.get(key);
      assert.strictEqual(beforeExpiry, 'temporary');

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be gone
      const afterExpiry = await redis.get(key);
      assert.strictEqual(afterExpiry, null);

      const ttl = await redis.ttl(key);
      assert.strictEqual(ttl, -2); // Key doesn't exist
    });

    it('should handle cleanup of complex data structures', async () => {
      const baseKey = 'cleanup:' + Math.random();

      // Create complex structures
      await redis.hmset(baseKey + '', {
        field1: 'value1',
        field2: 'value2',
      });
      await redis.sadd(baseKey + '', 'member1', 'member2');
      await redis.zadd(baseKey + '', 1, 'item1', 2, 'item2');
      await redis.rpush(baseKey + '', 'item1', 'item2');

      // Verify they exist
      expect(await redis.hlen(baseKey + '')).toBeGreaterThan(0);
      expect(await redis.scard(baseKey + '')).toBeGreaterThan(0);
      expect(await redis.zcard(baseKey + '')).toBeGreaterThan(0);
      expect(await redis.llen(baseKey + '')).toBeGreaterThan(0);

      // Cleanup all at once
      const deleted = await redis.del(
        baseKey + '',
        baseKey + '',
        baseKey + '',
        baseKey + ''
      );

      assert.strictEqual(deleted, 4);

      // Verify cleanup
      expect(await redis.hlen(baseKey + '')).toBe(0);
      expect(await redis.scard(baseKey + '')).toBe(0);
      expect(await redis.zcard(baseKey + '')).toBe(0);
      expect(await redis.llen(baseKey + '')).toBe(0);
    });
  });

  describe('Command Parameter Validation', () => {
    it('should validate command parameters appropriately', async () => {
      const key = 'validation:' + Math.random();

      // Test invalid range parameters
      await redis.rpush(key, 'a', 'b', 'c');

      // Valid ranges should work
      const validRange = await redis.lrange(key, 0, 1);
      assert.deepStrictEqual(validRange, ['a', 'b']);

      // Out of bounds ranges should return empty or partial results
      const outOfBounds = await redis.lrange(key, 10, 20);
      assert.deepStrictEqual(outOfBounds, []);

      const negativeRange = await redis.lrange(key, -10, -5);
      expect(Array.isArray(negativeRange)).toBe(true);
    });

    it('should handle malformed key patterns', async () => {
      // Keys with special characters
      const specialKeys = [
        'key',
        'key*with*asterisks',
        'key[with]brackets',
        'key{with}braces',
        'key with spaces',
      ];

      for (const specialKey of specialKeys) {
        await redis.set(specialKey, 'value');
        const value = await redis.get(specialKey);
        assert.strictEqual(value, 'value');
      }

      // Clean up
      await redis.del(...specialKeys);
    });
  });

  describe('Recovery Scenarios', () => {
    it('should handle graceful degradation', async () => {
      const key = 'recovery:' + Math.random();

      // Successful operation
      await redis.set(key, 'value');
      const value = await redis.get(key);
      assert.strictEqual(value, 'value');

      // Even if we encounter errors, basic operations should still work
      try {
        await redis.incr(key); // Will fail on string value
      } catch (error) {
        // Expected to fail
        assert.ok(error);
      }

      // Should still be able to perform other operations
      const stillExists = await redis.get(key);
      assert.strictEqual(stillExists, 'value');

      await redis.del(key);
      const afterDelete = await redis.get(key);
      assert.strictEqual(afterDelete, null);
    });

    it('should maintain data consistency during errors', async () => {
      const key = 'consistency:' + Math.random();

      // Set up initial state
      await redis.rpush(key, 'item1', 'item2', 'item3');
      const initialLength = await redis.llen(key);
      assert.strictEqual(initialLength, 3);

      // Attempt operations that might partially fail
      try {
        await redis.lset(key, 999, 'invalid_index'); // Should fail
      } catch (error) {
        // Expected to fail
      }

      // Verify list is unchanged
      const afterError = await redis.llen(key);
      assert.strictEqual(afterError, 3);

      const items = await redis.lrange(key, 0, -1);
      assert.deepStrictEqual(items, ['item1', 'item2', 'item3']);
    });
  });
});
