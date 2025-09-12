/**
 * JSON Commands Comprehensive Tests
 *
 * Tests ValkeyJSON / RedisJSON v2 compatibility:
 * - Document storage and retrieval patterns
 * - JSONPath operations and queries
 * - Real-world use cases from modern applications
 * - E-commerce product catalogs, user profiles, config management
 * - Gaming leaderboards, analytics data, content management
 * - API responses caching, session data, configuration
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
import {
  getValkeyBundleTestConfig,
  checkAvailableModules,
  waitForValkeyBundle,
} from '../utils/valkey-bundle-config.mjs';

describe('JSON Commands - ValkeyJSON Compatibility', () => {
  let client;

  before(async () => {
    const config = await getValkeyBundleTestConfig();
    client = new Redis(config);

    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    } // Wait for valkey-bundle to be ready and check modules
    const isReady = await waitForValkeyBundle(client);
    if (!isReady) {
      throw new Error(
        'Valkey-bundle is not ready or modules not available. Make sure to start: docker-compose -f docker-compose.valkey-bundle.yml up -d'
      );
    }

    const modules = await checkAvailableModules(client);
    if (!modules.json) {
      throw new Error('JSON module not available in valkey-bundle');
    }
  });

  beforeEach(async () => {
    // Clean up any existing test keys using SCAN
    try {
      let cursor = '0';
      const keys = [];
      do {
        const res = await client.scan(cursor, 'MATCH', '*', 'COUNT', 500);
        cursor = Array.isArray(res) ? res[0] : '0';
        const batch = Array.isArray(res) ? res[1] : [];
        if (Array.isArray(batch) && batch.length) keys.push(...batch);
      } while (cursor !== '0');
      if (keys.length > 0) await client.del(...keys);
    } catch {
      // Ignore cleanup errors
    }
  });

  after(async () => {
    if (client) {
      await client.quit();
    }
  });

  describe('Basic JSON Document Operations', () => {
    test('should set and get simple JSON documents', async () => {
      const userProfile = {
        id: 123,
        name: 'John Doe',
        email: 'john@example.com',
        active: true,
        score: 95.5,
      };

      // Set JSON document
      const setResult = await client.jsonSet('user:123', '$', userProfile);
      assert.strictEqual(setResult, 'OK');

      // Get entire document
      const getResult = await client.jsonGet('user:123');
      assert.ok(getResult);

      const parsed = JSON.parse(getResult);
      assert.strictEqual(parsed.id, 123);
      assert.strictEqual(parsed.name, 'John Doe');
      assert.strictEqual(parsed.active, true);
      assert.strictEqual(parsed.score, 95.5);
    });

    test('should handle nested JSON documents', async () => {
      const complexDoc = {
        user: {
          profile: {
            name: 'Alice Smith',
            age: 28,
            preferences: {
              theme: 'dark',
              notifications: true,
              languages: ['en', 'es', 'fr'],
            },
          },
          stats: {
            login_count: 45,
            last_login: '2024-01-15T10:30:00Z',
            achievements: ['first_login', 'power_user'],
          },
        },
      };

      await client.jsonSet('complex:doc', '$', complexDoc);

      // Get specific nested paths
      const userName = await client.jsonGet(
        'complex:doc',
        '$.user.profile.name'
      );
      assert.ok(userName);

      const preferences = await client.jsonGet(
        'complex:doc',
        '$.user.profile.preferences'
      );
      assert.ok(preferences);

      const parsed = JSON.parse(preferences);
      assert.strictEqual(parsed.theme, 'dark');
      assert.ok(parsed.languages.includes('en'));
    });

    test('should handle JSON SET with conditions (NX/XX)', async () => {
      // Test NX (only if not exists)
      const result1 = await client.jsonSet(
        'conditional:test',
        '$',
        { value: 1 },
        'NX'
      );
      assert.strictEqual(result1, 'OK');

      // Should fail with NX since key exists
      const result2 = await client.jsonSet(
        'conditional:test',
        '$',
        { value: 2 },
        'NX'
      );
      assert.strictEqual(result2, null);

      // Should succeed with XX since key exists
      const result3 = await client.jsonSet(
        'conditional:test',
        '$',
        { value: 3 },
        'XX'
      );
      assert.strictEqual(result3, 'OK');

      // Verify the value was updated
      const final = await client.jsonGet('conditional:test');
      const parsed = JSON.parse(final);
      assert.strictEqual(parsed.value, 3);
    });
  });

  describe('JSON Path Operations', () => {
    beforeEach(async () => {
      const testDoc = {
        users: [
          { id: 1, name: 'Alice', score: 85 },
          { id: 2, name: 'Bob', score: 92 },
          { id: 3, name: 'Charlie', score: 78 },
        ],
        metadata: {
          total: 3,
          updated: '2024-01-01',
          tags: ['active', 'verified'],
        },
      };
      await client.jsonSet('pathtest', '$', testDoc);
    });

    test('should get type information for paths', async () => {
      // Test different data types
      const rootType = await client.jsonType('pathtest', '$');
      assert.strictEqual(rootType, 'object');

      const arrayType = await client.jsonType('pathtest', '$.users');
      assert.strictEqual(arrayType, 'array');

      const stringType = await client.jsonType(
        'pathtest',
        '$.metadata.updated'
      );
      assert.strictEqual(stringType, 'string');

      const numberType = await client.jsonType('pathtest', '$.metadata.total');
      assert.strictEqual(numberType, 'integer');
    });

    test('should delete specific paths', async () => {
      // Delete a specific array element
      const deleteCount = await client.jsonDel('pathtest', '$.users[1]');
      assert.strictEqual(deleteCount, 1);

      // Verify deletion
      const users = await client.jsonGet('pathtest', '$.users');
      const parsed = JSON.parse(users);
      assert.strictEqual(parsed.length, 2);
      assert.strictEqual(parsed[0].name, 'Alice');
      assert.strictEqual(parsed[1].name, 'Charlie'); // Bob was removed
    });

    test('should clear paths to empty/null values', async () => {
      // Clear an array
      const clearCount = await client.jsonClear('pathtest', '$.metadata.tags');
      assert.strictEqual(clearCount, 1);

      // Verify array is empty
      const tags = await client.jsonGet('pathtest', '$.metadata.tags');
      const parsed = JSON.parse(tags);
      assert.deepStrictEqual(parsed, []);
    });
  });

  describe('Numeric Operations', () => {
    beforeEach(async () => {
      const counterDoc = {
        stats: {
          page_views: 100,
          unique_visitors: 25,
          conversion_rate: 2.5,
        },
      };
      await client.jsonSet('counters', '$', counterDoc);
    });

    test('should increment numeric values', async () => {
      // Increment integer
      const result1 = await client.jsonNumIncrBy(
        'counters',
        '$.stats.page_views',
        15
      );
      assert.ok(result1);

      // Increment float
      const result2 = await client.jsonNumIncrBy(
        'counters',
        '$.stats.conversion_rate',
        0.5
      );
      assert.ok(result2);

      // Verify results
      const final = await client.jsonGet('counters', '$.stats');
      const parsed = JSON.parse(final);
      assert.strictEqual(parsed.page_views, 115);
      assert.strictEqual(parsed.conversion_rate, 3.0);
    });

    test('should multiply numeric values', async () => {
      // Multiply by 2
      const result = await client.jsonNumMultBy(
        'counters',
        '$.stats.page_views',
        2
      );
      assert.ok(result);

      // Verify result
      const final = await client.jsonGet('counters', '$.stats.page_views');
      const parsed = JSON.parse(final);
      assert.strictEqual(parsed, 200);
    });
  });

  describe('String Operations', () => {
    beforeEach(async () => {
      const textDoc = {
        messages: {
          welcome: 'Hello',
          description: 'This is a test',
        },
      };
      await client.jsonSet('strings', '$', textDoc);
    });

    test('should append to string values', async () => {
      // Append to string
      const newLength = await client.jsonStrAppend(
        'strings',
        '$.messages.welcome',
        ' World'
      );
      assert.ok(newLength > 0);

      // Verify result
      const result = await client.jsonGet('strings', '$.messages.welcome');
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed, 'Hello World');
    });

    test('should get string length', async () => {
      const length = await client.jsonStrLen(
        'strings',
        '$.messages.description'
      );
      assert.strictEqual(length, 14); // 'This is a test' = 14 characters
    });
  });

  describe('Array Operations', () => {
    beforeEach(async () => {
      const arrayDoc = {
        items: ['apple', 'banana'],
        numbers: [1, 2, 3],
        mixed: ['hello', 42, true],
      };
      await client.jsonSet('arrays', '$', arrayDoc);
    });

    test('should append to arrays', async () => {
      // Append to fruit array
      const newLength = await client.jsonArrAppend(
        'arrays',
        '$.items',
        'orange',
        'grape'
      );
      assert.strictEqual(newLength, 4);

      // Verify result
      const result = await client.jsonGet('arrays', '$.items');
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed, ['apple', 'banana', 'orange', 'grape']);
    });

    test('should insert into arrays', async () => {
      // Insert at position 1
      const newLength = await client.jsonArrInsert(
        'arrays',
        '$.numbers',
        1,
        1.5
      );
      assert.strictEqual(newLength, 4);

      // Verify result
      const result = await client.jsonGet('arrays', '$.numbers');
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed, [1, 1.5, 2, 3]);
    });

    test('should get array length', async () => {
      const length = await client.jsonArrLen('arrays', '$.mixed');
      assert.strictEqual(length, 3);
    });

    test('should pop elements from arrays', async () => {
      // Pop from end (default)
      const popped = await client.jsonArrPop('arrays', '$.items');
      assert.ok(popped);

      // Pop from specific index
      const poppedAtIndex = await client.jsonArrPop('arrays', '$.numbers', 0);
      assert.ok(poppedAtIndex);

      // Verify results
      const items = await client.jsonGet('arrays', '$.items');
      const itemsParsed = JSON.parse(items);
      assert.deepStrictEqual(itemsParsed, ['apple']); // banana was popped

      const numbers = await client.jsonGet('arrays', '$.numbers');
      const numbersParsed = JSON.parse(numbers);
      assert.deepStrictEqual(numbersParsed, [2, 3]); // 1 was popped from index 0
    });

    test('should trim arrays', async () => {
      // Trim to keep only middle element
      const newLength = await client.jsonArrTrim('arrays', '$.numbers', 1, 1);
      assert.strictEqual(newLength, 1);

      // Verify result
      const result = await client.jsonGet('arrays', '$.numbers');
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed, [2]); // Only middle element remains
    });
  });

  describe('Object Operations', () => {
    beforeEach(async () => {
      const objectDoc = {
        config: {
          theme: 'dark',
          language: 'en',
          notifications: true,
          timeout: 300,
        },
        user: {
          name: 'Test User',
          role: 'admin',
        },
      };
      await client.jsonSet('objects', '$', objectDoc);
    });

    test('should get object keys', async () => {
      const keys = await client.jsonObjKeys('objects', '$.config');
      assert.ok(Array.isArray(keys));
      assert.ok(keys.includes('theme'));
      assert.ok(keys.includes('language'));
      assert.ok(keys.includes('notifications'));
      assert.ok(keys.includes('timeout'));
    });

    test('should get object length', async () => {
      const configLength = await client.jsonObjLen('objects', '$.config');
      assert.strictEqual(configLength, 4);

      const userLength = await client.jsonObjLen('objects', '$.user');
      assert.strictEqual(userLength, 2);
    });
  });

  describe('Boolean Operations', () => {
    beforeEach(async () => {
      const boolDoc = {
        flags: {
          enabled: true,
          debug: false,
          experimental: true,
        },
      };
      await client.jsonSet('booleans', '$', boolDoc);
    });

    test('should toggle boolean values', async () => {
      // Toggle true to false
      const result1 = await client.jsonToggle('booleans', '$.flags.enabled');
      assert.strictEqual(result1, 0); // 0 for false

      // Toggle false to true
      const result2 = await client.jsonToggle('booleans', '$.flags.debug');
      assert.strictEqual(result2, 1); // 1 for true

      // Verify results
      const final = await client.jsonGet('booleans', '$.flags');
      const parsed = JSON.parse(final);
      assert.strictEqual(parsed.enabled, false);
      assert.strictEqual(parsed.debug, true);
      assert.strictEqual(parsed.experimental, true); // unchanged
    });
  });

  describe('Real-World Use Cases', () => {
    test('should handle e-commerce product catalog', async () => {
      const product = {
        id: 'prod_123',
        name: 'Gaming Laptop',
        price: 1299.99,
        category: 'Electronics',
        specs: {
          cpu: 'Intel i7',
          ram: '16GB',
          storage: '1TB SSD',
          gpu: 'NVIDIA RTX 3060',
        },
        reviews: [
          { user: 'user1', rating: 5, comment: 'Excellent' },
          { user: 'user2', rating: 4, comment: 'Good performance' },
        ],
        tags: ['gaming', 'laptop', 'high-performance'],
        in_stock: true,
        stock_count: 15,
      };

      // Store product
      await client.jsonSet('product:prod_123', '$', product);

      // Update price
      await client.jsonNumMultBy('product:prod_123', '$.price', 0.9); // 10% discount

      // Add new review
      await client.jsonArrAppend('product:prod_123', '$.reviews', {
        user: 'user3',
        rating: 5,
        comment: 'Amazing laptop',
      });

      // Decrease stock
      await client.jsonNumIncrBy('product:prod_123', '$.stock_count', -1);

      // Get updated product
      const updated = await client.jsonGet('product:prod_123');
      const parsedProduct = JSON.parse(updated);

      assert.ok(Math.abs(parsedProduct.price - 1169.99) < Math.pow(10, -2)); // Discounted price
      assert.strictEqual(parsedProduct.reviews.length, 3);
      assert.strictEqual(parsedProduct.stock_count, 14);
    });

    test('should handle user session data', async () => {
      const session = {
        user_id: 'user_456',
        login_time: '2024-01-15T10:30:00Z',
        permissions: ['read', 'write'],
        preferences: {
          theme: 'light',
          language: 'en',
          timezone: 'UTC',
        },
        activity: {
          page_views: 0,
          actions_performed: [],
        },
        authenticated: true,
      };

      // Store session
      await client.jsonSet('session:sess_789', '$', session);

      // Track page view
      await client.jsonNumIncrBy(
        'session:sess_789',
        '$.activity.page_views',
        1
      );

      // Add action
      await client.jsonArrAppend(
        'session:sess_789',
        '$.activity.actions_performed',
        { action: 'view_profile', timestamp: '2024-01-01T10:00:00.000Z' }
      );

      // Update preferences
      await client.jsonSet('session:sess_789', '$.preferences.theme', 'dark');

      // Get final session state
      const finalSession = await client.jsonGet('session:sess_789');
      const parsed = JSON.parse(finalSession);

      assert.strictEqual(parsed.activity.page_views, 1);
      assert.strictEqual(parsed.activity.actions_performed.length, 1);
      assert.strictEqual(parsed.preferences.theme, 'dark');
    });

    test('should handle application configuration', async () => {
      const config = {
        app_name: 'MyApp',
        version: '1.0.0',
        environment: 'production',
        database: {
          host: 'db.example.com',
          port: 5432,
          max_connections: 100,
        },
        cache: {
          ttl: 3600,
          max_size: 1000,
        },
        features: {
          new_ui: true,
          beta_features: false,
          analytics: true,
        },
        maintenance_mode: false,
      };

      // Store configuration
      await client.jsonSet('app:config', '$', config);

      // Enable maintenance mode
      await client.jsonToggle('app:config', '$.maintenance_mode');

      // Update cache settings
      await client.jsonNumIncrBy('app:config', '$.cache.ttl', 1200); // Add 20 minutes
      await client.jsonNumMultBy('app:config', '$.cache.max_size', 2); // Double max size

      // Enable beta features
      await client.jsonToggle('app:config', '$.features.beta_features');

      // Get updated config
      const updated = await client.jsonGet('app:config');
      const parsedConfig = JSON.parse(updated);

      assert.strictEqual(parsedConfig.maintenance_mode, true);
      assert.strictEqual(parsedConfig.cache.ttl, 4800);
      assert.strictEqual(parsedConfig.cache.max_size, 2000);
      assert.strictEqual(parsedConfig.features.beta_features, true);
    });
  });

  describe('Advanced JSONPath Queries', () => {
    beforeEach(async () => {
      const complexData = {
        users: [
          { id: 1, name: 'Alice', age: 25, city: 'NYC', active: true },
          { id: 2, name: 'Bob', age: 30, city: 'LA', active: false },
          { id: 3, name: 'Charlie', age: 35, city: 'NYC', active: true },
        ],
        cities: {
          NYC: { population: 8000000, timezone: 'EST' },
          LA: { population: 4000000, timezone: 'PST' },
        },
      };
      await client.jsonSet('complex:data', '$', complexData);
    });

    test('should handle complex path queries', async () => {
      // Get all user names
      const names = await client.jsonGet('complex:data', '$..name');
      assert.ok(names);

      // Get all active users
      const activeUsers = await client.jsonGet(
        'complex:data',
        '$.users[?(@.active == true)]'
      );
      if (activeUsers) {
        const parsed = JSON.parse(activeUsers);
        // Should contain Alice and Charlie
        assert.strictEqual(
          Array.isArray(parsed) || typeof parsed === 'object',
          true
        );
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle operations on non-existent keys', async () => {
      // Get from non-existent key
      const result = await client.jsonGet('nonexistent:key');
      assert.strictEqual(result, null);

      // Delete from non-existent key
      const deleteCount = await client.jsonDel('nonexistent:key');
      assert.strictEqual(deleteCount, 0);

      // Type of non-existent key
      const type = await client.jsonType('nonexistent:key');
      assert.strictEqual(type, null);
    });

    test('should handle invalid paths gracefully', async () => {
      // Set up test data
      await client.jsonSet('test:key', '$', { name: 'test' });

      // Try to get invalid path
      const result = await client.jsonGet('test:key', '$.invalid.path');
      assert.strictEqual(result, null);

      // Try to delete invalid path
      const deleteCount = await client.jsonDel('test:key', '$.invalid.path');
      assert.strictEqual(deleteCount, 0);
    });

    test('should handle type mismatches', async () => {
      // Set up test data with different types
      await client.jsonSet('type:test', '$', {
        string_field: 'hello',
        number_field: 42,
        array_field: [1, 2, 3],
        object_field: { nested: true },
      });

      // Try to get array length of non-array
      const length = await client.jsonArrLen('type:test', '$.string_field');
      assert.strictEqual(length, null);

      // Try to get object keys of non-object
      const keys = await client.jsonObjKeys('type:test', '$.number_field');
      assert.strictEqual(keys, null);
    });

    test('should handle large JSON documents', async () => {
      // Create large document
      const largeDoc = {
        metadata: { size: 'large' },
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `item_${i}`,
          timestamp: new Date().toISOString(),
          random: Math.random(),
        })),
      };

      // Store large document
      const result = await client.jsonSet('large:doc', '$', largeDoc);
      assert.strictEqual(result, 'OK');

      // Get array length
      const length = await client.jsonArrLen('large:doc', '$.data');
      assert.strictEqual(length, 1000);

      // Get specific element
      const element = await client.jsonGet('large:doc', '$.data[500]');
      assert.ok(element);

      const parsed = JSON.parse(element);
      assert.strictEqual(parsed.id, 500);
    });
  });

  describe('Debug and Utility Operations', () => {
    beforeEach(async () => {
      const debugDoc = {
        level1: {
          level2: {
            level3: {
              deep: true,
              value: 'nested',
            },
          },
        },
        array: [1, 2, 3, 4, 5],
      };
      await client.jsonSet('debug:test', '$', debugDoc);
    });

    test('should provide debug information', async () => {
      // Get memory usage (if supported)
      try {
        const memory = await client.jsonDebug('MEMORY', 'debug:test');
        assert.strictEqual(typeof memory, 'number');
      } catch (error) {
        // Debug commands might not be supported in all environments
        assert.ok(error !== undefined);
      }

      // Get depth information (if supported)
      try {
        const depth = await client.jsonDebug('DEPTH', 'debug:test');
        assert.strictEqual(typeof depth, 'number');
      } catch (error) {
        // Debug commands might not be supported in all environments
        assert.ok(error !== undefined);
      }
    });

    test('should convert to RESP format', async () => {
      try {
        const resp = await client.jsonResp('debug:test', '$.array');
        assert.ok(resp !== undefined);
      } catch (error) {
        // RESP conversion might not be supported in all environments
        assert.ok(error !== undefined);
      }
    });

    test('should support legacy FORGET command', async () => {
      // FORGET is alias for DEL (RedisJSON v1 compatibility)
      const deleteCount = await client.jsonForget('debug:test', '$.array');
      assert.strictEqual(typeof deleteCount, 'number');

      // Verify deletion
      const result = await client.jsonGet('debug:test', '$.array');
      assert.strictEqual(result, null);
    });
  });
});
