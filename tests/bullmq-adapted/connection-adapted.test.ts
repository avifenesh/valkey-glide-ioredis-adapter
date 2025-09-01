/**
 * BullMQ Connection Tests - Adapted for our ioredis-adapter
 * 
 * These tests verify that our ioredis adapter works correctly with BullMQ's
 * connection system, defineCommand, and Lua script execution.
 */

// Using Jest expect instead of chai to match our test framework
import { Redis } from "../../src";
import { getRedisTestConfig } from '../utils/redis-config';

describe('BullMQ Connection Tests - Adapted for ioredis-adapter', () => {
  let redis: Redis;
  
  beforeEach(async () => {
    const config = await getRedisTestConfig();
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
    it('should have defineCommand method', () => {
      expect(typeof redis.defineCommand).toBe('function');
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
        numberOfKeys: 1
      });

      // The command should now exist on the redis instance
      expect(typeof (redis as any).testScript).toBe('function');

      // Test execution
      const result = await (redis as any).testScript('test:key', 'hello');
      expect(result).toBe('hello');
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
        numberOfKeys: 1
      });

      // Test with array-style arguments (BullMQ pattern)
      const result = await (redis as any).arrayTest(['test:array', 'array-value']);
      expect(result).toBe('array-value');
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
        numberOfKeys: 0
      });

      const result = await (redis as any).emptyReturn();
      expect(result).toEqual([]);
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
        numberOfKeys: 1
      });

      const jobId = 'job:1';
      const jobData = '{"message": "test job"}';
      
      const result = await (redis as any).addJob('test:queue', jobId, jobData);
      expect(result).toBe(jobId);

      // Verify job was actually added
      const waitingJobs = await redis.lrange('test:queue:waiting', 0, -1);
      expect(waitingJobs).toContain(jobId);

      const storedData = await redis.hget(`test:queue:jobs:${jobId}`, 'data');
      expect(storedData).toBe(jobData);
    });

    it('should support versioned commands (BullMQ pattern)', async () => {
      // BullMQ uses versioned commands like "addJob:5.58.4"
      const script = `return "version-test"`;
      
      const commandName = 'versionedCommand:5.58.4';
      redis.defineCommand(commandName, {
        lua: script,
        numberOfKeys: 0
      });

      const result = await (redis as any)[commandName]();
      expect(result).toBe('version-test');
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
        numberOfKeys: 0
      });

      await expect((redis as any).errorCommand()).rejects.toThrow();
    });

    it('should handle EVALSHA fallback to EVAL', async () => {
      // This tests the EVALSHA -> EVAL fallback mechanism
      const script = `return "evalsha-test"`;
      
      redis.defineCommand('evalshaTest', {
        lua: script,
        numberOfKeys: 0
      });

      // First call should work (might use EVALSHA or EVAL)
      const result1 = await (redis as any).evalshaTest();
      expect(result1).toBe('evalsha-test');

      // Second call should also work (should use cached EVALSHA)
      const result2 = await (redis as any).evalshaTest();
      expect(result2).toBe('evalsha-test');
    });
  });

  describe('Connection Features', () => {
    it('should support basic Redis commands needed by BullMQ', async () => {
      // BullMQ uses these commands extensively
      await redis.set('test:key', 'value');
      const value = await redis.get('test:key');
      expect(value).toBe('value');

      await redis.hset('test:hash', 'field', 'hashvalue');
      const hashValue = await redis.hget('test:hash', 'field');
      expect(hashValue).toBe('hashvalue');

      await redis.lpush('test:list', 'item1', 'item2');
      const listLength = await redis.llen('test:list');
      expect(listLength).toBe(2);
    });

    it('should handle blocking operations (bclient compatibility)', async () => {
      // BullMQ uses blocking operations for job processing
      expect(typeof redis.blocked).toBe('boolean');
      
      // Test that we can enable blocking mode
      redis.blocked = true;
      expect(redis.blocked).toBe(true);
    });
  });
});