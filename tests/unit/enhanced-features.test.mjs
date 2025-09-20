/**
 * Enhanced Features Test Suite
 * Tests the new implementations for Bull/Bee-Queue compatibility
 */

import { describe, test, beforeEach, afterEach, before } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis, Cluster } = pkg;
import { describeForEachMode, createClient, keyTag } from '../setup/dual-mode.mjs';

describeForEachMode('Enhanced Features for Queue Compatibility', (mode) => {
  let client;
  const tag = keyTag('enhanced');

  beforeEach(async () => {
    client = await createClient(mode);
    await client.connect();
    // Clear all databases to ensure clean state for each test
    await client.flushall();
  });

  afterEach(async () => {
    if (client) {
      await client.quit();
      client = null;
    }
  });

  describe('Enhanced defineCommand', () => {
    test('supports variadic arguments (ioredis style)', async () => {
      client.defineCommand('testCmd', {
        lua: 'return {KEYS[1], ARGV[1]}',
        numberOfKeys: 1,
      });

      const result = await client.testCmd('key1', 'arg1');
      assert.deepStrictEqual(result, ['key1', 'arg1']);
    });

    test('supports array arguments (BullMQ style)', async () => {
      client.defineCommand('testCmd', {
        lua: 'return {KEYS[1], ARGV[1]}',
        numberOfKeys: 1,
      });

      const result = await client.testCmd(['key1', 'arg1']);
      assert.deepStrictEqual(result, ['key1', 'arg1']);
    });

    test('returns empty array instead of null for empty results', async () => {
      client.defineCommand('emptyCmd', {
        lua: 'return {}',
        numberOfKeys: 0,
      });

      const result = await client.emptyCmd();
      assert.deepStrictEqual(result, []);
      assert.ok(result !== null);
    });

    test('handles complex argument types', async () => {
      client.defineCommand('complexCmd', {
        lua: 'return {KEYS[1], ARGV[1], ARGV[2]}',
        numberOfKeys: 1,
      });

      const result = await client.complexCmd('key1', { data: 'test' }, 42);
      assert.deepStrictEqual(result, ['key1', '{"data":"test"}', '42']);
    });
  });

  describe('Static createClient factory', () => {
    test('creates client type', async () => {
      const client = Redis.createClient('client', config);
      try {
        assert.ok(client instanceof Redis);
        assert.strictEqual(client.clientType, 'client');
      } finally {
        await client.disconnect();
      }
    });

    test('creates subscriber type', async () => {
      const subscriber = Redis.createClient('subscriber', config);
      try {
        assert.ok(subscriber instanceof Redis);
        assert.strictEqual(subscriber.clientType, 'subscriber');
      } finally {
        await subscriber.disconnect();
      }
    });

    test('creates bclient type with blocking ops enabled', async () => {
      const bclient = Redis.createClient('bclient', config);
      try {
        assert.ok(bclient instanceof Redis);
        assert.strictEqual(bclient.clientType, 'bclient');
        assert.strictEqual(bclient.enableBlockingOps, true);
      } finally {
        await bclient.disconnect();
      }
    });

    test('returns client immediately (Bull compatibility)', async () => {
      const start = Date.now();
      const client = Redis.createClient('client', config);
      const elapsed = Date.now() - start;

      try {
        assert.ok(client instanceof Redis);
        assert.ok(elapsed < 100); // Should return immediately
      } finally {
        await client.disconnect();
      }
    });
  });

  describe('Enhanced ZSET operations', () => {
    beforeEach(async () => {
      // Set up test data
      await client.zadd('testzset', 1, 'one', 2, 'two', 3, 'three', 4, 'four');
    });

    test('zrangebyscore basic functionality', async () => {
      const result = await client.zrangebyscore('testzset', 1, 3);
      assert.deepStrictEqual(result, ['one', 'two', 'three']);
    });

    test('zrangebyscore with WITHSCORES', async () => {
      const result = await client.zrangebyscore('testzset', 1, 2, 'WITHSCORES');
      assert.deepStrictEqual(result, ['one', '1', 'two', '2']);
    });

    test('zrangebyscore with LIMIT', async () => {
      const result = await client.zrangebyscore(
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
      const result = await client.zrevrangebyscore('testzset', 3, 1);
      assert.deepStrictEqual(result, ['three', 'two', 'one']);
    });

    test('zpopmin functionality', async () => {
      const result = await client.zpopmin('testzset', 2);
      assert.strictEqual(result.length, 4); // member, score, member, score
      assert.strictEqual(result[0], 'one');
      assert.strictEqual(result[1], '1');
    });

    test('zpopmax functionality', async () => {
      const result = await client.zpopmax('testzset', 1);
      assert.strictEqual(result.length, 2); // member, score
      assert.strictEqual(result[0], 'four');
      assert.strictEqual(result[1], '4');
    });
  });

  describe('Blocking operations', () => {
    test('brpoplpush with existing data', async () => {
      await client.lpush('source', 'item1', 'item2');

      const result = await client.brpoplpush('source', 'dest', 0.1);
      assert.strictEqual(result, 'item1');

      const destItems = await client.lrange('dest', 0, -1);
      assert.deepStrictEqual(destItems, ['item1']);
    });

    test('blpop with existing data', async () => {
      await client.lpush('testlist', 'item1');

      const result = await client.blpop('testlist', 0.1);
      assert.deepStrictEqual(result, ['testlist', 'item1']);
    });

    test('brpop with existing data', async () => {
      await client.lpush('testlist', 'item1', 'item2');

      const result = await client.brpop('testlist', 0.1);
      assert.deepStrictEqual(result, ['testlist', 'item1']);
    });
  });

  describe('Enhanced duplicate method', () => {
    test('preserves client type when duplicating', async () => {
      const original = Redis.createClient('bclient', config);
      let duplicated;
      try {
        duplicated = await original.duplicate();
        assert.strictEqual(duplicated.clientType, 'bclient');
      } finally {
        if (duplicated) {
          await duplicated.quit();
        }
        await original.quit();
      }
    });

    test('allows override options', async () => {
      const targetPort = process.env.REDIS_PORT
        ? Number(process.env.REDIS_PORT)
        : 6383;
      let duplicated;
      try {
        duplicated = await client.duplicate({ port: targetPort });
        assert.strictEqual(duplicated._options.port, targetPort);
      } finally {
        if (duplicated) {
          await duplicated.quit();
        }
      }
    });

    test('connects in background (Bull compatibility)', async () => {
      const start = Date.now();
      let duplicated;
      try {
        duplicated = await client.duplicate();
        const elapsed = Date.now() - start;

        assert.ok(duplicated instanceof Redis);
        assert.ok(elapsed < 100); // Should return immediately

        // Verify connection works
        await duplicated.ping();
      } finally {
        if (duplicated) {
          await duplicated.quit();
        }
      }
    });
  });
});
