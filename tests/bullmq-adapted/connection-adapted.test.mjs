/**
 * BullMQ Connection Tests - Adapted for our ioredis-adapter
 *
 * These tests verify that our ioredis adapter works correctly with BullMQ's
 * connection system, defineCommand, and Lua script execution.
 */

// Using Jest expect instead of chai to match our test framework
import { describe, it, test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('BullMQ Connection Tests - Adapted for ioredis-adapter', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    redis = new Redis(config);
    await redis.connect();
    await redis.flushall();
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Basic ioredis compatibility', () => {
    it('should have defineCommand method', async () => {
      assert.strictEqual(typeof redis.defineCommand, 'function');
    });

    it('should register custom commands via defineCommand', async () => {
      // Test basic Lua script registration - similar to BullMQ's usage
      const script = `
        local key = KEYS[1]
        local value = ARGV[1]
        redis.call("SET", key, value)
        return redis.call("GET", key)
      `;

      redis.defineCommand('testScript', {
        lua: script,
        numberOfKeys: 1,
      });

      // The command should now exist on the redis instance
      assert.strictEqual(typeof redis.testScript, 'function');

      // Test execution
      const result = await (redis ).testScript('test:key', 'hello');
      assert.strictEqual(result, 'hello');
    });

    it('should handle BullMQ-style array arguments', async () => {
      // BullMQ often passes arguments as arrays
      const script = `
        local key = KEYS[1]
        local value = ARGV[1]
        redis.call("SET", key, value)
        return redis.call("GET", key)
      `;

      redis.defineCommand('arrayTest', {
        lua: script,
        numberOfKeys: 1,
      });

      // Test with array-style arguments (BullMQ pattern)
      const result = await (redis ).arrayTest([
        'test:array',
        'array-value',
      ]);
      assert.strictEqual(result, 'array-value');
    });
  });

  describe('BullMQ Script Compatibility', () => {
    it('should handle empty result returns', async () => {
      // Some BullMQ scripts return empty results
      const script = `
        return {}
      `;

      redis.defineCommand('emptyReturn', {
        lua: script,
        numberOfKeys: 0,
      });

      const result = await (redis ).emptyReturn();
      assert.deepStrictEqual(result, []);
    });

    it('should handle complex BullMQ-like script with multiple operations', async () => {
      // Simulate a simplified version of BullMQ's addJob script
      const addJobScript = `
        local queueKey = KEYS[1]
        local jobId = ARGV[1] 
        local jobData = ARGV[2]
        
        -- Add job to waiting list
        redis.call("LPUSH", queueKey .. ":waiting", jobId)
        
        -- Store job data
        redis.call("HSET", queueKey .. ":jobs:" .. jobId, "data", jobData, "id", jobId)
        
        return jobId
      `;

      redis.defineCommand('addJob', {
        lua: addJobScript,
        numberOfKeys: 1,
      });

      const jobId = 'job:1';
      const jobData = '{"message": "test job"}';

      const result = await (redis ).addJob('test:queue', jobId, jobData);
      assert.strictEqual(result, jobId);

      // Verify job was actually added
      const waitingJobs = await redis.lrange('test:queue:waiting', 0, -1);
      assert.ok(waitingJobs.includes(jobId));

      const storedData = await redis.hget(`test:queue:jobs:${jobId}`, 'data');
      assert.strictEqual(storedData, jobData);
    });

    it('should support versioned commands (BullMQ pattern)', async () => {
      // BullMQ uses versioned commands like "addJob:5.58.4"
      const script = `return "version-test"`;

      const commandName = 'versionedCommand:5.58.4';
      redis.defineCommand(commandName, {
        lua: script,
        numberOfKeys: 0,
      });

      const result = await (redis )[commandName]();
      assert.strictEqual(result, 'version-test');
    });
  });

  describe('Error Handling', () => {
    it('should handle Lua script errors gracefully', async () => {
      // Test script with intentional error
      const errorScript = `
        redis.call("BADCOMMAND")
        return "should not reach here"
      `;

      redis.defineCommand('errorCommand', {
        lua: errorScript,
        numberOfKeys: 0,
      });

      await assert.rejects(async () => {
        await redis.errorCommand();
      });
    });

    it('should handle EVALSHA fallback to EVAL', async () => {
      // This tests the EVALSHA -> EVAL fallback mechanism
      const script = `return "evalsha-test"`;

      redis.defineCommand('evalshaTest', {
        lua: script,
        numberOfKeys: 0,
      });

      // First call should work (might use EVALSHA or EVAL)
      const result1 = await (redis ).evalshaTest();
      assert.strictEqual(result1, 'evalsha-test');

      // Second call should also work (should use cached EVALSHA)
      const result2 = await (redis ).evalshaTest();
      assert.strictEqual(result2, 'evalsha-test');
    });
  });

  describe('Connection Features', () => {
    it('should support basic Redis commands needed by BullMQ', async () => {
      // BullMQ uses these commands extensively
      await redis.set('test:key', 'value');
      const value = await redis.get('test:key');
      assert.strictEqual(value, 'value');

      await redis.hset('test:hash', 'field', 'hashvalue');
      const hashValue = await redis.hget('test:hash', 'field');
      assert.strictEqual(hashValue, 'hashvalue');

      await redis.lpush('test:list', 'item1', 'item2');
      const listLength = await redis.llen('test:list');
      assert.strictEqual(listLength, 2);
    });

    it('should handle blocking operations (bclient compatibility)', async () => {
      // BullMQ uses blocking operations for job processing
      assert.strictEqual(typeof redis.blocked, 'boolean');

      // Test that we can enable blocking mode
      redis.blocked = true;
      assert.strictEqual(redis.blocked, true);
    });
  });
});
