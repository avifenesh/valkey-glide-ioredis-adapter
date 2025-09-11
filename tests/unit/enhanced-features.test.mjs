/**
 * Enhanced Features Test Suite
 * Tests the new implementations for Bull/Bee-Queue compatibility
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

describe('Enhanced Features for Queue Compatibility', () => {
  let redis;
  let config;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }

    config = getStandaloneConfig();
  });

  beforeEach(async () => {
    redis = new Redis(config);
    await redis.connect();
    // Clear all databases to ensure clean state for each test
    await redis.flushall();
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Enhanced defineCommand', () => {
    test('supports variadic arguments (ioredis style)', async () => {
      redis.defineCommand('testCmd', {
        lua: 'return {KEYS[1], ARGV[1]}',
        numberOfKeys: 1,
      });

      const result = await redis.testCmd('key1', 'arg1');
      assert.deepStrictEqual(result, ['key1', 'arg1']);
    });

    test('supports array arguments (BullMQ style)', async () => {
      redis.defineCommand('testCmd', {
        lua: 'return {KEYS[1], ARGV[1]}',
        numberOfKeys: 1,
      });

      const result = await redis.testCmd(['key1', 'arg1']);
      assert.deepStrictEqual(result, ['key1', 'arg1']);
    });

    test('returns empty array instead of null for empty results', async () => {
      redis.defineCommand('emptyCmd', {
        lua: 'return {}',
        numberOfKeys: 0,
      });

      const result = await redis.emptyCmd();
      assert.deepStrictEqual(result, []);
      assert.ok(result !== null);
    });

    test('handles complex argument types', async () => {
      redis.defineCommand('complexCmd', {
        lua: 'return {KEYS[1], ARGV[1], ARGV[2]}',
        numberOfKeys: 1,
      });

      const result = await redis.complexCmd('key1', { data: 'test' }, 42);
      assert.deepStrictEqual(result, ['key1', '{"data":"test"}', '42']);
    });
  });

  describe('Static createClient factory', () => {
    test('creates client type', async () => {
      const client = Redis.createClient('client', config);
      assert.ok(client instanceof Redis);
      assert.strictEqual(client.clientType, 'client');
    });

    test('creates subscriber type', async () => {
      const subscriber = Redis.createClient('subscriber', config);
      assert.ok(subscriber instanceof Redis);
      assert.strictEqual(subscriber.clientType, 'subscriber');
    });

    test('creates bclient type with blocking ops enabled', async () => {
      const bclient = Redis.createClient('bclient', config);
      assert.ok(bclient instanceof Redis);
      assert.strictEqual(bclient.clientType, 'bclient');
      assert.strictEqual(bclient.enableBlockingOps, true);
    });

    test('returns client immediately (Bull compatibility)', async () => {
      const start = Date.now();
      const client = Redis.createClient('client', config);
      const elapsed = Date.now() - start;

      assert.ok(client instanceof Redis);
      assert.ok(elapsed < 100); // Should return immediately
    });
  });

  describe('Enhanced ZSET operations', () => {
    beforeEach(async () => {
      // Set up test data
      await redis.zadd('testzset', 1, 'one', 2, 'two', 3, 'three', 4, 'four');
    });

    test('zrangebyscore basic functionality', async () => {
      const result = await redis.zrangebyscore('testzset', 1, 3);
      assert.deepStrictEqual(result, ['one', 'two', 'three']);
    });

    test('zrangebyscore with WITHSCORES', async () => {
      const result = await redis.zrangebyscore('testzset', 1, 2, 'WITHSCORES');
      assert.deepStrictEqual(result, ['one', '1', 'two', '2']);
    });

    test('zrangebyscore with LIMIT', async () => {
      const result = await redis.zrangebyscore(
        'testzset',
        1,
        4,
        'LIMIT',
        '1',
        '2'
      );
      assert.deepStrictEqual(result, ['two', 'three']);
    });

    test('zrevrangebyscore functionality', async () => {
      const result = await redis.zrevrangebyscore('testzset', 3, 1);
      assert.deepStrictEqual(result, ['three', 'two', 'one']);
    });

    test('zpopmin functionality', async () => {
      const result = await redis.zpopmin('testzset', 2);
      assert.strictEqual(result.length, 4); // member, score, member, score
      assert.strictEqual(result[0], 'one');
      assert.strictEqual(result[1], '1');
    });

    test('zpopmax functionality', async () => {
      const result = await redis.zpopmax('testzset', 1);
      assert.strictEqual(result.length, 2); // member, score
      assert.strictEqual(result[0], 'four');
      assert.strictEqual(result[1], '4');
    });
  });

  describe('Blocking operations', () => {
    test('brpoplpush with existing data', async () => {
      await redis.lpush('source', 'item1', 'item2');

      const result = await redis.brpoplpush('source', 'dest', 1);
      assert.strictEqual(result, 'item1');

      const destItems = await redis.lrange('dest', 0, -1);
      assert.deepStrictEqual(destItems, ['item1']);
    });

    test('brpoplpush timeout behavior', async () => {
      const startTime = Date.now();
      const result = await redis.brpoplpush('empty-source', 'dest', 1);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(result, null);
      assert.ok(elapsed >= 900); // Allow some tolerance
      assert.ok(elapsed <= 1200);
    });

    test('blpop with existing data', async () => {
      await redis.lpush('testlist', 'item1');

      const result = await redis.blpop('testlist', 1);
      assert.deepStrictEqual(result, ['testlist', 'item1']);
    });

    test('blpop timeout behavior', async () => {
      const result = await redis.blpop('empty-list', 1);
      assert.strictEqual(result, null);
    });

    test('brpop with existing data', async () => {
      await redis.lpush('testlist', 'item1', 'item2');

      const result = await redis.brpop('testlist', 1);
      assert.deepStrictEqual(result, ['testlist', 'item1']);
    });
  });

  describe('Enhanced duplicate method', () => {
    test('preserves client type when duplicating', async () => {
      const original = Redis.createClient('bclient', config);
      const duplicated = await original.duplicate();

      assert.strictEqual(duplicated.clientType, 'bclient');
    });

    test('allows override options', async () => {
      const targetPort = process.env.REDIS_PORT
        ? Number(process.env.REDIS_PORT)
        : 6383;
      const duplicated = await redis.duplicate({ port: targetPort });
      assert.strictEqual(duplicated._options.port, targetPort);
    });

    test('connects in background (Bull compatibility)', async () => {
      const start = Date.now();
      const duplicated = await redis.duplicate();
      const elapsed = Date.now() - start;

      assert.ok(duplicated instanceof Redis);
      assert.ok(elapsed < 100); // Should return immediately
    });
  });
});
