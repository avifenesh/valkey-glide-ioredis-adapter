/**
 * List Commands Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */

import { RedisAdapter } from '../../src/adapters/RedisAdapter';
import { testUtils } from '../setup';

describe('List Commands (ioredis compatibility)', () => {
  let redis: RedisAdapter;

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available. Please start Redis server before running tests.');
    }
  });

  beforeEach(async () => {
    // Health check before each test
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers became unavailable during test execution');
    }
    
    // Use test server configuration
    const config = await testUtils.getStandaloneConfig();
    redis = new RedisAdapter(config);
    await redis.connect();
    
    // Clean up any existing test data
    try {
      await redis.del('mylist', 'newlist', 'anotherlist', 'emptylist', 'nonexistent', 'largehash', 'existing', 'largelist');
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    if (redis) {
      await redis.disconnect();
    }
  });

  describe('LPUSH and RPUSH operations', () => {
    test('lpush should add elements to the head of list', async () => {
      // ioredis variadic pattern: redis.lpush('list', 'elem1', 'elem2', 'elem3')
      const length = await redis.lpush('mylist', 'elem1', 'elem2', 'elem3');
      expect(length).toBe(3);
      
      // Elements should be in reverse order (last pushed is first)
      const result = await redis.lrange('mylist', 0, -1);
      expect(result).toEqual(['elem3', 'elem2', 'elem1']);
    });

    test('lpush should accept array format', async () => {
      // ioredis array pattern: redis.lpush('list', ['elem1', 'elem2'])
      const length = await redis.lpush('mylist', ['elem1', 'elem2']);
      expect(length).toBe(2);
      
      const result = await redis.lrange('mylist', 0, -1);
      expect(result).toEqual(['elem2', 'elem1']);
    });

    test('rpush should add elements to the tail of list', async () => {
      // ioredis variadic pattern: redis.rpush('list', 'elem1', 'elem2', 'elem3')
      const length = await redis.rpush('mylist', 'elem1', 'elem2', 'elem3');
      expect(length).toBe(3);
      
      const result = await redis.lrange('mylist', 0, -1);
      expect(result).toEqual(['elem1', 'elem2', 'elem3']);
    });

    test('rpush should accept array format', async () => {
      const length = await redis.rpush('mylist', ['elem1', 'elem2']);
      expect(length).toBe(2);
      
      const result = await redis.lrange('mylist', 0, -1);
      expect(result).toEqual(['elem1', 'elem2']);
    });

    test('lpush and rpush should work on existing list', async () => {
      await redis.rpush('mylist', 'middle');
      await redis.lpush('mylist', 'first');
      await redis.rpush('mylist', 'last');
      
      const result = await redis.lrange('mylist', 0, -1);
      expect(result).toEqual(['first', 'middle', 'last']);
    });

    test('push operations should create list if it does not exist', async () => {
      const length1 = await redis.lpush('newlist', 'element');
      expect(length1).toBe(1);
      
      const length2 = await redis.rpush('anotherlist', 'element');
      expect(length2).toBe(1);
    });
  });

  describe('LPOP and RPOP operations', () => {
    test('lpop should remove and return first element', async () => {
      await redis.rpush('mylist', 'first', 'second', 'third');
      
      const element = await redis.lpop('mylist');
      expect(element).toBe('first');
      
      const remaining = await redis.lrange('mylist', 0, -1);
      expect(remaining).toEqual(['second', 'third']);
    });

    test('rpop should remove and return last element', async () => {
      await redis.rpush('mylist', 'first', 'second', 'third');
      
      const element = await redis.rpop('mylist');
      expect(element).toBe('third');
      
      const remaining = await redis.lrange('mylist', 0, -1);
      expect(remaining).toEqual(['first', 'second']);
    });

    test('pop operations should return null for empty list', async () => {
      expect(await redis.lpop('emptylist')).toBeNull();
      expect(await redis.rpop('emptylist')).toBeNull();
    });

    test('pop operations should return null for non-existent list', async () => {
      expect(await redis.lpop('nonexistent')).toBeNull();
      expect(await redis.rpop('nonexistent')).toBeNull();
    });

    test('lpop with count should remove multiple elements', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c', 'd', 'e');
      
      const elements = await redis.lpop('mylist', 3);
      expect(elements).toEqual(['a', 'b', 'c']);
      
      const remaining = await redis.lrange('mylist', 0, -1);
      expect(remaining).toEqual(['d', 'e']);
    });

    test('rpop with count should remove multiple elements', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c', 'd', 'e');
      
      const elements = await redis.rpop('mylist', 3);
      expect(elements).toEqual(['e', 'd', 'c']);
      
      const remaining = await redis.lrange('mylist', 0, -1);
      expect(remaining).toEqual(['a', 'b']);
    });
  });

  describe('LRANGE operation', () => {
    test('lrange should return elements within range', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c', 'd', 'e');
      
      // Get first 3 elements
      const result1 = await redis.lrange('mylist', 0, 2);
      expect(result1).toEqual(['a', 'b', 'c']);
      
      // Get last 2 elements using negative indices
      const result2 = await redis.lrange('mylist', -2, -1);
      expect(result2).toEqual(['d', 'e']);
      
      // Get all elements
      const result3 = await redis.lrange('mylist', 0, -1);
      expect(result3).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    test('lrange should handle out-of-bounds indices', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c');
      
      // Start index beyond list size
      const result1 = await redis.lrange('mylist', 10, 20);
      expect(result1).toEqual([]);
      
      // End index beyond list size
      const result2 = await redis.lrange('mylist', 0, 10);
      expect(result2).toEqual(['a', 'b', 'c']);
      
      // Negative start index beyond list size
      const result3 = await redis.lrange('mylist', -10, -1);
      expect(result3).toEqual(['a', 'b', 'c']);
    });

    test('lrange should return empty array for non-existent list', async () => {
      const result = await redis.lrange('nonexistent', 0, -1);
      expect(result).toEqual([]);
    });
  });

  describe('List inspection operations', () => {
    test('llen should return list length', async () => {
      expect(await redis.llen('emptylist')).toBe(0);
      
      await redis.rpush('mylist', 'a', 'b', 'c');
      expect(await redis.llen('mylist')).toBe(3);
      
      await redis.lpop('mylist');
      expect(await redis.llen('mylist')).toBe(2);
    });

    test('lindex should return element at index', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c', 'd');
      
      expect(await redis.lindex('mylist', 0)).toBe('a');
      expect(await redis.lindex('mylist', 1)).toBe('b');
      expect(await redis.lindex('mylist', -1)).toBe('d'); // Last element
      expect(await redis.lindex('mylist', -2)).toBe('c'); // Second to last
    });

    test('lindex should return null for out-of-bounds index', async () => {
      await redis.rpush('mylist', 'a', 'b');
      
      expect(await redis.lindex('mylist', 5)).toBeNull();
      expect(await redis.lindex('mylist', -5)).toBeNull();
    });

    test('lindex should return null for non-existent list', async () => {
      expect(await redis.lindex('nonexistent', 0)).toBeNull();
    });
  });

  describe('List modification operations', () => {
    test('lset should set element at index', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c');
      
      const result = await redis.lset('mylist', 1, 'modified');
      expect(result).toBe('OK');
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['a', 'modified', 'c']);
    });

    test('lset should work with negative indices', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c');
      
      await redis.lset('mylist', -1, 'last_modified');
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['a', 'b', 'last_modified']);
    });

    test('lset should throw error for out-of-bounds index', async () => {
      await redis.rpush('mylist', 'a', 'b');
      await expect(redis.lset('mylist', 5, 'value')).rejects.toThrow();
    });

    test('lset should throw error for non-existent list', async () => {
      await expect(redis.lset('nonexistent', 0, 'value')).rejects.toThrow();
    });

    test('ltrim should trim list to specified range', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c', 'd', 'e');
      
      const result = await redis.ltrim('mylist', 1, 3);
      expect(result).toBe('OK');
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['b', 'c', 'd']);
    });

    test('ltrim with negative indices', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c', 'd', 'e');
      
      await redis.ltrim('mylist', -3, -1); // Keep last 3 elements
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['c', 'd', 'e']);
    });
  });

  describe('LREM operation', () => {
    test('lrem should remove elements equal to value', async () => {
      await redis.rpush('mylist', 'a', 'b', 'a', 'c', 'a');
      
      // Remove first 2 occurrences of 'a'
      const removed = await redis.lrem('mylist', 2, 'a');
      expect(removed).toBe(2);
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['b', 'c', 'a']);
    });

    test('lrem with negative count should remove from tail', async () => {
      await redis.rpush('mylist', 'a', 'b', 'a', 'c', 'a');
      
      // Remove last 2 occurrences of 'a'
      const removed = await redis.lrem('mylist', -2, 'a');
      expect(removed).toBe(2);
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['a', 'b', 'c']);
    });

    test('lrem with count 0 should remove all occurrences', async () => {
      await redis.rpush('mylist', 'a', 'b', 'a', 'c', 'a');
      
      const removed = await redis.lrem('mylist', 0, 'a');
      expect(removed).toBe(3);
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['b', 'c']);
    });

    test('lrem should return 0 if element not found', async () => {
      await redis.rpush('mylist', 'a', 'b', 'c');
      
      const removed = await redis.lrem('mylist', 1, 'x');
      expect(removed).toBe(0);
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['a', 'b', 'c']); // Unchanged
    });

    test('lrem should return 0 for non-existent list', async () => {
      const removed = await redis.lrem('nonexistent', 1, 'a');
      expect(removed).toBe(0);
    });
  });

  describe('Conditional push operations', () => {
    test('lpushx should only push to existing list', async () => {
      // Should fail on non-existent list
      const length1 = await redis.lpushx('nonexistent', 'value');
      expect(length1).toBe(0);
      
      // Should work on existing list
      await redis.lpush('existing', 'first');
      const length2 = await redis.lpushx('existing', 'second');
      expect(length2).toBe(2);
      
      const list = await redis.lrange('existing', 0, -1);
      expect(list).toEqual(['second', 'first']);
    });

    test('rpushx should only push to existing list', async () => {
      // Should fail on non-existent list  
      const length1 = await redis.rpushx('nonexistent', 'value');
      expect(length1).toBe(0);
      
      // Should work on existing list
      await redis.rpush('existing', 'first');
      const length2 = await redis.rpushx('existing', 'second');
      expect(length2).toBe(2);
      
      const list = await redis.lrange('existing', 0, -1);
      expect(list).toEqual(['first', 'second']);
    });
  });

  describe('Edge cases and error handling', () => {
    test('operations should handle empty strings', async () => {
      await redis.rpush('mylist', '', 'middle', '');
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(['', 'middle', '']);
    });

    test('operations should handle special characters', async () => {
      const specialValues = ['🚀', 'hello\nworld', 'tab\there', 'quote"test'];
      await redis.rpush('mylist', ...specialValues);
      
      const list = await redis.lrange('mylist', 0, -1);
      expect(list).toEqual(specialValues);
    });

    test('operations should handle large lists', async () => {
      const elements = Array.from({ length: 1000 }, (_, i) => `element${i}`);
      await redis.rpush('largelist', ...elements);
      
      expect(await redis.llen('largelist')).toBe(1000);
      
      // Test range operations on large list
      const first10 = await redis.lrange('largelist', 0, 9);
      expect(first10).toEqual(elements.slice(0, 10));
      
      const last10 = await redis.lrange('largelist', -10, -1);
      expect(last10).toEqual(elements.slice(-10));
    });

    test('operations should handle large individual elements', async () => {
      const largeElement = 'x'.repeat(10000);
      await redis.rpush('mylist', largeElement);
      
      expect(await redis.lindex('mylist', 0)).toBe(largeElement);
      expect(await redis.lpop('mylist')).toBe(largeElement);
    });
  });
});