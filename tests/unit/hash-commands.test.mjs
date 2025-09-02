import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
/**
 * Hash Commands Comprehensive Tests
 * Real-world patterns: Session storage, user profiles, object caching, shopping carts
 */

import pkg from '../../dist/index.js';
const { Redis  } = pkg;
import { getRedisTestConfig } from '../utils/redis-config';

describe('Hash Commands - Real-World Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = await getRedisTestConfig();
    redis = new Redis(config);
  });

  afterEach(async () => {
    await redis.disconnect();
  });

  describe('User Session Management', () => {
    it('should manage user session data with HSET/HGET', async () => {
      const sessionKey = 'session:' + Math.random();

      // Create session
      const result1 = await redis.hset(sessionKey, 'userId', '12345');
      assert.strictEqual(result1, 1);

      const result2 = await redis.hset(
        sessionKey,
        'username',
        'john_doe',
        'email',
        'john@example.com'
      );
      assert.strictEqual(result2, 2);

      // Retrieve session data
      const userId = await redis.hget(sessionKey, 'userId');
      assert.strictEqual(userId, '12345');

      const username = await redis.hget(sessionKey, 'username');
      assert.strictEqual(username, 'john_doe');

      const nonexistent = await redis.hget(sessionKey, 'nonexistent');
      assert.strictEqual(nonexistent, null);
    });

    it('should handle bulk session operations with HMGET/HMSET', async () => {
      const sessionKey = 'session:bulk:' + Math.random();

      // Set multiple fields at once with object
      const sessionData = {
        userId: '67890',
        username: 'jane_doe',
        email: 'jane@example.com',
        role: 'admin',
        lastLogin: '2024-01-01T12:00:00Z',
      };

      const result = await redis.hmset(sessionKey, sessionData);
      assert.strictEqual(result, 'OK');

      // Get multiple fields at once
      const values = await redis.hmget(
        sessionKey,
        'userId',
        'username',
        'email',
        'nonexistent'
      );
      assert.deepStrictEqual(values, ['67890', 'jane_doe', 'jane@example.com', null]);

      // Get all session data
      const allData = await redis.hgetall(sessionKey);
      assert.deepStrictEqual(allData, sessionData);
    });

    it('should update session counters with HINCRBY', async () => {
      const sessionKey = 'session:counter:' + Math.random();

      // Initialize session with login count
      await redis.hset(sessionKey, 'loginCount', '1');

      // Increment login count
      const newCount = await redis.hincrby(sessionKey, 'loginCount', 1);
      assert.strictEqual(newCount, 2);

      // Increment non-existent field
      const pageViews = await redis.hincrby(sessionKey, 'pageViews', 5);
      assert.strictEqual(pageViews, 5);

      const finalCount = await redis.hget(sessionKey, 'loginCount');
      assert.strictEqual(finalCount, '2');
    });
  });

  describe('User Profile Caching', () => {
    it('should cache user profiles with HGETALL', async () => {
      const profileKey = 'profile:user:' + Math.random();

      // Store user profile
      const profileData = {
        id: '123',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        preferences: JSON.stringify({ theme: 'dark', notifications: true }),
      };

      const result = await redis.hmset(profileKey, profileData);
      assert.strictEqual(result, 'OK');

      // Retrieve full profile
      const storedProfile = await redis.hgetall(profileKey);
      assert.strictEqual(storedProfile.id, '123');
      assert.strictEqual(storedProfile.name, 'Alice Johnson');

      const preferences = JSON.parse(storedProfile.preferences!);
      assert.strictEqual(preferences.theme, 'dark');
      assert.strictEqual(preferences.notifications, true);
    });

    it('should handle profile field operations', async () => {
      const profileKey = 'profile:fields:' + Math.random();

      await redis.hset(profileKey, 'name', 'Bob Smith', 'age', '30');

      // Check field existence
      const nameExists = await redis.hexists(profileKey, 'name');
      assert.strictEqual(nameExists, 1);

      const emailExists = await redis.hexists(profileKey, 'email');
      assert.strictEqual(emailExists, 0);

      // Get field count
      const fieldCount = await redis.hlen(profileKey);
      assert.strictEqual(fieldCount, 2);

      // Get all field names
      const fieldNames = await redis.hkeys(profileKey);
      expect(fieldNames.sort()).toEqual(['age', 'name']);

      // Get all values
      const values = await redis.hvals(profileKey);
      expect(values.sort()).toEqual(['30', 'Bob Smith']);
    });
  });

  describe('Shopping Cart Implementation', () => {
    it('should manage shopping cart items', async () => {
      const cartKey = 'cart:user:' + Math.random();

      // Add items to cart
      await redis.hset(
        cartKey,
        'item_1',
        JSON.stringify({
          productId: 'PROD-001',
          name: 'Laptop',
          price: 999.99,
          quantity,
        })
      );

      await redis.hset(
        cartKey,
        'item_2',
        JSON.stringify({
          productId: 'PROD-002',
          name: 'Mouse',
          price: 29.99,
          quantity,
        })
      );

      // Get cart contents
      const cartItems = await redis.hgetall(cartKey);
      expect(Object.keys(cartItems)).toHaveLength(2);

      const item1 = JSON.parse(cartItems.item_1!);
      assert.strictEqual(item1.productId, 'PROD-001');
      assert.strictEqual(item1.price, 999.99);

      // Remove an item
      const removed = await redis.hdel(cartKey, 'item_1');
      assert.strictEqual(removed, 1);

      const remainingItems = await redis.hlen(cartKey);
      assert.strictEqual(remainingItems, 1);
    });

    it('should handle cart item quantity updates', async () => {
      const cartKey = 'cart:quantity:' + Math.random();

      // Add item with quantity
      await redis.hset(cartKey, 'item_quantity_1', '3');

      // Increase quantity
      const newQuantity = await redis.hincrby(cartKey, 'item_quantity_1', 2);
      assert.strictEqual(newQuantity, 5);

      // Decrease quantity
      const decreasedQuantity = await redis.hincrby(
        cartKey,
        'item_quantity_1',
        -1
      );
      assert.strictEqual(decreasedQuantity, 4);
    });
  });

  describe('Advanced Hash Operations', () => {
    it('should handle floating point increments', async () => {
      const metricsKey = 'metrics:' + Math.random();

      // Initialize metrics
      await redis.hset(metricsKey, 'cpu_usage', '45.5');

      // Increment with float
      const newCpuUsage = await redis.hincrbyfloat(
        metricsKey,
        'cpu_usage',
        2.3
      );
      expect(parseFloat(newCpuUsage.toString())).toBeCloseTo(47.8, 1);

      // Initialize new field with float increment
      const diskUsage = await redis.hincrbyfloat(
        metricsKey,
        'disk_usage',
        33.7
      );
      expect(parseFloat(diskUsage.toString())).toBeCloseTo(33.7, 1);
    });

    it('should handle conditional field setting with HSETNX', async () => {
      const configKey = 'config:app:' + Math.random();

      // Set default configuration
      const result1 = await redis.hsetnx(configKey, 'theme', 'light');
      assert.strictEqual(result1, 1); // Field was set

      const result2 = await redis.hsetnx(configKey, 'theme', 'dark');
      assert.strictEqual(result2, 0); // Field was not set (already exists)

      // Verify the original value wasn't changed
      const theme = await redis.hget(configKey, 'theme');
      assert.strictEqual(theme, 'light');

      // Set a new field
      const result3 = await redis.hsetnx(configKey, 'language', 'en');
      assert.strictEqual(result3, 1);
    });

    it('should handle bulk field deletion', async () => {
      const tempKey = 'temp:data:' + Math.random();

      // Create hash with multiple fields
      await redis.hmset(tempKey, {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
        field4: 'value4',
      });

      const initialCount = await redis.hlen(tempKey);
      assert.strictEqual(initialCount, 4);

      // Delete multiple fields
      const deletedCount = await redis.hdel(
        tempKey,
        'field1',
        'field3',
        'nonexistent'
      );
      assert.strictEqual(deletedCount, 2); // Only 2 fields existed and were deleted

      const remainingCount = await redis.hlen(tempKey);
      assert.strictEqual(remainingCount, 2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle operations on non-existent hashes', async () => {
      const nonExistentKey = 'nonexistent:hash:' + Math.random();

      // Operations on non-existent hash should return appropriate defaults
      const value = await redis.hget(nonExistentKey, 'field');
      assert.strictEqual(value, null);

      const values = await redis.hmget(nonExistentKey, 'field1', 'field2');
      assert.deepStrictEqual(values, [null, null]);

      const allData = await redis.hgetall(nonExistentKey);
      assert.deepStrictEqual(allData, {});

      const exists = await redis.hexists(nonExistentKey, 'field');
      assert.strictEqual(exists, 0);

      const length = await redis.hlen(nonExistentKey);
      assert.strictEqual(length, 0);

      const keys = await redis.hkeys(nonExistentKey);
      assert.deepStrictEqual(keys, []);

      const vals = await redis.hvals(nonExistentKey);
      assert.deepStrictEqual(vals, []);
    });

    it('should handle type conflicts gracefully', async () => {
      const stringKey = 'string:key:' + Math.random();

      // Set a string value
      await redis.set(stringKey, 'not-a-hash');

      // Hash operations should fail on string keys
      await expect(redis.hset(stringKey, 'field', 'value')).rejects.toThrow();
      await expect(redis.hget(stringKey, 'field')).rejects.toThrow();
    });

    it('should handle empty field names and values', async () => {
      const edgeCaseKey = 'edge:case:' + Math.random();

      // Test empty value
      const result = await redis.hset(edgeCaseKey, 'empty_value', '');
      assert.strictEqual(result, 1);

      // Retrieve empty value
      const emptyValue = await redis.hget(edgeCaseKey, 'empty_value');
      assert.strictEqual(emptyValue, '');
    });
  });
});
