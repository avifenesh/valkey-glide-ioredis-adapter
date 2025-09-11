/**
 * Connection and Pipeline Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
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
  getStandaloneConfig,
  checkTestServers,
  delay,
} from '../utils/test-config.mjs';

describe('Connection Management (ioredis compatibility)', () => {
  let redis;

  before(() => {
    // Check if test servers are available
    const serversAvailable = checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Client creation patterns', () => {
    test('should create client with default options', async () => {
      // Server check removed - test infrastructure should be running

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

      // Basic connectivity test
      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    test('should create client with port and host', async () => {
      // Server check removed - test infrastructure should be running

      const config = getStandaloneConfig();
      redis = new Redis(config.port, config.host);
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    test('should create client with options object', async () => {
      // Server check removed - test infrastructure should be running

      const config = getStandaloneConfig();
      redis = new Redis({
        port: config.port,
        host: config.host,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
      });
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    test('should create client with redis:// URL', async () => {
      // Server check removed - test infrastructure should be running

      const config = getStandaloneConfig();
      redis = new Redis(`redis://${config.host}:${config.port}/0`);
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    test('should handle database selection', async () => {
      // Server check removed - test infrastructure should be running

      const config = getStandaloneConfig();
      redis = new Redis({ port: config.port, host: config.host, db: 1 });
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

      // Test that we're using the correct database
      await redis.set('dbtest', 'value');
      assert.strictEqual(await redis.get('dbtest'), 'value');
    });
  });

  describe('Connection lifecycle', () => {
    test('should emit ready event when connected', async () => {
      // Server check removed - test infrastructure should be running

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
      const readyPromise = new Promise(resolve => {
        redis.on('ready', resolve);
      });

      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
      await readyPromise;

      assert.strictEqual(redis.status, 'ready');
    });

    test('should emit connect event', async () => {
      // Server check removed - test infrastructure should be running

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
      const connectPromise = new Promise(resolve => {
        redis.on('connect', resolve);
      });

      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
      await connectPromise;
    });

    test('should emit end event when disconnected', async () => {
      // Server check removed - test infrastructure should be running

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

      const endPromise = new Promise(resolve => {
        redis.on('end', resolve);
      });

      await redis.quit();
      await endPromise;

      assert.strictEqual(redis.status, 'end');
    });

    test('should handle reconnection', async () => {
      // Server check removed - test infrastructure should be running

      const config = getStandaloneConfig();
      redis = new Redis({ ...config, retryDelayOnFailover: 10 });
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

      // Simulate connection loss and recovery
      const reconnectPromise = new Promise(resolve => {
        redis.on('ready', resolve);
      });

      // Force reconnection simulation
      redis.disconnect();
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
      await reconnectPromise;
    });
  });

  describe('Error handling', () => {
    test('should emit error events', async () => {
      redis = new Redis({ port: 9999 });
      await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    } // Non-existent port

      const errorPromise = new Promise(resolve => {
        redis.on('error', resolve);
      });

      try {
        await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
      } catch (error) {
        // Expected to fail
      }

      const error = await errorPromise;
      assert.ok(error instanceof Error);
    });

    test('should handle command errors gracefully', async () => {
      // Server check removed - test infrastructure should be running

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

      // Try to increment a non-numeric value
      await redis.set('text', 'not_a_number');
      await assert.rejects(redis.incr('text'));

      // Connection should still be usable
      assert.strictEqual(await redis.ping(), 'PONG');
    });
  });
});

describe('Pipeline Operations (ioredis compatibility)', () => {
  let redis;

  before(() => {
    // Check if test servers are available
    const serversAvailable = checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
  });

  beforeEach(async () => {
    // Health check before each test
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers became unavailable during test execution');
    }

    // Use test server configuration
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

    // Clean up any existing test data
    try {
      await redis.del(
        'key1',
        'key2',
        'key3',
        'string_key',
        'hash_key',
        'list_key',
        'number',
        'text',
        'watched_key',
        'non_numeric_key',
        'good1',
        'good2'
      );
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Basic pipeline operations', () => {
    test('should execute multiple commands in pipeline', async () => {
      const pipeline = redis.pipeline();

      pipeline.set('key1', 'value1');
      pipeline.set('key2', 'value2');
      pipeline.get('key1');
      pipeline.get('key2');

      const results = await pipeline.exec();

      // ioredis returns [[error, result], [error, result], ...]
      assert.deepStrictEqual(results, [
        [null, 'OK'],
        [null, 'OK'],
        [null, 'value1'],
        [null, 'value2'],
      ]);
    });

    test('should handle mixed command types in pipeline', async () => {
      const pipeline = redis.pipeline();

      pipeline.set('string_key', 'string_value');
      pipeline.hset('hash_key', 'field', 'hash_value');
      pipeline.lpush('list_key', 'list_value');
      pipeline.get('string_key');
      pipeline.hget('hash_key', 'field');
      pipeline.lpop('list_key');

      const results = await pipeline.exec();

      assert.deepStrictEqual(results, [
        [null, 'OK'], // set
        [null, 1], // hset
        [null, 1], // lpush
        [null, 'string_value'], // get
        [null, 'hash_value'], // hget
        [null, 'list_value'], // lpop
      ]);
    });

    test('should handle errors in pipeline', async () => {
      const pipeline = redis.pipeline();

      pipeline.set('number', '10');
      pipeline.incr('number'); // Should succeed
      pipeline.set('text', 'abc');
      pipeline.incr('text'); // Should fail
      pipeline.get('number'); // Should succeed

      const results = await pipeline.exec();

      assert.deepStrictEqual(results[0], [null, 'OK']);
      assert.deepStrictEqual(results[1], [null, 11]);
      assert.deepStrictEqual(results[2], [null, 'OK']);
      assert.ok(results[3] !== undefined);
      if (results[3]) assert.ok(results[3][0] instanceof Error); // Error for incr on text
      assert.deepStrictEqual(results[4], [null, '11']);
    });

    test('pipeline should be chainable', async () => {
      const results = await redis
        .pipeline()
        .set('key1', 'value1')
        .set('key2', 'value2')
        .mget('key1', 'key2')
        .exec();

      assert.deepStrictEqual(results, [
        [null, 'OK'],
        [null, 'OK'],
        [null, ['value1', 'value2']],
      ]);
    });
  });

  describe('Pipeline performance characteristics', () => {
    test('should batch commands efficiently', async () => {
      const pipeline = redis.pipeline();

      // Add many commands
      for (let i = 0; i < 100; i++) {
        pipeline.set(`key${i}`, `value${i}`);
      }

      const startTime = Date.now();
      const results = await pipeline.exec();
      const endTime = Date.now();

      assert.strictEqual(results.length, 100);
      assert.ok(
        results.every(([error, result]) => error === null && result === 'OK')
      );

      // Pipeline should be faster than individual commands
      // This is a rough performance check
      assert.ok(endTime - startTime < 1000);
    });

    test('should handle empty pipeline', async () => {
      const pipeline = redis.pipeline();
      const results = await pipeline.exec();
      assert.deepStrictEqual(results, []);
    });
  });

  describe('Pipeline with transactions', () => {
    test('should support atomic transactions', async () => {
      const multi = redis.multi();

      multi.set('counter', '0');
      multi.incr('counter');
      multi.incr('counter');
      multi.get('counter');

      const results = await multi.exec();

      assert.deepStrictEqual(results, [
        [null, 'OK'],
        [null, 1],
        [null, 2],
        [null, '2'],
      ]);
    });

    test('should handle transaction rollback on error', async () => {
      await redis.set('existing_string', 'text_value');

      const multi = redis.multi();
      multi.incr('existing_string'); // This will cause command to fail
      multi.set('should_not_be_set', 'value');

      const results = await multi.exec();

      // Redis transactions don't rollback on runtime errors
      // Commands execute, errors are returned in results
      assert.ok(results !== null);
      assert.strictEqual(results.length, 2);
      assert.ok(results?.[0]?.[0] instanceof Error); // incr error
      assert.strictEqual(results?.[1]?.[0], null); // set success
      assert.strictEqual(results?.[1]?.[1], 'OK');

      // Second command should have executed successfully
      assert.strictEqual(await redis.exists('should_not_be_set'), 1);
    });

    test('should support WATCH for optimistic locking', async () => {
      await redis.set('watched_key', '10');

      // Start watching
      await redis.watch('watched_key');

      // Simulate concurrent modification
      const config = getStandaloneConfig();
      const otherClient = new Redis(config);
      await otherClient.connect();
      await otherClient.set('watched_key', '20');
      await otherClient.disconnect();

      // Transaction should fail due to watched key modification
      const multi = redis.multi();
      multi.incr('watched_key');

      const results = await multi.exec();
      assert.strictEqual(results, null); // Transaction aborted

      // Verify original value from other client
      assert.strictEqual(await redis.get('watched_key'), '20');
    });
  });

  describe('Pipeline error recovery', () => {
    test('should continue processing after command error', async () => {
      // Setup a key with string value that can't be incremented
      await redis.set('non_numeric_key', 'not_a_number');

      const pipeline = redis.pipeline();

      pipeline.set('good1', 'value1');
      pipeline.incr('non_numeric_key'); // Will error
      pipeline.set('good2', 'value2');
      pipeline.get('good1');
      pipeline.get('good2');

      const results = await pipeline.exec();

      assert.deepStrictEqual(results[0], [null, 'OK']);
      assert.ok(results[1] !== undefined);
      if (results[1]) assert.ok(results[1][0] instanceof Error);
      assert.deepStrictEqual(results[2], [null, 'OK']);
      assert.deepStrictEqual(results[3], [null, 'value1']);
      assert.deepStrictEqual(results[4], [null, 'value2']);
    });

    test('should handle pipeline abort', async () => {
      const pipeline = redis.pipeline();

      pipeline.set('key1', 'value1');
      pipeline.set('key2', 'value2');

      // Abort before execution
      pipeline.discard();

      const results = await pipeline.exec();
      assert.deepStrictEqual(results, []); // No commands executed

      // Verify no keys were set
      assert.strictEqual(await redis.exists('key1'), 0);
      assert.strictEqual(await redis.exists('key2'), 0);
    });
  });

  describe('Edge cases', () => {
    test('should handle very large pipelines', async () => {
      const pipeline = redis.pipeline();
      const commandCount = 1000;

      for (let i = 0; i < commandCount; i++) {
        pipeline.set(`large_key_${i}`, `large_value_${i}`);
      }

      const results = await pipeline.exec();
      assert.strictEqual(results.length, commandCount);
      assert.ok(
        results.every(([error, result]) => error === null && result === 'OK')
      );
    });

    test('should handle commands with large payloads', async () => {
      const largeValue = 'x'.repeat(100000); // 100KB value

      const pipeline = redis.pipeline();
      pipeline.set('large_key', largeValue);
      pipeline.get('large_key');

      const results = await pipeline.exec();

      assert.deepStrictEqual(results[0], [null, 'OK']);
      assert.deepStrictEqual(results[1], [null, largeValue]);
    });
  });
});
