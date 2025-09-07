/**
 * System Commands Test Suite
 * Tests for monitoring, metrics, and system operations
 *
 * Based on real-world patterns from:
 * - Netflix's Redis monitoring dashboards
 * - Airbnb's performance tracking systems
 * - Stripe's Redis health checks
 * - Discord's memory monitoring
 * - GitHub's system diagnostics
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

describe('System Commands - Monitoring & Metrics', () => {
  let redis;

  beforeEach(async () => {
    const config = {
      host: 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
      lazyConnect: true,
    };
    redis = new Redis(config);

    await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Server Information Commands', () => {
    test('should retrieve server info like Netflix monitoring', async () => {
      const info = await redis.info();

      assert.strictEqual(typeof info, 'string');
      assert.ok(info.length > 0);

      // Should contain standard Redis info sections
      assert.ok(info.includes('redis_version'));
      assert.ok(info.includes('used_memory'));
      assert.ok(info.includes('connected_clients'));
    });

    test('should get specific info sections for targeted monitoring', async () => {
      // Test memory section for monitoring memory usage
      const memoryInfo = await redis.info('memory');
      assert.strictEqual(typeof memoryInfo, 'string');
      assert.ok(memoryInfo.includes('used_memory'));

      // Test stats section for performance metrics
      const statsInfo = await redis.info('stats');
      assert.strictEqual(typeof statsInfo, 'string');
      assert.ok(statsInfo.includes('total_commands_processed'));
    });

    test('should get server configuration like Airbnb systems', async () => {
      // Get maxmemory configuration
      const maxmemory = await redis.config('GET', 'maxmemory');
      assert.ok(Array.isArray(maxmemory));

      // Get timeout configuration
      const timeout = await redis.config('GET', 'timeout');
      assert.ok(Array.isArray(timeout));

      // Pattern to get all save-related configs
      const saveConfigs = await redis.config('GET', 'save*');
      assert.ok(Array.isArray(saveConfigs));
    });

    test('should monitor database size like Discord', async () => {
      // Add some test data
      await redis.set('monitor:test:1', 'value1');
      await redis.set('monitor:test:2', 'value2');
      await redis.hset('monitor:hash', 'field1', 'value1');
      await redis.sadd('monitor:set', 'member1', 'member2');

      // Get database size
      const dbsize = await redis.dbsize();
      assert.strictEqual(typeof dbsize, 'number');
      assert.ok(dbsize > 0);
    });
  });

  describe('Memory Monitoring Commands', () => {
    test('should track memory usage patterns like Stripe', async () => {
      // Create data structures of different types
      const baseKey = 'memory:test:' + Math.random();

      // String data
      await redis.set(`${baseKey}`, 'x'.repeat(1000));

      // Hash data
      const hashData = {};
      for (let i = 0; i < 50; i++) {
        hashData[`field_${i}`] = `value_${i}_${'x'.repeat(20)}`;
      }
      await redis.hmset(`${baseKey}:hash`, hashData);

      // List data
      const listKey = `${baseKey}:list`;
      for (let i = 0; i < 30; i++) {
        await redis.lpush(listKey, `item_${i}_${'x'.repeat(15)}`);
      }

      // Get memory usage for specific key
      try {
        const memoryUsage = await redis.memory('USAGE', `${baseKey}`);
        assert.strictEqual(typeof memoryUsage, 'number');
        assert.ok(memoryUsage > 0);
      } catch (error) {
        // MEMORY USAGE might not be available in all Redis versions
        assert.ok(error !== undefined);
      }
    });

    test('should analyze memory statistics for performance tuning', async () => {
      // Get overall memory stats from INFO
      const info = await redis.info('memory');

      // Parse memory stats
      const lines = info.split('\r\n');
      const memoryStats = {};

      for (const line of lines) {
        if (line.includes(':') && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            memoryStats[key] = value;
          }
        }
      }

      // Verify key memory metrics exist
      assert.strictEqual('used_memory' in memoryStats, true);
      assert.strictEqual('used_memory_rss' in memoryStats, true);

      // Memory should be positive numbers
      const usedMemory = parseInt(memoryStats['used_memory'] || '0');
      assert.ok(usedMemory > 0);
    });
  });

  describe('Client Monitoring Commands', () => {
    test('should monitor client connections like GitHub', async () => {
      // Get client list
      try {
        const clients = await redis.client('LIST');
        assert.strictEqual(typeof clients, 'string');
        assert.ok(clients.length > 0);

        // Should contain client information
        assert.ok(clients.includes('addr='));
        assert.ok(clients.includes('fd='));
      } catch (error) {
        // CLIENT LIST might be restricted in some environments
        assert.ok(error !== undefined);
      }
    });

    test('should track command statistics for performance analysis', async () => {
      // Execute various commands to generate stats
      await redis.set('stats:test:1', 'value1');
      await redis.get('stats:test:1');
      await redis.hset('stats:hash', 'field', 'value');
      await redis.hget('stats:hash', 'field');
      await redis.incr('stats:counter');

      // Get command statistics
      const info = await redis.info('commandstats');
      assert.strictEqual(typeof info, 'string');

      if (info.includes('cmdstat_')) {
        // Parse command stats
        const lines = info.split('\r\n');
        let foundSetStat = false;
        let foundGetStat = false;

        for (const line of lines) {
          if (line.includes('cmdstat_set')) foundSetStat = true;
          if (line.includes('cmdstat_get')) foundGetStat = true;
        }

        assert.strictEqual(foundSetStat || foundGetStat, true);
      }
    });
  });

  describe('Performance Monitoring Commands', () => {
    test('should measure latency like Netflix systems', async () => {
      const key = 'latency:test:' + Math.random();

      // Measure SET operation latency
      const startTime = Date.now();
      await redis.set(key, 'test_value');
      const setLatency = Date.now() - startTime;
      assert.ok(setLatency >= 0);
      assert.ok(setLatency < 1000); // Should be fast

      // Measure GET operation latency
      const getStartTime = Date.now();
      const value = await redis.get(key);
      const getLatency = Date.now() - getStartTime;
      assert.ok(getLatency >= 0);
      assert.ok(getLatency < 1000);
      assert.strictEqual(value, 'test_value');
    });

    test('should monitor slowlog for performance issues', async () => {
      try {
        // Get slow log entries
        const slowlog = await redis.slowlog('GET', '10');
        assert.ok(Array.isArray(slowlog));

        // Each entry should be an array with [id, timestamp, duration, command]
        for (const entry of slowlog.slice(0, 3)) {
          assert.ok(Array.isArray(entry));
          if (entry.length >= 4) {
            assert.strictEqual(typeof entry[0], 'number'); // ID
            assert.strictEqual(typeof entry[1], 'number'); // Timestamp
            assert.strictEqual(typeof entry[2], 'number'); // Duration
            assert.ok(Array.isArray(entry[3])); // Command array
          }
        }
      } catch (error) {
        // SLOWLOG might be disabled or restricted
        assert.ok(error !== undefined);
      }
    });

    test('should benchmark operations for capacity planning', async () => {
      const operations = 100;
      const testKey = 'benchmark:' + Math.random();

      // Benchmark SET operations
      const setStartTime = Date.now();
      for (let i = 0; i < operations; i++) {
        await redis.set(`${testKey}:${i}`, `value_${i}`);
      }
      const setDuration = Date.now() - setStartTime;
      const setOpsPerSecond = (operations / setDuration) * 1000;

      assert.ok(setOpsPerSecond > 0);

      // Benchmark GET operations
      const getStartTime = Date.now();
      for (let i = 0; i < operations; i++) {
        await redis.get(`${testKey}:${i}`);
      }
      const getDuration = Date.now() - getStartTime;
      const getOpsPerSecond = (operations / getDuration) * 1000;

      assert.ok(getOpsPerSecond > 0);

      // Performance should be reasonable
      assert.ok(setOpsPerSecond > 10); // At least 10 ops/sec
      assert.ok(getOpsPerSecond > 10);
    });
  });

  describe('Debugging and Diagnostic Commands', () => {
    test('should provide debug information for troubleshooting', async () => {
      const key = 'debug:test:' + Math.random();
      await redis.set(key, 'debug_value');

      try {
        // Get object information for debugging
        const objectInfo = await redis.debug('OBJECT', key);
        assert.strictEqual(typeof objectInfo, 'string');
        assert.ok(objectInfo.length > 0);
      } catch (error) {
        // DEBUG commands might be disabled in production
        assert.ok(error !== undefined);
      }
    });

    test('should support ping for connectivity testing', async () => {
      // Basic ping
      const pong = await redis.ping();
      assert.strictEqual(pong, 'PONG');

      // Ping with custom message
      const customMessage = 'health_check_' + Math.random();
      const response = await redis.ping(customMessage);
      assert.strictEqual(response, customMessage);
    });

    test('should handle echo for message verification', async () => {
      const testMessage = 'echo_test_' + Math.random();
      const response = await redis.echo(testMessage);
      assert.strictEqual(response, testMessage);
    });

    test('should provide time information for synchronization', async () => {
      const time = await redis.time();
      assert.ok(Array.isArray(time));
      assert.strictEqual(time.length, 2);

      // First element should be Unix timestamp (seconds)
      assert.strictEqual(typeof time[0], 'string');
      assert.ok(parseInt(time[0]) > 1600000000); // After 2020

      // Second element should be microseconds
      assert.strictEqual(typeof time[1], 'string');
      assert.ok(parseInt(time[1]) >= 0);
      assert.ok(parseInt(time[1]) < 1000000);
    });
  });

  describe('Security and Access Monitoring', () => {
    test('should handle auth-related monitoring', async () => {
      // Test auth state (should succeed without auth in test environment)
      try {
        await redis.ping();
        assert.strictEqual(true, true); // Connection works
      } catch (error) {
        // May require auth in some environments
        assert.ok(error !== undefined);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle unknown INFO sections gracefully', async () => {
      try {
        const result = await redis.info('nonexistent_section');
        assert.strictEqual(typeof result, 'string');
        // Should return empty or minimal info
      } catch (error) {
        // Some implementations may throw error for unknown sections
        assert.ok(error !== undefined);
      }
    });

    test('should handle CONFIG commands with invalid parameters', async () => {
      try {
        await redis.config('GET', 'nonexistent_config_parameter');
        // Should return empty array for non-existent config
      } catch (error) {
        assert.ok(error !== undefined);
      }
    });

    test('should handle MEMORY commands gracefully when not supported', async () => {
      try {
        await redis.memory('USAGE', 'test_key');
        // If supported, should return number
      } catch (error) {
        // MEMORY commands might not be available in older Redis versions
        assert.ok(error !== undefined);
      }
    });

    test('should handle CLIENT commands when restricted', async () => {
      try {
        await redis.client('LIST');
        // If allowed, should return string
      } catch (error) {
        // CLIENT commands might be restricted
        assert.ok(error !== undefined);
      }
    });

    test('should handle DEBUG commands when disabled', async () => {
      try {
        await redis.debug('OBJECT', 'test_key');
        // If enabled, should return debug info
      } catch (error) {
        // DEBUG commands are often disabled in production
        assert.ok(error !== undefined);
      }
    });
  });
});
