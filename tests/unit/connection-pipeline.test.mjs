import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
/**
 * Connection and Pipeline Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { testUtils } from '../setup/index.mjs';

describe('Connection Management (ioredis compatibility)', () => {
  let redis;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
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
    it('should create client with default options', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(config);
      await redis.connect();

      // Basic connectivity test
      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with port and host', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(config.port, config.host);
      await redis.connect();

      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with options object', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis({
        port: config.port,
        host: config.host,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
      });
      await redis.connect();

      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with redis:// URL', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(`redis://${config.host}:${config.port}/0`);
      await redis.connect();

      const result = await redis.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should handle database selection', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      const db = 0;
      redis = new Redis({ port: config.port, host: config.host, db });
      await redis.connect();

      // Test that we're using the correct database
      await redis.set('dbtest', 'value');
      assert.strictEqual(await redis.get('dbtest'), 'value');
    });
  });

  describe('Connection lifecycle', () => {
    it('should emit ready event when connected', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(config);

      const readyPromise = new Promise(resolve => {
        redis.on('ready', resolve);
      });

      await redis.connect();
      await readyPromise;

      assert.strictEqual(redis.status, 'ready');
    });

    it('should emit connect event', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(config);

      const connectPromise = new Promise(resolve => {
        redis.on('connect', resolve);
      });

      await redis.connect();
      await connectPromise;
    });

    it('should emit end event when disconnected', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(config);
      await redis.connect();

      const endPromise = new Promise(resolve => {
        redis.on('end', resolve);
      });

      await redis.quit();
      await endPromise;

      assert.strictEqual(redis.status, 'end');
    });

    it('should handle reconnection', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      const retryDelayOnFailover = 1000;
      redis = new Redis({ ...config, retryDelayOnFailover });
      await redis.connect();

      // Simulate connection loss and recovery
      const reconnectPromise = new Promise(resolve => {
        redis.on('ready', resolve);
      });

      // Force reconnection simulation
      redis.disconnect();
      await redis.connect();
      await reconnectPromise;
    });
  });

  describe('Error handling', () => {
    it('should emit error events', async () => {
      const port = 19999;
      redis = new Redis({ port }); // Non-existent port

      const errorPromise = new Promise(resolve => {
        redis.on('error', resolve);
      });

      try {
        await redis.connect();
      } catch {
        // Expected to fail
      }

      const error = await errorPromise;
      assert.ok(error instanceof Error);
    });

    it('should handle command errors gracefully', async () => {
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      redis = new Redis(config);
      await redis.connect();

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

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
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
    redis = new Redis(config);
    await redis.connect();

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
    it('should execute multiple commands in pipeline', async () => {
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

    it('should handle mixed command types in pipeline', async () => {
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

    it('should handle errors in pipeline', async () => {
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

    it('pipeline should be chainable', async () => {
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
    it('should batch commands efficiently', async () => {
      const pipeline = redis.pipeline();

      // Add many commands
      for (let i = 0; i < 100; i++) {
        pipeline.set(`batch_${i}`, `value_${i}`);
      }

      const startTime = Date.now();
      const results = await pipeline.exec();
      const endTime = Date.now();

      assert.strictEqual(results.length, 100);
      results.forEach(([error, result]) => {
        assert.strictEqual(error, null);
        assert.strictEqual(result, 'OK');
      });

      // Pipeline should be faster than individual commands
      // This is a rough performance check
      assert.ok(endTime - startTime < 5000); // Should complete within 5 seconds
    });

    it('should handle empty pipelines', async () => {
      const pipeline = redis.pipeline();
      const results = await pipeline.exec();
      assert.deepStrictEqual(results, []);
    });
  });

  describe('Pipeline with transactions', () => {
    it('should support atomic transactions', async () => {
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

    it('should handle transaction rollback on error', async () => {
      await redis.set('existing_string', 'text_value');

      const multi = redis.multi();
      multi.incr('existing_string'); // This will cause command to fail
      multi.set('should_not_be_set', 'value');

      const results = await multi.exec();

      // Redis transactions don't rollback on runtime errors
      // Commands execute, errors are returned in results
      assert.ok(results !== null);
      assert.strictEqual(results.length, 2);
      assert.ok(results[0][0] instanceof Error); // incr error
      assert.strictEqual(results[1][0], null); // set success
      assert.strictEqual(results[1][1], 'OK');

      // Second command should have executed successfully
      assert.strictEqual(await redis.exists('should_not_be_set'), 1);
    });

    it('should support WATCH for optimistic locking', async () => {
      await redis.set('watched_key', '10');

      // Start watching
      await redis.watch('watched_key');

      // Simulate concurrent modification
      const config = await testUtils.getStandaloneConfig();
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
    it('should continue processing after command error', async () => {
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

    it('should handle pipeline abort', async () => {
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
    it('should handle very large pipelines', async () => {
      const pipeline = redis.pipeline();
      const commandCount = 1000;

      for (let i = 0; i < commandCount; i++) {
        pipeline.set(`key_${i}`, `value_${i}`);
      }

      const results = await pipeline.exec();
      assert.strictEqual(results.length, commandCount);
      results.forEach(([error, result]) => {
        assert.strictEqual(error, null);
        assert.strictEqual(result, 'OK');
      });
    });

    it('should handle commands with large payloads', async () => {
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
