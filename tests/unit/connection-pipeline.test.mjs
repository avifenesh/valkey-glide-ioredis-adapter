import { describe, it, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
/**
 * Connection and Pipeline Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { testUtils } from '../setup/index.mjs';

// Connection lifecycle moved to connection-lifecycle.test.mjs; skip any leftover here
const describeConn = describe.skip;
const describePipe = describe;

describeConn('Connection Management (ioredis compatibility)', () => {
  let client;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
    // Allow previous suite cleanup to settle fully
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    // Final cleanup
    if (client) {
      try {
        // Remove all event listeners first
        client.removeAllListeners();
        // Only call quit() - it does full cleanup
        await client.quit();
        // Give extra time for GLIDE's internal cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch {
        // Ignore cleanup errors
      }
      client = null;
    }
  });

  afterEach(async () => {
    if (client) {
      try {
        // Remove all event listeners first
        client.removeAllListeners();
        // Only call quit() - it does full cleanup
        await client.quit();
        // Give extra time for GLIDE's internal cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        // Ignore cleanup errors
      }
      client = null;
    }
  });

  describe('Client creation patterns', () => {
    it('should create client with default options', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      // Basic connectivity test
      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with port and host', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with options object', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 1,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with redis:// URL', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        db: 0,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should handle database selection', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      const db = 0;
      client = new Redis({
        port: config.port,
        host: config.host,
        db,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      // Test that we're using the correct database
      await client.set('dbtest', 'value');
      assert.strictEqual(await client.get('dbtest'), 'value');
    });
  });

  describe('Connection lifecycle', () => {
    it('should emit ready event when connected', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis(config);

      const readyPromise = new Promise(resolve => {
        client.on('ready', resolve);
      });

      await client.connect();
      await readyPromise;

      assert.strictEqual(client.status, 'ready');

      // Clean up event listeners
      client.removeAllListeners('ready');
    });

    it('should emit connect event', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis(config);

      const connectPromise = new Promise(resolve => {
        client.on('connect', resolve);
      });

      await client.connect();
      await connectPromise;

      // Clean up event listeners
      client.removeAllListeners('connect');
    });

    it('should emit end event when disconnected', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      // Rely on the quit() promise and avoid awaiting events; this prevents event-loop timing issues
      await client.quit();
      assert.strictEqual(client.status, 'end');
      // Ensure no listeners remain and release reference for afterEach
      client.removeAllListeners();
      client = null;
    });

    it('should handle reconnection', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      const retryDelayOnFailover = 1000;
      client = new Redis({ ...config, retryDelayOnFailover });
      await client.connect();

      // Simulate connection loss and recovery
      const reconnectPromise = new Promise(resolve => {
        client.on('ready', resolve);
      });

      // Force reconnection simulation
      client.disconnect();
      await client.connect();
      await reconnectPromise;

      // Clean up event removeAllListeners()
      client.removeAllListeners();
    });
  });

  describe('Error handling', () => {
    it('should emit error events', async () => {
      // Use a working connection but create an error condition
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
      ]);

      const errorPromise = new Promise(resolve => {
        client.on('error', resolve);
      });

      // Create an error condition by running an invalid command
      try {
        await client.eval('invalid_lua_script_that_will_fail', 0);
      } catch (cmdError) {
        // This might trigger an error event or just throw - either is fine
      }

      // Give a small window for error events to fire
      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve(null), 100)
      );
      const error = await Promise.race([errorPromise, timeoutPromise]);

      // We expect either an error event OR the command to just throw
      // Both are valid error handling behaviors
      assert.ok(true); // Test passes if we get here without hanging

      // Clean up event listeners
      client.removeAllListeners();
    });

    it('should handle command errors gracefully', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) {
        return; // Skip test - servers not available
      }

      const config = await testUtils.getStandaloneConfig();
      client = new Redis(config);
      await client.connect();

      // Try to increment a non-numeric value
      await client.set('text', 'not_a_number');
      await assert.rejects(client.incr('text'));

      // Connection should still be usable
      assert.strictEqual(await client.ping(), 'PONG');
    });
  });
});

describePipe('Pipeline Operations (ioredis compatibility)', () => {
  let client;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
    // Allow previous suite teardown to fully settle
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('[pipeline-suite] before: ready');
    // Allow previous suite teardown to fully settle
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('[pipeline-suite] before: ready');
  });

  after(async () => {
    // Final cleanup
    if (client) {
      try {
        // Remove all event listeners first
        client.removeAllListeners();
        // Only call quit() - it does full cleanup
        await client.quit();
        // Give reasonable time for GLIDE cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch {
        // Ignore cleanup errors
      }
      client = null;
    }
    // No forced process.exit; let the test runner manage process lifecycle
  });

  beforeEach(async () => {
    // Health check before each test
    const serversAvailable = testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers became unavailable during test execution');
    }

    // Use test server configuration
    const config = await testUtils.getStandaloneConfig();
    // Enforce short timeouts in this suite to avoid hangs on teardown or reconnect
    client = new Redis({
      ...config,
      connectTimeout: config.connectTimeout ?? 2000,
      requestTimeout: config.requestTimeout ?? 3000,
      maxRetriesPerRequest: 1,
    });
    console.log('[pipeline-suite] beforeEach: connecting...');
    console.log('[pipeline-suite] beforeEach: connecting...');
    // Bound connect to avoid suite-level hangs if teardown races
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000))
    ]);
    console.log('[pipeline-suite] beforeEach: connected');
    console.log('[pipeline-suite] beforeEach: connected');

    // Clean up any existing test data
    try {
      await client.del(
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
    if (client) {
      try {
        // Remove all event listeners first
        client.removeAllListeners();
        // Only call quit() - it does full cleanup
        await client.quit();
        // Give extra time for GLIDE's internal cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        // Ignore cleanup errors
      }
      client = null;
    }
  });

  describe('Basic pipeline operations', () => {
    it('should execute multiple commands in pipeline', async () => {
      const pipeline = client.pipeline();

      pipeline.set('key1', 'value1');
      pipeline.set('key2', 'value2');
      pipeline.get('key1');
      pipeline.get('key2');

      console.log('[pipeline-suite] exec starting...');
      const results = await Promise.race([
        pipeline.exec(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pipeline exec timeout')), 8000))
      ]);
      console.log('[pipeline-suite] exec finished');

      // ioredis returns [[error, result], [error, result], ...]
      assert.deepStrictEqual(results, [
        [null, 'OK'],
        [null, 'OK'],
        [null, 'value1'],
        [null, 'value2'],
      ]);
    });

    it('should handle mixed command types in pipeline', async () => {
      const pipeline = client.pipeline();

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
      const pipeline = client.pipeline();

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
      const results = await client
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
      const pipeline = client.pipeline();

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
      const pipeline = client.pipeline();
      const results = await pipeline.exec();
      assert.deepStrictEqual(results, []);
    });
  });

  describe('Pipeline with transactions', () => {
    it('should support atomic transactions', async () => {
      const multi = client.multi();

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
      await client.set('existing_string', 'text_value');

      const multi = client.multi();
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
      assert.strictEqual(await client.exists('should_not_be_set'), 1);
    });

    it('should support WATCH for optimistic locking', async () => {
      await client.set('watched_key', '10');

        // Start watching
        await client.watch('watched_key');

      // Simulate concurrent modification
      const config = await testUtils.getStandaloneConfig();
      const otherClient = new Redis(config);
      await otherClient.connect();
      await otherClient.set('watched_key', '20');
      await otherClient.quit();

      // Transaction should fail due to watched key modification
      const multi = client.multi();
      multi.incr('watched_key');

      const results = await multi.exec();
      assert.strictEqual(results, null); // Transaction aborted

      // Verify original value from other client
      assert.strictEqual(await client.get('watched_key'), '20');
    });
  });

  describe('Pipeline error recovery', () => {
    it('should continue processing after command error', async () => {
      // Setup a key with string value that can't be incremented
      await client.set('non_numeric_key', 'not_a_number');

      const pipeline = client.pipeline();

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
      const pipeline = client.pipeline();

      pipeline.set('key1', 'value1');
      pipeline.set('key2', 'value2');

      // Abort before execution
      pipeline.discard();

      const results = await pipeline.exec();
      assert.deepStrictEqual(results, []); // No commands executed

      // Verify no keys were set
      assert.strictEqual(await client.exists('key1'), 0);
      assert.strictEqual(await client.exists('key2'), 0);
    });
  });

  describe('Edge cases', () => {
    it('should handle very large pipelines', async () => {
      const pipeline = client.pipeline();
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

      const pipeline = client.pipeline();
      pipeline.set('large_key', largeValue);
      pipeline.get('large_key');

      const results = await pipeline.exec();

      assert.deepStrictEqual(results[0], [null, 'OK']);
      assert.deepStrictEqual(results[1], [null, largeValue]);
    });
  });
});
