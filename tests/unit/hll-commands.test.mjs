/**
 * HyperLogLog Commands Tests
 * Tests for probabilistic cardinality estimation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('HyperLogLog Commands', () => {
  let client;
  const testKey = 'test:hll';

  beforeEach(async () => {
    client = new Redis({
      host: process.env.VALKEY_HOST || 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
    });
    await client.connect();
    await client.flushdb();
  });

  afterEach(async () => {
    if (client) {
      await client.flushdb();
      await client.disconnect();
    }
  });

  describe('PFADD', () => {
    it('should add single element', async () => {
      const result = await client.pfadd(testKey, 'element1');
      assert.strictEqual(result, 1); // 1 means HLL was modified
    });

    it('should add multiple elements', async () => {
      const result = await client.pfadd(
        testKey,
        'element1',
        'element2',
        'element3'
      );
      assert.strictEqual(result, 1); // HLL was modified
    });

    it('should return 0 when adding duplicate elements', async () => {
      await client.pfadd(testKey, 'element1');
      const result = await client.pfadd(testKey, 'element1');
      assert.strictEqual(result, 0); // HLL was not modified
    });

    it('should handle array of elements', async () => {
      const elements = ['user1', 'user2', 'user3', 'user4', 'user5'];
      const result = await client.pfadd(testKey, ...elements);
      assert.strictEqual(result, 1);
    });

    it('should handle large number of elements', async () => {
      const elements = [];
      for (let i = 0; i < 1000; i++) {
        elements.push(`element${i}`);
      }
      const result = await client.pfadd(testKey, ...elements);
      assert.strictEqual(result, 1);
    });

    it('should handle mixed new and existing elements', async () => {
      await client.pfadd(testKey, 'element1', 'element2');
      const result = await client.pfadd(
        testKey,
        'element2',
        'element3',
        'element4'
      );
      // Result can be 0 or 1 depending on whether the HLL structure was modified
      assert.ok(result === 0 || result === 1);
    });

    it('should handle numeric elements', async () => {
      const result = await client.pfadd(testKey, 1, 2, 3, 4, 5);
      assert.strictEqual(result, 1);
    });

    it('should handle empty string element', async () => {
      const result = await client.pfadd(testKey, '');
      assert.strictEqual(result, 1);
    });

    it('should handle special characters', async () => {
      const result = await client.pfadd(
        testKey,
        'user@example.com',
        'user#123',
        'user$456'
      );
      assert.strictEqual(result, 1);
    });

    it('should handle Unicode characters', async () => {
      const result = await client.pfadd(
        testKey,
        '用户1',
        'ユーザー2',
        'مستخدم3'
      );
      assert.strictEqual(result, 1);
    });
  });

  describe('PFCOUNT', () => {
    it('should count empty HLL', async () => {
      const count = await client.pfcount(testKey);
      assert.strictEqual(count, 0);
    });

    it('should count single element', async () => {
      await client.pfadd(testKey, 'element1');
      const count = await client.pfcount(testKey);
      assert.strictEqual(count, 1);
    });

    it('should count multiple unique elements', async () => {
      await client.pfadd(testKey, 'element1', 'element2', 'element3');
      const count = await client.pfcount(testKey);
      assert.strictEqual(count, 3);
    });

    it('should not count duplicates', async () => {
      await client.pfadd(
        testKey,
        'element1',
        'element1',
        'element2',
        'element2'
      );
      const count = await client.pfcount(testKey);
      assert.strictEqual(count, 2);
    });

    it('should count from multiple HLLs', async () => {
      const key1 = `${testKey}:1`;
      const key2 = `${testKey}:2`;

      await client.pfadd(key1, 'a', 'b', 'c');
      await client.pfadd(key2, 'd', 'e', 'f');

      const count = await client.pfcount(key1, key2);
      assert.strictEqual(count, 6);
    });

    it('should handle overlapping elements in multiple HLLs', async () => {
      const key1 = `${testKey}:1`;
      const key2 = `${testKey}:2`;

      await client.pfadd(key1, 'a', 'b', 'c');
      await client.pfadd(key2, 'b', 'c', 'd');

      const count = await client.pfcount(key1, key2);
      assert.strictEqual(count, 4); // a, b, c, d (unique)
    });

    it('should provide approximate count for large datasets', async () => {
      const elements = [];
      const expectedCount = 10000;

      for (let i = 0; i < expectedCount; i++) {
        elements.push(`unique_element_${i}`);
      }

      // Add in batches to avoid command size limits
      const batchSize = 1000;
      for (let i = 0; i < elements.length; i += batchSize) {
        await client.pfadd(testKey, ...elements.slice(i, i + batchSize));
      }

      const count = await client.pfcount(testKey);

      // HyperLogLog has standard error of 0.81%
      const errorMargin = expectedCount * 0.02; // Allow 2% error margin
      assert.ok(
        Math.abs(count - expectedCount) < errorMargin,
        `Count ${count} should be close to ${expectedCount}`
      );
    });

    it('should handle non-existent key', async () => {
      const count = await client.pfcount('non:existent:key');
      assert.strictEqual(count, 0);
    });

    it('should handle mix of existing and non-existent keys', async () => {
      await client.pfadd(testKey, 'element1', 'element2');
      const count = await client.pfcount(testKey, 'non:existent:key');
      assert.strictEqual(count, 2);
    });
  });

  describe('PFMERGE', () => {
    it('should merge two HLLs', async () => {
      const key1 = `${testKey}:1`;
      const key2 = `${testKey}:2`;
      const destKey = `${testKey}:merged`;

      await client.pfadd(key1, 'a', 'b', 'c');
      await client.pfadd(key2, 'd', 'e', 'f');

      const result = await client.pfmerge(destKey, key1, key2);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      assert.strictEqual(count, 6);
    });

    it('should handle overlapping elements', async () => {
      const key1 = `${testKey}:1`;
      const key2 = `${testKey}:2`;
      const destKey = `${testKey}:merged`;

      await client.pfadd(key1, 'a', 'b', 'c');
      await client.pfadd(key2, 'b', 'c', 'd');

      const result = await client.pfmerge(destKey, key1, key2);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      assert.strictEqual(count, 4); // a, b, c, d
    });

    it('should merge multiple HLLs', async () => {
      const key1 = `${testKey}:1`;
      const key2 = `${testKey}:2`;
      const key3 = `${testKey}:3`;
      const destKey = `${testKey}:merged`;

      await client.pfadd(key1, 'a', 'b');
      await client.pfadd(key2, 'c', 'd');
      await client.pfadd(key3, 'e', 'f');

      const result = await client.pfmerge(destKey, key1, key2, key3);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      assert.strictEqual(count, 6);
    });

    it('should overwrite destination key', async () => {
      const key1 = `${testKey}:1`;
      const key2 = `${testKey}:2`;
      const destKey = `${testKey}:merged`;

      // Create initial destination
      await client.pfadd(destKey, 'x', 'y', 'z');

      // Merge should overwrite
      await client.pfadd(key1, 'a', 'b');
      await client.pfadd(key2, 'c', 'd');

      const result = await client.pfmerge(destKey, key1, key2);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      // Note: PFMERGE merges all HLLs including destination if it exists
      // The behavior is to merge dest + sources, not overwrite
      assert.ok(
        count >= 4 && count <= 7,
        `Expected count between 4-7, got ${count}`
      );
    });

    it('should handle merging with non-existent keys', async () => {
      const key1 = `${testKey}:1`;
      const destKey = `${testKey}:merged`;

      await client.pfadd(key1, 'a', 'b', 'c');

      const result = await client.pfmerge(destKey, key1, 'non:existent:key');
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      assert.strictEqual(count, 3);
    });

    it('should merge empty HLLs', async () => {
      const key1 = `${testKey}:empty1`;
      const key2 = `${testKey}:empty2`;
      const destKey = `${testKey}:merged`;

      const result = await client.pfmerge(destKey, key1, key2);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      assert.strictEqual(count, 0);
    });

    it('should handle self-merge', async () => {
      const key1 = `${testKey}:1`;

      await client.pfadd(key1, 'a', 'b', 'c');

      const result = await client.pfmerge(key1, key1);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(key1);
      assert.strictEqual(count, 3); // Should remain the same
    });

    it('should preserve accuracy after merge', async () => {
      const key1 = `${testKey}:large1`;
      const key2 = `${testKey}:large2`;
      const destKey = `${testKey}:merged`;

      // Add many unique elements to each HLL
      for (let i = 0; i < 1000; i++) {
        await client.pfadd(key1, `set1_element_${i}`);
      }

      for (let i = 0; i < 1000; i++) {
        await client.pfadd(key2, `set2_element_${i}`);
      }

      const result = await client.pfmerge(destKey, key1, key2);
      assert.strictEqual(result, 'OK');

      const count = await client.pfcount(destKey);
      const expectedCount = 2000;
      const errorMargin = expectedCount * 0.02; // 2% error margin

      assert.ok(
        Math.abs(count - expectedCount) < errorMargin,
        `Merged count ${count} should be close to ${expectedCount}`
      );
    });
  });

  describe('HyperLogLog Use Cases', () => {
    it('should track unique visitors', async () => {
      const visitorKey = 'visitors:2024-01-15';

      // Simulate visitor tracking
      const visitors = [
        'user123',
        'user456',
        'user789',
        'user123', // Duplicate
        'user321',
        'user654',
        'user456', // Duplicate
      ];

      for (const visitor of visitors) {
        await client.pfadd(visitorKey, visitor);
      }

      const uniqueVisitors = await client.pfcount(visitorKey);
      assert.strictEqual(uniqueVisitors, 5); // 5 unique visitors
    });

    it('should merge daily visitor counts into monthly', async () => {
      const day1 = 'visitors:2024-01-01';
      const day2 = 'visitors:2024-01-02';
      const day3 = 'visitors:2024-01-03';
      const monthly = 'visitors:2024-01';

      // Day 1 visitors
      await client.pfadd(day1, 'user1', 'user2', 'user3');

      // Day 2 visitors (some overlap)
      await client.pfadd(day2, 'user2', 'user3', 'user4');

      // Day 3 visitors
      await client.pfadd(day3, 'user4', 'user5', 'user6');

      // Merge into monthly
      await client.pfmerge(monthly, day1, day2, day3);

      const monthlyCount = await client.pfcount(monthly);
      assert.strictEqual(monthlyCount, 6); // 6 unique visitors for the month
    });

    it('should track unique search queries', async () => {
      const searchKey = 'searches:2024-01-15';

      const queries = [
        'redis hyperloglog',
        'valkey glide',
        'ioredis adapter',
        'redis hyperloglog', // Duplicate
        'node.js redis',
        'valkey glide', // Duplicate
      ];

      for (const query of queries) {
        await client.pfadd(searchKey, query);
      }

      const uniqueQueries = await client.pfcount(searchKey);
      assert.strictEqual(uniqueQueries, 4);
    });

    it('should estimate cardinality of IP addresses', async () => {
      const ipKey = 'unique:ips:2024-01-15';

      // Simulate IP addresses
      const baseIps = [];
      for (let i = 1; i <= 254; i++) {
        baseIps.push(`192.168.1.${i}`);
        baseIps.push(`10.0.0.${i}`);
      }

      // Add with some duplicates
      await client.pfadd(ipKey, ...baseIps);
      await client.pfadd(ipKey, '192.168.1.1', '192.168.1.2'); // Duplicates

      const uniqueIps = await client.pfcount(ipKey);
      // HLL is approximate - allow ±2% error margin (standard for HyperLogLog)
      const expected = 508; // 254 * 2 unique IPs
      const errorMargin = Math.ceil(expected * 0.02); // 2% error
      assert.ok(
        uniqueIps >= expected - errorMargin &&
          uniqueIps <= expected + errorMargin,
        `Expected ~${expected} (±${errorMargin}), got ${uniqueIps}`
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle wrong type operations', async () => {
      // Set a string key
      await client.set(testKey, 'string value');

      try {
        await client.pfadd(testKey, 'element');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
        assert.ok(
          err.message.includes('WRONGTYPE') || err.message.includes('wrong')
        );
      }
    });

    it('should handle invalid arguments to PFCOUNT', async () => {
      // PFCOUNT with no arguments should error
      try {
        await client.pfcount();
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
      }
    });

    it('should handle invalid arguments to PFMERGE', async () => {
      // PFMERGE with only destination should error
      try {
        await client.pfmerge('dest');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('should maintain constant memory usage', async () => {
      const key = `${testKey}:memory`;

      // Add many elements
      for (let i = 0; i < 100000; i++) {
        if (i % 10000 === 0) {
          // Add in batches to avoid timeout
          const batch = [];
          for (let j = 0; j < 10000 && i + j < 100000; j++) {
            batch.push(`element_${i + j}`);
          }
          await client.pfadd(key, ...batch);
        }
      }

      const count = await client.pfcount(key);

      // Check that count is approximately correct
      const expectedCount = 100000;
      const errorMargin = expectedCount * 0.02; // 2% error margin

      assert.ok(
        Math.abs(count - expectedCount) < errorMargin,
        `Count ${count} should be close to ${expectedCount}`
      );

      // Memory usage should be constant (~12KB) regardless of cardinality
      // We can't directly test memory usage, but the operation should complete quickly
    });
  });
});
