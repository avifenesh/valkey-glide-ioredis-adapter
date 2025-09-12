/**
 * Hash Commands Comprehensive Tests
 * Real-world patterns storage, user profiles, object caching, shopping carts
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { describeForEachMode, createClient, flushAll, keyTag } from '../setup/dual-mode.mjs';

describeForEachMode('Hash Commands - Real-World Patterns', mode => {
  let client;
  let tag;

  beforeEach(async () => {
    client = await createClient(mode);
    await client.connect();
    await flushAll(client);
    tag = keyTag('h');
  });

  afterEach(async () => {
    await client.quit();
  });

  describe('User Session Management', () => {
    test('should manage user session data with HSET/HGET', async () => {
      const sessionKey = `${tag}:session:${Math.random()}`;

      // Create session
      const result1 = await client.hset(sessionKey, 'userId', '12345');
      assert.strictEqual(result1, 1);

      const result2 = await client.hset(
        sessionKey,
        'username',
        'john_doe',
        'email',
        'john@example.com'
      );
      assert.strictEqual(result2, 2);

      // Retrieve session data
      const userId = await client.hget(sessionKey, 'userId');
      assert.strictEqual(userId, '12345');

      const username = await client.hget(sessionKey, 'username');
      assert.strictEqual(username, 'john_doe');

      const nonexistent = await client.hget(sessionKey, 'nonexistent');
      assert.strictEqual(nonexistent, null);
    });

    test('should handle bulk session operations with HMGET/HMSET', async () => {
      const sessionKey = `${tag}:session:bulk:${Math.random()}`;

      // Set multiple fields at once with object
      const sessionData = {
        userId: '67890',
        username: 'jane_doe',
        email: 'jane@example.com',
        role: 'admin',
        lastLogin: '2024-01-01T12:00:00Z',
      };

      const result = await client.hmset(sessionKey, sessionData);
      assert.strictEqual(result, 'OK');

      // Get multiple fields at once
      const values = await client.hmget(
        sessionKey,
        'userId',
        'username',
        'email',
        'nonexistent'
      );
      assert.deepStrictEqual(values, [
        '67890',
        'jane_doe',
        'jane@example.com',
        null,
      ]);

      // Get all session data
      const allData = await client.hgetall(sessionKey);
      assert.deepStrictEqual(allData, sessionData);
    });

    test('should update session counters with HINCRBY', async () => {
      const sessionKey = `${tag}:session:counter:${Math.random()}`;

      // Initialize session with login count
      await client.hset(sessionKey, 'loginCount', '1');

      // Increment login count
      const newCount = await client.hincrby(sessionKey, 'loginCount', 1);
      assert.strictEqual(newCount, 2);

      // Increment non-existent field
      const pageViews = await client.hincrby(sessionKey, 'pageViews', 5);
      assert.strictEqual(pageViews, 5);

      const finalCount = await client.hget(sessionKey, 'loginCount');
      assert.strictEqual(finalCount, '2');
    });
  });

  describe('User Profile Caching', () => {
    test('should cache user profiles with HGETALL', async () => {
      const profileKey = `${tag}:profile:user:${Math.random()}`;

      // Store user profile
      const profileData = {
        id: '123',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        preferences: JSON.stringify({ theme: 'dark', notifications: true }),
      };

      const result = await client.hmset(profileKey, profileData);
      assert.strictEqual(result, 'OK');

      // Retrieve full profile
      const storedProfile = await client.hgetall(profileKey);
      assert.strictEqual(storedProfile.id, '123');
      assert.strictEqual(storedProfile.name, 'Alice Johnson');

      assert.ok(storedProfile.preferences, 'preferences field should exist');
      const preferences = JSON.parse(storedProfile.preferences);
      assert.strictEqual(preferences.theme, 'dark');
      assert.strictEqual(preferences.notifications, true);
    });

    test('should handle profile field operations', async () => {
      const profileKey = `${tag}:profile:fields:${Math.random()}`;

      await client.hset(profileKey, 'name', 'Bob Smith', 'age', '30');

      // Check field existence
      const nameExists = await client.hexists(profileKey, 'name');
      assert.strictEqual(nameExists, 1);

      const emailExists = await client.hexists(profileKey, 'email');
      assert.strictEqual(emailExists, 0);

      // Get field count
      const fieldCount = await client.hlen(profileKey);
      assert.strictEqual(fieldCount, 2);

      // Get all field names
      const fieldNames = await client.hkeys(profileKey);
      assert.deepStrictEqual(fieldNames.sort(), ['age', 'name']);

      // Get all values
      const values = await client.hvals(profileKey);
      assert.deepStrictEqual(values.sort(), ['30', 'Bob Smith']);
    });
  });

  describe('Shopping Cart Implementation', () => {
    test('should manage shopping cart items', async () => {
      const cartKey = `${tag}:cart:user:${Math.random()}`;

      // Add items to cart
      await client.hset(
        cartKey,
        'item_1',
        JSON.stringify({
          productId: 'PROD-001',
          name: 'Laptop',
          price: 999.99,
          quantity: 1,
        })
      );

      await client.hset(
        cartKey,
        'item_2',
        JSON.stringify({
          productId: 'PROD-002',
          name: 'Mouse',
          price: 29.99,
          quantity: 2,
        })
      );

      // Get cart contents
      const cartItems = await client.hgetall(cartKey);
      assert.strictEqual(Object.keys(cartItems).length, 2);

      const item1 = JSON.parse(cartItems.item_1);
      assert.strictEqual(item1.productId, 'PROD-001');
      assert.strictEqual(item1.price, 999.99);

      // Remove an item
      const removed = await client.hdel(cartKey, 'item_1');
      assert.strictEqual(removed, 1);

      const remainingItems = await client.hlen(cartKey);
      assert.strictEqual(remainingItems, 1);
    });

    test('should handle cart item quantity updates', async () => {
      const cartKey = `${tag}:cart:quantity:${Math.random()}`;

      // Add item with quantity
      await client.hset(cartKey, 'item_quantity_1', '3');

      // Increase quantity
      const newQuantity = await client.hincrby(cartKey, 'item_quantity_1', 2);
      assert.strictEqual(newQuantity, 5);

      // Decrease quantity
      const decreasedQuantity = await client.hincrby(
        cartKey,
        'item_quantity_1',
        -1
      );
      assert.strictEqual(decreasedQuantity, 4);
    });
  });

  describe('Advanced Hash Operations', () => {
    test('should handle floating point increments', async () => {
      const metricsKey = `${tag}:metrics:${Math.random()}`;

      // Initialize metrics
      await client.hset(metricsKey, 'cpu_usage', '45.5');

      // Increment with float
      const newCpuUsage = await client.hincrbyfloat(
        metricsKey,
        'cpu_usage',
        2.3
      );
      const cpuValue = parseFloat(newCpuUsage.toString());
      assert.ok(Math.abs(cpuValue - 47.8) < 0.1);

      // Initialize new field with float increment
      const diskUsage = await client.hincrbyfloat(
        metricsKey,
        'disk_usage',
        33.7
      );
      const diskValue = parseFloat(diskUsage.toString());
      assert.ok(Math.abs(diskValue - 33.7) < 0.1);
    });

    test('should handle conditional field setting with HSETNX', async () => {
      const configKey = `${tag}:config:app:${Math.random()}`;

      // Set default configuration
      const result1 = await client.hsetnx(configKey, 'theme', 'light');
      assert.strictEqual(result1, 1); // Field was set

      const result2 = await client.hsetnx(configKey, 'theme', 'dark');
      assert.strictEqual(result2, 0); // Field was not set (already exists)

      // Verify the original value wasn't changed
      const theme = await client.hget(configKey, 'theme');
      assert.strictEqual(theme, 'light');

      // Set a new field
      const result3 = await client.hsetnx(configKey, 'language', 'en');
      assert.strictEqual(result3, 1);
    });

    test('should handle bulk field deletion', async () => {
      const tempKey = `${tag}:temp:data:${Math.random()}`;

      // Create hash with multiple fields
      await client.hmset(tempKey, {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
        field4: 'value4',
      });

      const initialCount = await client.hlen(tempKey);
      assert.strictEqual(initialCount, 4);

      // Delete multiple fields
      const deletedCount = await client.hdel(
        tempKey,
        'field1',
        'field3',
        'nonexistent'
      );
      assert.strictEqual(deletedCount, 2); // Only 2 fields existed and were deleted

      const remainingCount = await client.hlen(tempKey);
      assert.strictEqual(remainingCount, 2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle operations on non-existent hashes', async () => {
      const nonExistentKey = `${tag}:nonexistent:hash:${Math.random()}`;

      // Operations on non-existent hash should return appropriate defaults
      const value = await client.hget(nonExistentKey, 'field');
      assert.strictEqual(value, null);

      const values = await client.hmget(nonExistentKey, 'field1', 'field2');
      assert.deepStrictEqual(values, [null, null]);

      const allData = await client.hgetall(nonExistentKey);
      assert.deepStrictEqual(allData, {});

      const exists = await client.hexists(nonExistentKey, 'field');
      assert.strictEqual(exists, 0);

      const length = await client.hlen(nonExistentKey);
      assert.strictEqual(length, 0);

      const keys = await client.hkeys(nonExistentKey);
      assert.deepStrictEqual(keys, []);

      const vals = await client.hvals(nonExistentKey);
      assert.deepStrictEqual(vals, []);
    });

    test('should handle type conflicts gracefully', async () => {
      const stringKey = `${tag}:string:key:${Math.random()}`;

      // Set a string value
      await client.set(stringKey, 'not-a-hash');

      // Hash operations should fail on string keys
      await assert.rejects(async () => {
        await client.hset(stringKey, 'field', 'value');
      });
      await assert.rejects(async () => {
        await client.hget(stringKey, 'field');
      });
    });

    test('should handle empty field names and values', async () => {
      const edgeCaseKey = `${tag}:edge:case:${Math.random()}`;

      // Test empty value
      const result = await client.hset(edgeCaseKey, 'empty_value', '');
      assert.strictEqual(result, 1);

      // Retrieve empty value
      const emptyValue = await client.hget(edgeCaseKey, 'empty_value');
      assert.strictEqual(emptyValue, '');
    });
  });
});
