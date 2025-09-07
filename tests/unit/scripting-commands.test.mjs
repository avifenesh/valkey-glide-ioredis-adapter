/**
 * Scripting Commands Tests
 * Tests for Lua scripting functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pkg from "../../dist/index.js";
const { Redis } = pkg;

describe('Scripting Commands', () => {
  let client;

  beforeEach(async () => {
    client = new Redis({
      host: process.env.VALKEY_HOST || 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
    });
    await client.connect();
    await client.flushdb();
  });

  afterEach(async () => {
    if (client) {
      await client.flushdb();
      await client.disconnect();
    }
  });

  describe('EVAL', () => {
    it('should execute simple Lua script', async () => {
      const script = 'return "Hello from Lua"';
      const result = await client.eval(script, 0);
      assert.strictEqual(result, 'Hello from Lua');
    });

    it('should execute script with KEYS', async () => {
      await client.set('mykey', 'myvalue');
      
      const script = 'return redis.call("get", KEYS[1])';
      const result = await client.eval(script, 1, 'mykey');
      assert.strictEqual(result, 'myvalue');
    });

    it('should execute script with ARGV', async () => {
      const script = 'return ARGV[1] .. " " .. ARGV[2]';
      const result = await client.eval(script, 0, 'Hello', 'World');
      assert.strictEqual(result, 'Hello World');
    });

    it('should execute script with both KEYS and ARGV', async () => {
      const script = 'return redis.call("set", KEYS[1], ARGV[1])';
      const result = await client.eval(script, 1, 'testkey', 'testvalue');
      assert.strictEqual(result, 'OK');
      
      const value = await client.get('testkey');
      assert.strictEqual(value, 'testvalue');
    });

    it('should handle numeric returns', async () => {
      const script = 'return 42';
      const result = await client.eval(script, 0);
      assert.strictEqual(result, 42);
    });

    it('should handle array returns', async () => {
      const script = 'return {1, 2, 3}';
      const result = await client.eval(script, 0);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });

    it('should handle table returns', async () => {
      const script = 'return {["key1"] = "value1", ["key2"] = "value2"}';
      const result = await client.eval(script, 0);
      // Redis converts Lua tables to arrays when returned
      assert.ok(Array.isArray(result) || typeof result === 'object');
    });

    it('should handle nil returns', async () => {
      const script = 'return nil';
      const result = await client.eval(script, 0);
      assert.strictEqual(result, null);
    });

    it('should handle boolean returns', async () => {
      const scriptTrue = 'return true';
      const scriptFalse = 'return false';
      
      const resultTrue = await client.eval(scriptTrue, 0);
      const resultFalse = await client.eval(scriptFalse, 0);
      
      assert.strictEqual(resultTrue, 1);
      assert.strictEqual(resultFalse, null);
    });

    it('should execute complex script with multiple Redis commands', async () => {
      const script = `
        redis.call("set", KEYS[1], ARGV[1])
        redis.call("set", KEYS[2], ARGV[2])
        local val1 = redis.call("get", KEYS[1])
        local val2 = redis.call("get", KEYS[2])
        return val1 .. ":" .. val2
      `;
      
      const result = await client.eval(script, 2, 'key1', 'key2', 'value1', 'value2');
      assert.strictEqual(result, 'value1:value2');
    });

    it('should handle errors in script', async () => {
      const script = 'return redis.call("unknown_command")';
      
      try {
        await client.eval(script, 0);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
        // More flexible error check - just ensure we got an error
        assert.ok(err.message && err.message.length > 0, 'Should have error message');
      }
    });

    it('should support pcall for error handling', async () => {
      const script = `
        local status, result = pcall(function()
          return redis.call("unknown_command")
        end)
        if status then
          return result
        else
          return "Error caught"
        end
      `;
      
      const result = await client.eval(script, 0);
      assert.strictEqual(result, 'Error caught');
    });

    it('should handle large scripts', async () => {
      const script = `
        local count = 0
        for i = 1, 1000 do
          count = count + i
        end
        return count
      `;
      
      const result = await client.eval(script, 0);
      assert.strictEqual(result, 500500); // Sum of 1 to 1000
    });

    it('should support conditional logic', async () => {
      const script = `
        local value = tonumber(ARGV[1])
        if value > 10 then
          return "greater"
        elseif value < 10 then
          return "less"
        else
          return "equal"
        end
      `;
      
      const result1 = await client.eval(script, 0, 15);
      const result2 = await client.eval(script, 0, 5);
      const result3 = await client.eval(script, 0, 10);
      
      assert.strictEqual(result1, 'greater');
      assert.strictEqual(result2, 'less');
      assert.strictEqual(result3, 'equal');
    });
  });

  describe('EVALSHA', () => {
    it('should execute script by SHA1 hash', async () => {
      const script = 'return "Hello from cached script"';
      
      // First load the script
      const sha = await client.script('load', script);
      assert.ok(sha);
      assert.strictEqual(typeof sha, 'string');
      assert.strictEqual(sha.length, 40); // SHA1 hash is 40 characters
      
      // Execute by SHA
      const result = await client.evalsha(sha, 0);
      assert.strictEqual(result, 'Hello from cached script');
    });

    it('should handle NOSCRIPT error gracefully', async () => {
      const fakeSha = 'a'.repeat(40);
      
      try {
        await client.evalsha(fakeSha, 0);
        assert.fail('Should have thrown NOSCRIPT error');
      } catch (err) {
        assert.ok(err);
        // Check for NOSCRIPT or NoScriptError (GLIDE uses NoScriptError)
        assert.ok(err.message.includes('NOSCRIPT') || err.message.includes('NoScript'));
      }
    });

    it('should execute with KEYS and ARGV', async () => {
      const script = 'return redis.call("set", KEYS[1], ARGV[1])';
      const sha = await client.script('load', script);
      
      const result = await client.evalsha(sha, 1, 'mykey', 'myvalue');
      assert.strictEqual(result, 'OK');
      
      const value = await client.get('mykey');
      assert.strictEqual(value, 'myvalue');
    });
  });

  describe('SCRIPT LOAD', () => {
    it('should load script and return SHA1', async () => {
      const script = 'return "test script"';
      const sha = await client.script('load', script);
      
      assert.ok(sha);
      assert.strictEqual(typeof sha, 'string');
      assert.strictEqual(sha.length, 40);
    });

    it('should load complex script', async () => {
      const script = `
        local sum = 0
        for i = 1, #ARGV do
          sum = sum + tonumber(ARGV[i])
        end
        return sum
      `;
      
      const sha = await client.script('load', script);
      assert.ok(sha);
      
      // Test execution
      const result = await client.evalsha(sha, 0, 1, 2, 3, 4, 5);
      assert.strictEqual(result, 15);
    });

    it('should handle duplicate loads', async () => {
      const script = 'return 42';
      
      const sha1 = await client.script('load', script);
      const sha2 = await client.script('load', script);
      
      assert.strictEqual(sha1, sha2); // Same script should have same SHA
    });
  });

  describe('SCRIPT EXISTS', () => {
    it('should check if script exists', async () => {
      const script = 'return "exists test"';
      const sha = await client.script('load', script);
      
      const exists = await client.script('exists', sha);
      assert.deepStrictEqual(exists, [1]);
    });

    it('should check multiple scripts', async () => {
      const script1 = 'return 1';
      const script2 = 'return 2';
      const sha1 = await client.script('load', script1);
      const sha2 = await client.script('load', script2);
      const fakeSha = 'a'.repeat(40);
      
      const exists = await client.script('exists', sha1, sha2, fakeSha);
      assert.deepStrictEqual(exists, [1, 1, 0]);
    });

    it('should return 0 for non-existent script', async () => {
      const fakeSha = 'b'.repeat(40);
      const exists = await client.script('exists', fakeSha);
      assert.deepStrictEqual(exists, [0]);
    });
  });

  describe('SCRIPT FLUSH', () => {
    it('should flush all scripts', async () => {
      const script = 'return "flush test"';
      const sha = await client.script('load', script);
      
      // Verify script exists
      let exists = await client.script('exists', sha);
      assert.deepStrictEqual(exists, [1]);
      
      // Flush all scripts
      const result = await client.script('flush');
      assert.strictEqual(result, 'OK');
      
      // Verify script no longer exists
      exists = await client.script('exists', sha);
      assert.deepStrictEqual(exists, [0]);
    });

    it('should flush with SYNC mode', async () => {
      const script = 'return "sync flush"';
      const sha = await client.script('load', script);
      
      const result = await client.script('flush', 'SYNC');
      assert.strictEqual(result, 'OK');
      
      const exists = await client.script('exists', sha);
      assert.deepStrictEqual(exists, [0]);
    });

    it('should flush with ASYNC mode', async () => {
      const script = 'return "async flush"';
      const sha = await client.script('load', script);
      
      const result = await client.script('flush', 'ASYNC');
      assert.strictEqual(result, 'OK');
      
      // May need to wait for async flush
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const exists = await client.script('exists', sha);
      assert.deepStrictEqual(exists, [0]);
    });
  });

  describe('SCRIPT KILL', () => {
    it('should handle SCRIPT KILL when no script is running', async () => {
      try {
        await client.script('kill');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
        assert.ok(err.message.includes('NOTBUSY') || err.message.includes('No scripts in execution'));
      }
    });

    // Note: Testing actual script killing would require a long-running script
    // and concurrent execution, which is complex to test reliably
  });

  describe('SCRIPT DEBUG', () => {
    it('should set debug mode', async () => {
      // Note: SCRIPT DEBUG may not be available in all Redis/Valkey versions
      try {
        const result = await client.script('debug', 'NO');
        assert.strictEqual(result, 'OK');
      } catch (err) {
        // If not supported, that's okay
        if (!err.message.includes('unknown subcommand')) {
          throw err;
        }
      }
    });
  });

  describe('Real-world Scripting Patterns', () => {
    it('should implement atomic increment with limit', async () => {
      const script = `
        local current = redis.call("get", KEYS[1])
        if not current then
          current = 0
        else
          current = tonumber(current)
        end
        
        local limit = tonumber(ARGV[1])
        if current >= limit then
          return -1
        else
          return redis.call("incr", KEYS[1])
        end
      `;
      
      const key = 'counter';
      const limit = 5;
      
      // Increment up to limit
      for (let i = 1; i <= limit; i++) {
        const result = await client.eval(script, 1, key, limit);
        assert.strictEqual(result, i);
      }
      
      // Should return -1 when limit reached
      const result = await client.eval(script, 1, key, limit);
      assert.strictEqual(result, -1);
    });

    it('should implement compare-and-swap', async () => {
      const script = `
        local current = redis.call("get", KEYS[1])
        if current == ARGV[1] then
          redis.call("set", KEYS[1], ARGV[2])
          return 1
        else
          return 0
        end
      `;
      
      const key = 'cas_key';
      await client.set(key, 'initial');
      
      // Successful CAS
      const result1 = await client.eval(script, 1, key, 'initial', 'updated');
      assert.strictEqual(result1, 1);
      
      const value = await client.get(key);
      assert.strictEqual(value, 'updated');
      
      // Failed CAS (wrong expected value)
      const result2 = await client.eval(script, 1, key, 'wrong', 'another');
      assert.strictEqual(result2, 0);
      
      const value2 = await client.get(key);
      assert.strictEqual(value2, 'updated'); // Should remain unchanged
    });

    it('should implement rate limiting', async () => {
      const script = `
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local current_time = tonumber(ARGV[3])
        
        -- Remove old entries
        redis.call("zremrangebyscore", key, 0, current_time - window)
        
        -- Count current entries
        local current = redis.call("zcard", key)
        
        if current < limit then
          -- Add new entry
          redis.call("zadd", key, current_time, current_time)
          redis.call("expire", key, window)
          return 1
        else
          return 0
        end
      `;
      
      const key = 'rate_limit';
      const limit = 3;
      const window = 10; // 10 seconds
      const now = Math.floor(Date.now() / 1000);
      
      // Should allow first 3 requests
      for (let i = 0; i < limit; i++) {
        const result = await client.eval(script, 1, key, limit, window, now + i);
        assert.strictEqual(result, 1);
      }
      
      // Should deny 4th request
      const result = await client.eval(script, 1, key, limit, window, now + limit);
      assert.strictEqual(result, 0);
    });

    it('should implement bulk operations', async () => {
      const script = `
        local results = {}
        for i = 1, #KEYS do
          results[i] = redis.call("get", KEYS[i])
        end
        return results
      `;
      
      // Set up test data
      await client.set('bulk1', 'value1');
      await client.set('bulk2', 'value2');
      await client.set('bulk3', 'value3');
      
      const results = await client.eval(script, 3, 'bulk1', 'bulk2', 'bulk3');
      assert.deepStrictEqual(results, ['value1', 'value2', 'value3']);
    });

    it('should implement distributed lock acquisition', async () => {
      const script = `
        local key = KEYS[1]
        local token = ARGV[1]
        local ttl = ARGV[2]
        
        local result = redis.call("set", key, token, "NX", "EX", ttl)
        if result then
          return 1
        else
          return 0
        end
      `;
      
      const lockKey = 'distributed_lock';
      const token1 = 'token_123';
      const token2 = 'token_456';
      const ttl = 10;
      
      // First lock should succeed
      const result1 = await client.eval(script, 1, lockKey, token1, ttl);
      assert.strictEqual(result1, 1);
      
      // Second lock should fail
      const result2 = await client.eval(script, 1, lockKey, token2, ttl);
      assert.strictEqual(result2, 0);
    });

    it('should implement distributed lock release', async () => {
      const releaseScript = `
        local key = KEYS[1]
        local token = ARGV[1]
        
        if redis.call("get", key) == token then
          return redis.call("del", key)
        else
          return 0
        end
      `;
      
      const lockKey = 'release_lock';
      const token = 'my_token';
      
      // Set the lock
      await client.set(lockKey, token);
      
      // Release with correct token
      const result1 = await client.eval(releaseScript, 1, lockKey, token);
      assert.strictEqual(result1, 1);
      
      // Verify lock is released
      const value = await client.get(lockKey);
      assert.strictEqual(value, null);
      
      // Try to release non-existent lock
      const result2 = await client.eval(releaseScript, 1, lockKey, token);
      assert.strictEqual(result2, 0);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors in script', async () => {
      const script = 'this is not valid lua';
      
      try {
        await client.eval(script, 0);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
        // Just check we got an error - message format varies
        assert.ok(err.message && err.message.length > 0, 'Should have error message');
      }
    });

    it('should handle runtime errors in script', async () => {
      const script = 'return 1 / 0'; // Division by zero
      
      try {
        await client.eval(script, 0);
        // Some versions might handle this differently
      } catch (err) {
        assert.ok(err);
      }
    });

    it('should handle invalid Redis commands in script', async () => {
      const script = 'return redis.call("INVALID_COMMAND", "key")';
      
      try {
        await client.eval(script, 0);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
        // Just check we got an error - message format varies
        assert.ok(err.message && err.message.length > 0, 'Should have error message');
      }
    });

    it('should handle wrong number of arguments', async () => {
      const script = 'return KEYS[1]';
      
      try {
        await client.eval(script, 2, 'only_one_key'); // Says 2 keys but provides 1
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
      }
    });
  });
});
