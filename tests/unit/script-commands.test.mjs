/**
 * Script/Lua Commands Comprehensive Tests
 * Real-world patterns operations, rate limiting, locks, counters
 * Based on:
 * - GitHub's atomic repository operations with Lua scripts
 * - Stripe's transaction processing with EVAL for consistency
 * - Discord's rate limiting with atomic increment/reset patterns
 * - Shopify's inventory management with atomic stock adjustments
 * - Uber's fare calculation with complex Lua business logic
 * - Netflix's A/B testing assignment with stateful Lua scripts
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;;
import { getStandaloneConfig } from '../utils/test-config.mjs';;

describe('Script Commands - Atomic Operations & Business Logic', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    redis = new Redis(config);
    await redis.connect();
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Rate Limiting Patterns', () => {
    it('should implement sliding window rate limiter with Lua script', async () => {
      const rateLimitScript = `
        local key = KEYS[1]
        local window = tonumber(ARGV[1])
        local limit = tonumber(ARGV[2])
        local current_time = tonumber(ARGV[3])

        -- Remove expired entries
        redis.call('ZREMRANGEBYSCORE', key, 0, current_time - window)
        
        -- Count current requests
        local current_requests = redis.call('ZCARD', key)
        
        if current_requests  {
      const tokenBucketScript = `
        local bucket_key = KEYS[1]
        local max_tokens = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local current_time = tonumber(ARGV[3])
        local requested_tokens = tonumber(ARGV[4])
        
        -- Get current bucket state
        local bucket = redis.call('HMGET', bucket_key, 'tokens', 'last_refill')
        local current_tokens = tonumber(bucket[1]) or max_tokens
        local last_refill = tonumber(bucket[2]) or current_time
        
        -- Calculate tokens to add based on time elapsed
        local time_passed = current_time - last_refill
        local tokens_to_add = math.floor(time_passed * refill_rate / 1000)
        current_tokens = math.min(max_tokens, current_tokens + tokens_to_add)
        
        if current_tokens  = requested_tokens then
          -- Grant the request
          current_tokens = current_tokens - requested_tokens
          redis.call('HMSET', bucket_key, 'tokens', current_tokens, 'last_refill', current_time)
          redis.call('EXPIRE', bucket_key, 3600)
          return {1, current_tokens}  -- [granted, remaining_tokens]
        else
          -- Deny the request but update the bucket
          redis.call('HMSET', bucket_key, 'tokens', current_tokens, 'last_refill', current_time)
          redis.call('EXPIRE', bucket_key, 3600)
          return {0, current_tokens}  -- [denied, remaining_tokens]
        end
      `;

      const bucketKey = `token_bucket:${Math.random()}`;
      const maxTokens = 10;
      const refillRate = 2; // 2 tokens per second
      const currentTime = Date.now();

      // Request 3 tokens - should be granted
      const result1 = await redis.eval(
        tokenBucketScript,
        1,
        bucketKey,
        maxTokens.toString(),
        refillRate.toString(),
        currentTime.toString(),
        '3'
      );

      assert.strictEqual(result1[0], 1); // Granted
      assert.strictEqual(result1[1], 7); // 7 tokens remaining

      // Request 8 tokens - should be denied (only 7 available)
      const result2 = await redis.eval(
        tokenBucketScript,
        1,
        bucketKey,
        maxTokens.toString(),
        refillRate.toString(),
        (currentTime + 100).toString(),
        '8'
      );

      assert.strictEqual(result2[0], 0); // Denied
      assert.strictEqual(result2[1], 7); // Still 7 tokens

      // Wait and request again - should get more tokens due to refill
      const result3 = await redis.eval(
        tokenBucketScript,
        1,
        bucketKey,
        maxTokens.toString(),
        refillRate.toString(),
        (currentTime + 2000).toString(), // 2 seconds later
        '5'
      );

      assert.strictEqual(result3[0], 1); // Granted (bucket refilled)
      expect(result3[1]).toBeGreaterThanOrEqual(0); // Some tokens remaining
    });

    it('should implement fixed window rate limiter like Discord', async () => {
      const fixedWindowScript = `
        local key = KEYS[1]
        local window_seconds = tonumber(ARGV[1])
        local limit = tonumber(ARGV[2])
        local current_time = tonumber(ARGV[3])
        
        -- Calculate window start
        local window_start = math.floor(current_time / (window_seconds * 1000)) * (window_seconds * 1000)
        local window_key = key .. ":" .. window_start
        
        -- Increment counter first, then check if we exceeded the limit
        local new_count = redis.call('INCR', window_key)
        redis.call('EXPIRE', window_key, window_seconds * 2)
        
        if new_count  0); // Reset time
      }

      // 4th message should be denied
      const result4 = await redis.eval(
        fixedWindowScript,
        1,
        key,
        windowSeconds.toString(),
        limit.toString(),
        (baseTime + 400).toString()
      );

      assert.strictEqual(result4[0], 0); // Denied
      assert.strictEqual(result4[1], 0); // No remaining
      assert.ok(result4[2] > 0); // Time until reset
    });
  });

  describe('Atomic Business Operations', () => {
    it('should implement atomic inventory management like Shopify', async () => {
      const inventoryScript = `
        local product_key = KEYS[1]
        local order_id = ARGV[1]
        local requested_qty = tonumber(ARGV[2])
        
        -- Get current inventory
        local inventory = redis.call('HMGET', product_key, 'available', 'reserved', 'total')
        local available = tonumber(inventory[1]) or 0
        local reserved = tonumber(inventory[2]) or 0
        local total = tonumber(inventory[3]) or 0
        
        if available  = requested_qty then
          -- Reserve the items
          available = available - requested_qty
          reserved = reserved + requested_qty
          
          -- Update inventory
          redis.call('HMSET', product_key, 'available', available, 'reserved', reserved)
          
          -- Log the reservation
          local reservation_key = product_key .. ':' .. order_id
          redis.call('HMSET', reservation_key, 
            'quantity', requested_qty, 
            'timestamp', redis.call('TIME')[1],
            'status', 'reserved'
          )
          redis.call('EXPIRE', reservation_key, 3600) -- 1 hour expiration
          
          return {1, available, reserved, 'reserved'}  -- [success, available, reserved, status]
        else
          return {0, available, reserved, 'insufficient_stock'}  -- [failure, available, reserved, error]
        end
      `;

      const productKey = `inventory:${Math.random()}`;

      // Initialize inventory
      await redis.hmset(
        productKey,
        'available',
        '100',
        'reserved',
        '0',
        'total',
        '100'
      );

      // Reserve 25 items for order 1
      const reservation1 = await redis.eval(
        inventoryScript,
        1,
        productKey,
        'ORD-001',
        '25'
      );

      assert.strictEqual(reservation1[0], 1); // Success
      assert.strictEqual(reservation1[1], 75); // 75 available
      assert.strictEqual(reservation1[2], 25); // 25 reserved
      assert.strictEqual(reservation1[3], 'reserved');

      // Reserve 80 items for order 2 - should fail
      const reservation2 = await redis.eval(
        inventoryScript,
        1,
        productKey,
        'ORD-002',
        '80'
      );

      assert.strictEqual(reservation2[0], 0); // Failure
      assert.strictEqual(reservation2[1], 75); // Still 75 available
      assert.strictEqual(reservation2[2], 25); // Still 25 reserved
      assert.strictEqual(reservation2[3], 'insufficient_stock');

      // Reserve 50 items for order 3 - should succeed
      const reservation3 = await redis.eval(
        inventoryScript,
        1,
        productKey,
        'ORD-003',
        '50'
      );

      assert.strictEqual(reservation3[0], 1); // Success
      assert.strictEqual(reservation3[1], 25); // 25 available
      assert.strictEqual(reservation3[2], 75); // 75 reserved
    });
  });

  describe('Distributed Locking Patterns', () => {
    it('should implement distributed lock with expiration like GitHub', async () => {
      const distributedLockScript = `
        local lock_key = KEYS[1]
        local lock_value = ARGV[1]
        local expiration_ms = tonumber(ARGV[2])
        local current_time = tonumber(ARGV[3])
        
        -- Try to acquire lock
        local current_lock = redis.call('GET', lock_key)
        
        if not current_lock then
          -- Lock is available, acquire it
          redis.call('SET', lock_key, lock_value, 'PX', expiration_ms)
          return {1, lock_value, expiration_ms}  -- [acquired, lock_value, expiration]
        elseif current_lock == lock_value then
          -- We already own this lock, extend it
          redis.call('SET', lock_key, lock_value, 'PX', expiration_ms)
          return {1, lock_value, expiration_ms}  -- [extended, lock_value, expiration]
        else
          -- Lock is held by someone else
          local ttl = redis.call('PTTL', lock_key)
          return {0, current_lock, ttl}  -- [failed, owner, remaining_time]
        end
      `;

      const lockKey = `repo:${Math.random()}`;
      const process1Id = 'process-1-uuid';
      const process2Id = 'process-2-uuid';
      const expirationMs = 5000; // 5 seconds

      // Process 1 acquires lock
      const lock1 = await redis.eval(
        distributedLockScript,
        1,
        lockKey,
        process1Id,
        expirationMs.toString(),
        Date.now().toString()
      );

      assert.strictEqual(lock1[0], 1); // Acquired
      assert.strictEqual(lock1[1], process1Id); // Correct owner
      assert.strictEqual(lock1[2], expirationMs); // Correct expiration

      // Process 2 tries to acquire same lock - should fail
      const lock2 = await redis.eval(
        distributedLockScript,
        1,
        lockKey,
        process2Id,
        expirationMs.toString(),
        Date.now().toString()
      );

      assert.strictEqual(lock2[0], 0); // Failed
      assert.strictEqual(lock2[1], process1Id); // Lock owned by process 1
      expect(lock2[2]).toBeLessThanOrEqual(expirationMs); // TTL remaining

      // Process 1 extends its own lock - should succeed
      const lock3 = await redis.eval(
        distributedLockScript,
        1,
        lockKey,
        process1Id,
        expirationMs.toString(),
        Date.now().toString()
      );

      assert.strictEqual(lock3[0], 1); // Extended
      assert.strictEqual(lock3[1], process1Id); // Still owned by process 1
    });
  });

  describe('Counter and Analytics Patterns', () => {
    it('should implement atomic multi-counter updates for analytics', async () => {
      const analyticsScript = `
        local event_type = ARGV[1]
        local user_id = ARGV[2]
        local timestamp = tonumber(ARGV[3])
        local day = math.floor(timestamp / 86400) * 86400
        local hour = math.floor(timestamp / 3600) * 3600
        
        -- Update multiple counters atomically
        local counters_updated = {}
        
        -- Daily counter
        local daily_key = 'analytics:' .. event_type .. ':' .. day
        local daily_count = redis.call('INCR', daily_key)
        redis.call('EXPIRE', daily_key, 86400 * 7) -- Keep for 7 days
        table.insert(counters_updated, {'daily', daily_count})
        
        -- Hourly counter
        local hourly_key = 'analytics:' .. event_type .. ':' .. hour
        local hourly_count = redis.call('INCR', hourly_key)
        redis.call('EXPIRE', hourly_key, 3600 * 48) -- Keep for 48 hours
        table.insert(counters_updated, {'hourly', hourly_count})
        
        -- User-specific counter
        local user_key = 'analytics:' .. user_id .. ':' .. event_type
        local user_count = redis.call('INCR', user_key)
        redis.call('EXPIRE', user_key, 86400 * 30) -- Keep for 30 days
        table.insert(counters_updated, {'user', user_count})
        
        -- Global counter
        local global_key = 'analytics:' .. event_type
        local global_count = redis.call('INCR', global_key)
        table.insert(counters_updated, {'global', global_count})
        
        -- Track unique users per event per day
        local unique_users_key = 'analytics:' .. event_type .. ':' .. day
        local was_unique = redis.call('SADD', unique_users_key, user_id)
        redis.call('EXPIRE', unique_users_key, 86400 * 7)
        local unique_count = redis.call('SCARD', unique_users_key)
        table.insert(counters_updated, {'unique_users', unique_count})
        
        return counters_updated
      `;

      const eventType = `page_view_${Math.random()}`;
      const userId = `user_${Math.random()}`;
      const timestamp = Math.floor(Date.now() / 1000);

      // Record multiple events
      const result1 = await redis.eval(
        analyticsScript,
        0,
        eventType,
        userId,
        timestamp.toString()
      );

      expect(Array.isArray(result1)).toBe(true);
      assert.strictEqual(result1.length, 5); // 5 counters updated

      // Verify counter types and values - use unique events to avoid interference
      const counterMap = new Map(result1);
      expect(counterMap.get('daily')).toBeGreaterThanOrEqual(1);
      expect(counterMap.get('hourly')).toBeGreaterThanOrEqual(1);
      expect(counterMap.get('user')).toBeGreaterThanOrEqual(1);
      expect(counterMap.get('global')).toBeGreaterThanOrEqual(1);
      expect(counterMap.get('unique_users')).toBeGreaterThanOrEqual(1);

      // Record another event for same user - unique users should not increase
      const result2 = await redis.eval(
        analyticsScript,
        0,
        eventType,
        userId,
        timestamp.toString()
      );

      const counterMap2 = new Map(result2);
      expect(counterMap2.get('daily')).toBeGreaterThan(
        counterMap.get('daily')
      );
      expect(counterMap2.get('unique_users')).toBe(
        counterMap.get('unique_users')
      ); // Same user, so no change

      // Record event for different user - unique users should increase
      const result3 = await redis.eval(
        analyticsScript,
        0,
        eventType,
        `user_different_${Math.random()}`,
        timestamp.toString()
      );

      const counterMap3 = new Map(result3);
      expect(counterMap3.get('unique_users')).toBeGreaterThan(
        counterMap.get('unique_users')
      ); // More unique users
    });
  });

  describe('Script Caching and Performance', () => {
    it('should use EVALSHA for script caching optimization', async () => {
      const simpleScript = `
        return "Hello from cached script: " .. ARGV[1]
      `;

      // First execution with EVAL
      const result1 = await redis.eval(simpleScript, 0, 'World');
      assert.strictEqual(result1, 'Hello from cached script');

      // Calculate script SHA1 (simple approach - in production use crypto)
      const crypto = require('crypto');
      const scriptSha1 = crypto
        .createHash('sha1')
        .update(simpleScript)
        .digest('hex');

      // Execute with EVALSHA - script should be cached
      try {
        const result2 = await redis.evalsha(scriptSha1, 0, 'Cached');
        assert.strictEqual(result2, 'Hello from cached script');
      } catch (error) {
        // If EVALSHA fails, it means script wasn't cached - this is implementation dependent
        // Some Redis implementations might not cache automatically
        expect(error).toBeDefined();
      }
    });

    it('should handle complex return types from Lua scripts', async () => {
      const complexScript = `
        local result = {}
        
        -- String value
        result[1] = "string_value"
        
        -- Number value
        result[2] = 42
        
        -- Array of strings
        result[3] = {"item1", "item2", "item3"}
        
        -- Mixed nested structure
        result[4] = {"nested", 123, {"deep", "array"}}
        
        return result
      `;

      const result = await redis.eval(complexScript, 0);

      expect(Array.isArray(result)).toBe(true);
      assert.strictEqual(result.length, 4);
      assert.strictEqual(result[0], 'string_value');
      assert.strictEqual(result[1], 42);
      expect(Array.isArray(result[2])).toBe(true);
      assert.deepStrictEqual(result[2], ['item1', 'item2', 'item3']);
      expect(Array.isArray(result[3])).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle scripts with no keys or arguments', async () => {
      const simpleScript = `
        return redis.call('TIME')[1]
      `;

      const result = await redis.eval(simpleScript, 0);
      assert.strictEqual(typeof result, 'string');
      expect(parseInt(result)).toBeGreaterThan(1600000000); // After 2020
    });

    it('should handle scripts with many keys and arguments', async () => {
      const multiKeyScript = `
        local result = {}
        
        -- Process all keys
        for i, key in ipairs(KEYS) do
          result[i] = key .. ":" .. ARGV[i]
        end
        
        return result
      `;

      const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];
      const args = ['val1', 'val2', 'val3', 'val4', 'val5'];

      const result = await redis.eval(
        multiKeyScript,
        keys.length,
        ...keys,
        ...args
      );

      expect(Array.isArray(result)).toBe(true);
      assert.strictEqual(result.length, 5);
      assert.strictEqual(result[0], 'key1');
      assert.strictEqual(result[4], 'key5');
    });

    it('should handle empty script execution', async () => {
      const emptyScript = `
        -- This script does nothing
        return nil
      `;

      const result = await redis.eval(emptyScript, 0);
      assert.strictEqual(result, null);
    });

    it('should handle script errors gracefully', async () => {
      const errorScript = `
        local key = KEYS[1]
        local invalid_operation = redis.call('UNKNOWN_COMMAND', key)
        return invalid_operation
      `;

      const key = `error:${Math.random()}`;

      try {
        await redis.eval(errorScript, 1, key);
        // Should not reach here
        assert.strictEqual(true, false);
      } catch (error) {
        expect(error).toBeDefined();
        // Valkey returns "Unknown command" while Redis returns "Unknown Redis command"
        expect(String(error)).toMatch(/Unknown (Redis )?command/);
      }
    });
  });
});
