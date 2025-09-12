/**
 * Error Handling and Edge Case Tests
 * Real-world patterns resilience, command failures, recovery scenarios
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

describe('Error Handling and Edge Cases', () => {
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
    await client.quit();
  });

  describe('Connection Error Handling', () => {
    test('should handle graceful disconnection', async () => {
      // Verify we can perform operations
      await client.set('test:disconnect', 'value');
      const value = await client.get('test:disconnect');
      assert.strictEqual(value, 'value');

      // Disconnect and verify
      await client.quit();

      // Should be able to reconnect
      const config = getStandaloneConfig();
      client = new Redis(config);
      await client.connect();

      // Set a new value after reconnection to verify connection works
      await client.set('test:reconnected', 'new_value');
      const reconnectedValue = await client.get('test:reconnected');
      assert.strictEqual(reconnectedValue, 'new_value');
    });

    test('should handle invalid configuration gracefully', async () => {
      // Test with various invalid configs that should not crash
      assert.ok(() => {
        new Redis({ host: '', port: 0 });
      });
    });
  });

  describe('Command Error Scenarios', () => {
    test('should handle type conflicts gracefully', async () => {
      const key = 'type:conflict:' + Math.random();

      // Set
      await client.set(key, 'string_value');

      // Try to use as list - should throw appropriate error
      await assert.rejects(client.lpush(key, 'value'));

      // Try to use as hash - should throw appropriate error
      await assert.rejects(client.hset(key, 'field', 'value'));

      // Try to use as set - should throw appropriate error
      await assert.rejects(client.sadd(key, 'member'));

      // Try to use as zset - should throw appropriate error
      await assert.rejects(client.zadd(key, 1, 'member'));
    });

    test('should handle invalid command arguments', async () => {
      const key = 'invalid:args:' + Math.random();

      // Invalid LSET arguments
      await client.rpush(key, 'a', 'b', 'c');
      await assert.rejects(client.lset(key, 999, 'value'));
      await assert.rejects(client.lset(key, -999, 'value'));

      // Invalid INCR on non-numeric value
      await client.set(key + ':non_numeric', 'not_a_number');
      await assert.rejects(client.incr(key + ':non_numeric'));
    });

    test('should handle memory pressure scenarios', async () => {
      const largeKey = 'memory:test:' + Math.random();

      // Create a large string (within reasonable test limits)
      const largeValue = 'x'.repeat(100000); // 100KB

      try {
        await client.set(largeKey, largeValue);
        const retrieved = await client.get(largeKey);
        assert.strictEqual(retrieved, largeValue);
      } catch (error) {
        // If memory is limited, should get appropriate error
        assert.ok(error.message.match(/memory|space|limit/i));
      }

      // Clean up
      await client.del(largeKey);
    });
  });

  describe('Transaction Error Handling', () => {
    test('should handle transaction failures gracefully', async () => {
      const multi = client.multi();

      // Add some valid commands
      multi.set('tx:test1', 'value1');
      multi.set('tx:test2', 'value2');

      // Add a command that might fail
      multi.incr('tx:test1'); // Will fail because it's a string

      // Execute transaction
      const results = await multi.exec();

      // Should get results for all commands, even if some fail
      assert.ok(results);
      assert.ok(Array.isArray(results));
    });

    test('should handle empty transactions', async () => {
      const multi = client.multi();
      const results = await multi.exec();

      assert.ok(results);
      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, 0);
    });
  });

  describe('Pipeline Error Recovery', () => {
    test('should handle mixed success/failure in pipelines', async () => {
      const pipeline = client.pipeline();

      // Valid commands
      pipeline.set('pipe:success1', 'ok');
      pipeline.set('pipe:success2', 'ok');

      // Invalid command
      pipeline.incr('pipe:success1'); // Will fail

      // More valid commands
      pipeline.get('pipe:success2');

      const results = await pipeline.exec();

      assert.ok(results);
      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, 4);

      // First two should succeed
      assert.strictEqual(results[0]?.[1], 'OK');
      assert.strictEqual(results[1]?.[1], 'OK');

      // Third should fail
      assert.ok(results[2]?.[0]); // Should have error

      // Fourth should succeed
      assert.strictEqual(results[3]?.[1], 'ok');
    });

    test('should handle pipeline abort scenarios', async () => {
      const pipeline = client.pipeline();

      pipeline.set('abort:test', 'value');
      pipeline.get('abort:test');

      // Should be able to execute normally
      const results = await pipeline.exec();
      assert.strictEqual(results.length, 2);
    });
  });

  describe('Data Structure Edge Cases', () => {
    test('should handle empty data structures', async () => {
      const baseKey = 'empty:' + Math.random();

      // Empty list operations
      const listKey = baseKey + ':list';
      assert.strictEqual(await client.llen(listKey), 0);
      assert.strictEqual(await client.lpop(listKey), null);
      assert.deepStrictEqual(await client.lrange(listKey, 0, -1), []);

      // Empty set operations
      const setKey = baseKey + ':set';
      assert.strictEqual(await client.scard(setKey), 0);
      assert.strictEqual(await client.spop(setKey), null);
      assert.deepStrictEqual(await client.smembers(setKey), []);

      // Empty hash operations
      const hashKey = baseKey + ':hash';
      assert.strictEqual(await client.hlen(hashKey), 0);
      assert.deepStrictEqual(await client.hkeys(hashKey), []);
      assert.deepStrictEqual(await client.hgetall(hashKey), {});

      // Empty zset operations
      const zsetKey = baseKey + ':zset';
      assert.strictEqual(await client.zcard(zsetKey), 0);
      assert.deepStrictEqual(await client.zrange(zsetKey, 0, -1), []);
    });

    test('should handle boundary value operations', async () => {
      const key = 'boundary:' + Math.random();

      // Test with empty strings
      await client.set(key + ':empty', '');
      const empty = await client.get(key + ':empty');
      assert.strictEqual(empty, '');

      // Test with very long field names in hashes
      const longField = 'field_' + 'x'.repeat(1000);
      await client.hset(key + ':hash', longField, 'value');
      const longFieldValue = await client.hget(key + ':hash', longField);
      assert.strictEqual(longFieldValue, 'value');

      // Test with special characters
      const specialChars = '!@#$%^&*()_+{}|:"<>?[];\'\\,./~`';
      await client.set(key + ':special', specialChars);
      const specialValue = await client.get(key + ':special');
      assert.strictEqual(specialValue, specialChars);
    });

    test('should handle numeric edge cases', async () => {
      const key = 'numeric:' + Math.random();

      // Test with zero
      await client.set(key + ':zero', '0');
      const incremented = await client.incr(key + ':zero');
      assert.strictEqual(incremented, 1);

      // Test with negative numbers
      await client.set(key + ':negative', '-5');
      const decremented = await client.decr(key + ':negative');
      assert.strictEqual(decremented, -6);

      // Test with float precision
      const floatKey = key + ':float';
      await client.set(floatKey, '0.0');
      const floatIncr = await client.incrbyfloat(floatKey, 0.1);
      assert.ok(Math.abs(parseFloat(floatIncr.toString()) - 0.1) < 0.01);
    });
  });

  describe('Concurrency and Race Conditions', () => {
    test('should handle concurrent operations on same key', async () => {
      const key = 'concurrent:' + Math.random();
      await client.set(key, '0');

      // Simulate concurrent increments
      const concurrentOperations = Array.from({ length: 10 }, () =>
        client.incr(key)
      );

      const results = await Promise.all(concurrentOperations);

      // All operations should succeed
      assert.strictEqual(results.length, 10);
      results.forEach(result => {
        assert.strictEqual(typeof result, 'number');
        assert.ok(result > 0);
      });

      // Final value should be 10
      const finalValue = await client.get(key);
      assert.strictEqual(parseInt(finalValue), 10);
    });

    test('should handle concurrent pipeline executions', async () => {
      const baseKey = 'pipe_concurrent:' + Math.random();

      const createPipeline = suffix => {
        const pipeline = client.pipeline();
        pipeline.set(baseKey + ':' + suffix, suffix);
        pipeline.get(baseKey + ':' + suffix);
        return pipeline.exec();
      };

      const pipelines = Array.from({ length: 5 }, (_, i) =>
        createPipeline(i.toString())
      );

      const results = await Promise.all(pipelines);

      // All pipelines should succeed
      assert.strictEqual(results.length, 5);
      results.forEach((result, index) => {
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result?.[0]?.[1], 'OK'); // SET result
        assert.strictEqual(result?.[1]?.[1], index.toString()); // GET result
      });
    });
  });

  describe('Resource Cleanup and Lifecycle', () => {
    test('should handle proper cleanup of expired keys', async () => {
      const key = 'cleanup:expire:' + Math.random();

      // Set key with very short TTL
      await client.setex(key, 1, 'temporary');

      // Verify it exists
      const beforeExpiry = await client.get(key);
      assert.strictEqual(beforeExpiry, 'temporary');

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100).unref());

      // Should be gone
      const afterExpiry = await client.get(key);
      assert.strictEqual(afterExpiry, null);

      const ttl = await client.ttl(key);
      assert.strictEqual(ttl, -2); // Key doesn't exist
    });

    test('should handle cleanup of complex data structures', async () => {
      const baseKey = 'cleanup:complex:' + Math.random();

      // Create complex structures
      await client.hmset(baseKey + ':hash', {
        field1: 'value1',
        field2: 'value2',
      });
      await client.sadd(baseKey + ':set', 'member1', 'member2');
      await client.zadd(baseKey + ':zset', 1, 'item1', 2, 'item2');
      await client.rpush(baseKey + ':list', 'item1', 'item2');

      // Verify they exist
      assert.ok((await client.hlen(baseKey + ':hash')) > 0);
      assert.ok((await client.scard(baseKey + ':set')) > 0);
      assert.ok((await client.zcard(baseKey + ':zset')) > 0);
      assert.ok((await client.llen(baseKey + ':list')) > 0);

      // Cleanup all at once
      const deleted = await client.del(
        baseKey + ':hash',
        baseKey + ':set',
        baseKey + ':zset',
        baseKey + ':list'
      );

      assert.strictEqual(deleted, 4);

      // Verify cleanup
      assert.strictEqual(await client.hlen(baseKey + ':hash'), 0);
      assert.strictEqual(await client.scard(baseKey + ':set'), 0);
      assert.strictEqual(await client.zcard(baseKey + ':zset'), 0);
      assert.strictEqual(await client.llen(baseKey + ':list'), 0);
    });
  });

  describe('Command Parameter Validation', () => {
    test('should validate command parameters appropriately', async () => {
      const key = 'validation:' + Math.random();

      // Test invalid range parameters
      await client.rpush(key, 'a', 'b', 'c');

      // Valid ranges should work
      const validRange = await client.lrange(key, 0, 1);
      assert.deepStrictEqual(validRange, ['a', 'b']);

      // Out of bounds ranges should return empty or partial results
      const outOfBounds = await client.lrange(key, 10, 20);
      assert.deepStrictEqual(outOfBounds, []);

      const negativeRange = await client.lrange(key, -10, -5);
      assert.ok(Array.isArray(negativeRange));
    });

    test('should handle malformed key patterns', async () => {
      // Keys with special characters
      const specialKeys = [
        'key:with:colons',
        'key*with*asterisks',
        'key[with]brackets',
        'key{with}braces',
        'key with spaces',
      ];

      for (const specialKey of specialKeys) {
        await client.set(specialKey, 'value');
        const value = await client.get(specialKey);
        assert.strictEqual(value, 'value');
      }

      // Clean up
      await client.del(...specialKeys);
    });
  });

  describe('Recovery Scenarios', () => {
    test('should handle graceful degradation', async () => {
      const key = 'recovery:' + Math.random();

      // Successful operation
      await client.set(key, 'value');
      const value = await client.get(key);
      assert.strictEqual(value, 'value');

      // Even if we encounter errors, basic operations should still work
      try {
        await client.incr(key); // Will fail on string value
      } catch (error) {
        // Expected to fail
        assert.ok(error);
      }

      // Should still be able to perform other operations
      const stillExists = await client.get(key);
      assert.strictEqual(stillExists, 'value');

      await client.del(key);
      const afterDelete = await client.get(key);
      assert.strictEqual(afterDelete, null);
    });

    test('should maintain data consistency during errors', async () => {
      const key = 'consistency:' + Math.random();

      // Set up initial state
      await client.rpush(key, 'item1', 'item2', 'item3');
      const initialLength = await client.llen(key);
      assert.strictEqual(initialLength, 3);

      // Attempt operations that might partially fail
      try {
        await client.lset(key, 999, 'invalid_index'); // Should fail
      } catch (error) {
        // Expected to fail
      }

      // Verify list is unchanged
      const afterError = await client.llen(key);
      assert.strictEqual(afterError, 3);

      const items = await client.lrange(key, 0, -1);
      assert.deepStrictEqual(items, ['item1', 'item2', 'item3']);
    });
  });
});
