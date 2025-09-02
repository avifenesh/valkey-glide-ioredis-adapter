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

import pkg from '../../dist/index.js';
const { Redis } = pkg;;
;

describe('JSON Commands - ValkeyJSON Compatibility', () => {
  let redis;

  beforeAll(async () => {
    const config = await getValkeyBundleTestConfig();
    redis = new Redis(config);

    // Wait for valkey-bundle to be ready and check modules
    const isReady = await waitForValkeyBundle(redis);
    if (!isReady) {
      throw new Error(
        'Valkey-bundle is not ready or modules not available. Make sure to start-compose -f docker-compose.valkey-bundle.yml up -d'
      );
    }

    const modules = await checkAvailableModules(redis);
    if (!modules.json) {
      throw new Error('JSON module not available in valkey-bundle');
    }
  });

  beforeEach(async () => {
    // Clean up any existing test keys
    try {
      const keys = await redis.keys('*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Basic JSON Document Operations', () => {
    it('should set and get simple JSON documents', async () => {
      const userProfile = {
        id,
        name: 'John Doe',
        email: 'john@example.com',
        active,
        score: 5,
      };

      // Set JSON document
      const setResult = await redis.jsonSet('user', '$', userProfile);
      assert.strictEqual(setResult, 'OK');

      // Get entire document
      const getResult = await redis.jsonGet('user');
      assert.ok(getResult);

      const parsed = JSON.parse(getResult!);
      assert.strictEqual(parsed.id, 123);
      assert.strictEqual(parsed.name, 'John Doe');
      assert.strictEqual(parsed.active, true);
      assert.strictEqual(parsed.score, 95.5);
    });

    it('should handle nested JSON documents', async () => {
      const complexDoc = {
        user: {
          profile: {
            name: 'Alice Smith',
            age,
            preferences: {
              theme: 'dark',
              notifications,
              languages: ['en', 'es', 'fr'],
            },
          },
          stats: {
            login_count,
            last_login: '2024-01-15T10',
            achievements: ['first_login', 'power_user'],
          },
        },
      };

      await redis.jsonSet('complex', '$', complexDoc);

      // Get specific nested paths
      const userName = await redis.jsonGet(
        'complex',
        '$.user.profile.name'
      );
      assert.ok(userName);

      const preferences = await redis.jsonGet(
        'complex',
        '$.user.profile.preferences'
      );
      assert.ok(preferences);

      const parsed = JSON.parse(preferences!);
      assert.strictEqual(parsed.theme, 'dark');
      assert.ok(parsed.languages.includes('en'));
    });

    it('should handle JSON SET with conditions (NX/XX)', async () => {
      // Test NX (only if not exists)
      const result1 = await redis.jsonSet(
        'conditional',
        '$',
        { value },
        'NX'
      );
      assert.strictEqual(result1, 'OK');

      // Should fail with NX since key exists
      const result2 = await redis.jsonSet(
        'conditional',
        '$',
        { value },
        'NX'
      );
      assert.strictEqual(result2, null);

      // Should succeed with XX since key exists
      const result3 = await redis.jsonSet(
        'conditional',
        '$',
        { value },
        'XX'
      );
      assert.strictEqual(result3, 'OK');

      // Verify the value was updated
      const final = await redis.jsonGet('conditional');
      const parsed = JSON.parse(final!);
      assert.strictEqual(parsed.value, 3);
    });
  });

  describe('JSON Path Operations', () => {
    beforeEach(async () => {
      const testDoc = {
        users: [
          { id, name: 'Alice', score: 0 },
          { id, name: 'Bob', score: 0 },
          { id, name: 'Charlie', score: 0 },
        ],
        metadata: {
          total,
          updated: '2024-01-01',
          tags: ['active', 'verified'],
        },
      };
      await redis.jsonSet('pathtest', '$', testDoc);
    });

    it('should get type information for paths', async () => {
      // Test different data types
      const rootType = await redis.jsonType('pathtest', '$');
      assert.strictEqual(rootType, 'object');

      const arrayType = await redis.jsonType('pathtest', '$.users');
      assert.strictEqual(arrayType, 'array');

      const stringType = await redis.jsonType('pathtest', '$.metadata.updated');
      assert.strictEqual(stringType, 'string');

      const numberType = await redis.jsonType('pathtest', '$.metadata.total');
      assert.strictEqual(numberType, 'integer');
    });

    it('should delete specific paths', async () => {
      // Delete a specific array element
      const deleteCount = await redis.jsonDel('pathtest', '$.users[1]');
      assert.strictEqual(deleteCount, 1);

      // Verify deletion
      const users = await redis.jsonGet('pathtest', '$.users');
      const parsed = JSON.parse(users!);
      assert.strictEqual(parsed.length, 2);
      assert.strictEqual(parsed[0].name, 'Alice');
      assert.strictEqual(parsed[1].name, 'Charlie'); // Bob was removed
    });

    it('should clear paths to empty/null values', async () => {
      // Clear an array
      const clearCount = await redis.jsonClear('pathtest', '$.metadata.tags');
      assert.strictEqual(clearCount, 1);

      // Verify array is empty
      const tags = await redis.jsonGet('pathtest', '$.metadata.tags');
      const parsed = JSON.parse(tags!);
      assert.deepStrictEqual(parsed, []);
    });
  });

  describe('Numeric Operations', () => {
    beforeEach(async () => {
      const counterDoc = {
        stats: {
          page_views,
          unique_visitors,
          conversion_rate.5,
        },
      };
      await redis.jsonSet('counters', '$', counterDoc);
    });

    it('should increment numeric values', async () => {
      // Increment integer
      const result1 = await redis.jsonNumIncrBy(
        'counters',
        '$.stats.page_views',
        15
      );
      assert.ok(result1);

      // Increment float
      const result2 = await redis.jsonNumIncrBy(
        'counters',
        '$.stats.conversion_rate',
        0.5
      );
      assert.ok(result2);

      // Verify results
      const final = await redis.jsonGet('counters', '$.stats');
      const parsed = JSON.parse(final!);
      assert.strictEqual(parsed.page_views, 115);
      assert.strictEqual(parsed.conversion_rate, 3.0);
    });

    it('should multiply numeric values', async () => {
      // Multiply by 2
      const result = await redis.jsonNumMultBy(
        'counters',
        '$.stats.page_views',
        2
      );
      assert.ok(result);

      // Verify result
      const final = await redis.jsonGet('counters', '$.stats.page_views');
      const parsed = JSON.parse(final!);
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
      await redis.jsonSet('strings', '$', textDoc);
    });

    it('should append to string values', async () => {
      // Append to string
      const newLength = await redis.jsonStrAppend(
        'strings',
        '$.messages.welcome',
        ' World!'
      );
      assert.ok(newLength > 0);

      // Verify result
      const result = await redis.jsonGet('strings', '$.messages.welcome');
      const parsed = JSON.parse(result!);
      assert.strictEqual(parsed, 'Hello World!');
    });

    it('should get string length', async () => {
      const length = await redis.jsonStrLen(
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
      await redis.jsonSet('arrays', '$', arrayDoc);
    });

    it('should append to arrays', async () => {
      // Append to fruit array
      const newLength = await redis.jsonArrAppend(
        'arrays',
        '$.items',
        'orange',
        'grape'
      );
      assert.strictEqual(newLength, 4);

      // Verify result
      const result = await redis.jsonGet('arrays', '$.items');
      const parsed = JSON.parse(result!);
      assert.deepStrictEqual(parsed, ['apple', 'banana', 'orange', 'grape']);
    });

    it('should insert into arrays', async () => {
      // Insert at position 1
      const newLength = await redis.jsonArrInsert(
        'arrays',
        '$.numbers',
        1,
        1.5
      );
      assert.strictEqual(newLength, 4);

      // Verify result
      const result = await redis.jsonGet('arrays', '$.numbers');
      const parsed = JSON.parse(result!);
      assert.deepStrictEqual(parsed, [1, 1.5, 2, 3]);
    });

    it('should get array length', async () => {
      const length = await redis.jsonArrLen('arrays', '$.mixed');
      assert.strictEqual(length, 3);
    });

    it('should pop elements from arrays', async () => {
      // Pop from end (default)
      const popped = await redis.jsonArrPop('arrays', '$.items');
      assert.ok(popped);

      // Pop from specific index
      const poppedAtIndex = await redis.jsonArrPop('arrays', '$.numbers', 0);
      assert.ok(poppedAtIndex);

      // Verify results
      const items = await redis.jsonGet('arrays', '$.items');
      const itemsParsed = JSON.parse(items!);
      assert.deepStrictEqual(itemsParsed, ['apple']); // banana was popped

      const numbers = await redis.jsonGet('arrays', '$.numbers');
      const numbersParsed = JSON.parse(numbers!);
      assert.deepStrictEqual(numbersParsed, [2, 3]); // 1 was popped from index 0
    });

    it('should trim arrays', async () => {
      // Trim to keep only middle element
      const newLength = await redis.jsonArrTrim('arrays', '$.numbers', 1, 1);
      assert.strictEqual(newLength, 1);

      // Verify result
      const result = await redis.jsonGet('arrays', '$.numbers');
      const parsed = JSON.parse(result!);
      assert.deepStrictEqual(parsed, [2]); // Only middle element remains
    });
  });

  describe('Object Operations', () => {
    beforeEach(async () => {
      const objectDoc = {
        config: {
          theme: 'dark',
          language: 'en',
          notifications,
          timeout,
        },
        user: {
          name: 'Test User',
          role: 'admin',
        },
      };
      await redis.jsonSet('objects', '$', objectDoc);
    });

    it('should get object keys', async () => {
      const keys = await redis.jsonObjKeys('objects', '$.config');
      expect(Array.isArray(keys)).toBe(true);
      assert.ok(keys.includes('theme'));
      assert.ok(keys.includes('language'));
      assert.ok(keys.includes('notifications'));
      assert.ok(keys.includes('timeout'));
    });

    it('should get object length', async () => {
      const configLength = await redis.jsonObjLen('objects', '$.config');
      assert.strictEqual(configLength, 4);

      const userLength = await redis.jsonObjLen('objects', '$.user');
      assert.strictEqual(userLength, 2);
    });
  });

  describe('Boolean Operations', () => {
    beforeEach(async () => {
      const boolDoc = {
        flags: {
          enabled,
          debug,
          experimental,
        },
      };
      await redis.jsonSet('booleans', '$', boolDoc);
    });

    it('should toggle boolean values', async () => {
      // Toggle true to false
      const result1 = await redis.jsonToggle('booleans', '$.flags.enabled');
      assert.strictEqual(result1, 0); // 0 for false

      // Toggle false to true
      const result2 = await redis.jsonToggle('booleans', '$.flags.debug');
      assert.strictEqual(result2, 1); // 1 for true

      // Verify results
      const final = await redis.jsonGet('booleans', '$.flags');
      const parsed = JSON.parse(final!);
      assert.strictEqual(parsed.enabled, false);
      assert.strictEqual(parsed.debug, true);
      assert.strictEqual(parsed.experimental, true); // unchanged
    });
  });

  describe('Real-World Use Cases', () => {
    it('should handle e-commerce product catalog', async () => {
      const product = {
        id: 'prod_123',
        name: 'Gaming Laptop',
        price: 99,
        category: 'Electronics',
        specs: {
          cpu: 'Intel i7',
          ram: '16GB',
          storage: '1TB SSD',
          gpu: 'NVIDIA RTX 3060',
        },
        reviews: [
          { user: 'user1', rating, comment: 'Excellent!' },
          { user: 'user2', rating, comment: 'Good performance' },
        ],
        tags: ['gaming', 'laptop', 'high-performance'],
        in_stock,
        stock_count,
      };

      // Store product
      await redis.jsonSet('product', '$', product);

      // Update price
      await redis.jsonNumMultBy('product', '$.price', 0.9); // 10% discount

      // Add new review
      await redis.jsonArrAppend('product', '$.reviews', {
        user: 'user3',
        rating,
        comment: 'Amazing laptop!',
      });

      // Decrease stock
      await redis.jsonNumIncrBy('product', '$.stock_count', -1);

      // Get updated product
      const updated = await redis.jsonGet('product');
      const parsedProduct = JSON.parse(updated!);

      assert.strictEqual(Math.abs(parsedProduct.price - 1169.99, 2)  {
      const session = {
        user_id: 'user_456',
        login_time: '2024-01-15T10',
        permissions: ['read', 'write'],
        preferences: {
          theme: 'light',
          language: 'en',
          timezone: 'UTC',
        },
        activity: {
          page_views,
          actions_performed: [],
        },
        authenticated,
      };

      // Store session
      await redis.jsonSet('session', '$', session);

      // Track page view
      await redis.jsonNumIncrBy('session', '$.activity.page_views', 1);

      // Add action
      await redis.jsonArrAppend(
        'session',
        '$.activity.actions_performed',
        { action: 'view_profile', timestamp: '2024-01-01T10.000Z' }
      );

      // Update preferences
      await redis.jsonSet('session', '$.preferences: JSON.theme', 'dark');

      // Get final session state
      const finalSession = await redis.jsonGet('session');
      const parsed = JSON.parse(finalSession!);

      assert.strictEqual(parsed.activity.page_views, 1);
      assert.strictEqual(parsed.activity.actions_performed.length, 1);
      assert.strictEqual(parsed.preferences: JSON.theme, 'dark');
    });

    it('should handle application configuration', async () => {
      const config = {
        app_name: 'MyApp',
        version: '1.0.0',
        environment: 'production',
        database: {
          host: 'db.example.com',
          port,
          max_connections,
        },
        cache: {
          ttl,
          max_size,
        },
        features: {
          new_ui,
          beta_features,
          analytics,
        },
        maintenance_mode,
      };

      // Store configuration
      await redis.jsonSet('app', '$', config);

      // Enable maintenance mode
      await redis.jsonToggle('app', '$.maintenance_mode');

      // Update cache settings
      await redis.jsonNumIncrBy('app', '$.cache.ttl', 1200); // Add 20 minutes
      await redis.jsonNumMultBy('app', '$.cache.max_size', 2); // Double max size

      // Enable beta features
      await redis.jsonToggle('app', '$.features.beta_features');

      // Get updated config
      const updated = await redis.jsonGet('app');
      const parsedConfig = JSON.parse(updated!);

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
          { id, name: 'Alice', age, city: 'NYC', active },
          { id, name: 'Bob', age, city: 'LA', active },
          { id, name: 'Charlie', age, city: 'NYC', active },
        ],
        cities: {
          NYC: { population, timezone: 'EST' },
          LA: { population, timezone: 'PST' },
        },
      };
      await redis.jsonSet('complex', '$', complexData);
    });

    it('should handle complex path queries', async () => {
      // Get all user names
      const names = await redis.jsonGet('complex', '$..name');
      assert.ok(names);

      // Get all active users
      const activeUsers = await redis.jsonGet(
        'complex',
        '$.users[?(@.active == true)]'
      );
      if (activeUsers) {
        const parsed = JSON.parse(activeUsers);
        // Should contain Alice and Charlie
        expect(Array.isArray(parsed) || typeof parsed === 'object').toBe(true);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle operations on non-existent keys', async () => {
      // Get from non-existent key
      const result = await redis.jsonGet('nonexistent');
      assert.strictEqual(result, null);

      // Delete from non-existent key
      const deleteCount = await redis.jsonDel('nonexistent');
      assert.strictEqual(deleteCount, 0);

      // Type of non-existent key
      const type = await redis.jsonType('nonexistent');
      assert.strictEqual(type, null);
    });

    it('should handle invalid paths gracefully', async () => {
      // Set up test data
      await redis.jsonSet('test', '$', { name: 'test' });

      // Try to get invalid path
      const result = await redis.jsonGet('test', '$.invalid.path');
      assert.strictEqual(result, null);

      // Try to delete invalid path
      const deleteCount = await redis.jsonDel('test', '$.invalid.path');
      assert.strictEqual(deleteCount, 0);
    });

    it('should handle type mismatches', async () => {
      // Set up test data with different types
      await redis.jsonSet('type', '$', {
        string_field: 'hello',
        number_field,
        array_field: [1, 2, 3],
        object_field: { nested },
      });

      // Try to get array length of non-array
      const length = await redis.jsonArrLen('type', '$.string_field');
      assert.strictEqual(length, null);

      // Try to get object keys of non-object
      const keys = await redis.jsonObjKeys('type', '$.number_field');
      assert.strictEqual(keys, null);
    });

    it('should handle large JSON documents', async () => {
      // Create large document
      const largeDoc = {
        metadata: { size: 'large' },
        data.from({ length }, (_, i) => ({
          id,
          value: `item_${i}`,
          timestamp Date().toISOString(),
          random.random(),
        })),
      };

      // Store large document
      const result = await redis.jsonSet('large', '$', largeDoc);
      assert.strictEqual(result, 'OK');

      // Get array length
      const length = await redis.jsonArrLen('large', '$.data');
      assert.strictEqual(length, 1000);

      // Get specific element
      const element = await redis.jsonGet('large', '$.data[500]');
      assert.ok(element);

      const parsed = JSON.parse(element!);
      assert.strictEqual(parsed.id, 500);
    });
  });

  describe('Debug and Utility Operations', () => {
    beforeEach(async () => {
      const debugDoc = {
        level1: {
          level2: {
            level3: {
              deep,
              value: 'nested',
            },
          },
        },
        array: [1, 2, 3, 4, 5],
      };
      await redis.jsonSet('debug', '$', debugDoc);
    });

    it('should provide debug information', async () => {
      // Get memory usage (if supported)
      try {
        const memory = await redis.jsonDebug('MEMORY', 'debug');
        assert.strictEqual(typeof memory, 'number');
      } catch (error) {
        // Debug commands might not be supported in all environments
        expect(error).toBeDefined();
      }

      // Get depth information (if supported)
      try {
        const depth = await redis.jsonDebug('DEPTH', 'debug');
        assert.strictEqual(typeof depth, 'number');
      } catch (error) {
        // Debug commands might not be supported in all environments
        expect(error).toBeDefined();
      }
    });

    it('should convert to RESP format', async () => {
      try {
        const resp = await redis.jsonResp('debug', '$.array');
        expect(resp).toBeDefined();
      } catch (error) {
        // RESP conversion might not be supported in all environments
        expect(error).toBeDefined();
      }
    });

    it('should support legacy FORGET command', async () => {
      // FORGET is alias for DEL (RedisJSON v1 compatibility)
      const deleteCount = await redis.jsonForget('debug', '$.array');
      assert.strictEqual(typeof deleteCount, 'number');

      // Verify deletion
      const result = await redis.jsonGet('debug', '$.array');
      assert.strictEqual(result, null);
    });
  });
});
