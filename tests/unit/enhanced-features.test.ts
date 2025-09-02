/**
 * Enhanced Features Test Suite
 * Tests the new implementations for Bull/Bee-Queue compatibility
 */

import { Redis } from '../../src';
import { testUtils } from '../setup';

describe('Enhanced Features for Queue Compatibility', () => {
  let redis: Redis;
  let config: any;

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }

    config = await testUtils.getStandaloneConfig();
  });

  beforeEach(async () => {
    redis = new Redis(config);
    await redis.connect();
    // Clear all databases to ensure clean state for each test
    await redis.flushall();
  });

  afterEach(async () => {
    if (redis) {
      await redis.disconnect();
    }
  });

  describe('Enhanced defineCommand', () => {
    test('supports variadic arguments (ioredis style)', async () => {
      redis.defineCommand('testCmd', {
        lua: 'return {KEYS[1], ARGV[1]}',
        numberOfKeys: 1,
      });

      const result = await (redis as any).testCmd('key1', 'arg1');
      expect(result).toEqual(['key1', 'arg1']);
    });

    test('supports array arguments (BullMQ style)', async () => {
      redis.defineCommand('testCmd', {
        lua: 'return {KEYS[1], ARGV[1]}',
        numberOfKeys: 1,
      });

      const result = await (redis as any).testCmd(['key1', 'arg1']);
      expect(result).toEqual(['key1', 'arg1']);
    });

    test('returns empty array instead of null for empty results', async () => {
      redis.defineCommand('emptyCmd', {
        lua: 'return {}',
        numberOfKeys: 0,
      });

      const result = await (redis as any).emptyCmd();
      expect(result).toEqual([]);
      expect(result).not.toBeNull();
    });

    test('handles complex argument types', async () => {
      redis.defineCommand('complexCmd', {
        lua: 'return {KEYS[1], ARGV[1], ARGV[2]}',
        numberOfKeys: 1,
      });

      const result = await (redis as any).complexCmd(
        'key1',
        { data: 'test' },
        42
      );
      expect(result).toEqual(['key1', '{"data":"test"}', '42']);
    });
  });

  describe('Static createClient factory', () => {
    test('creates client type', () => {
      const client = Redis.createClient('client', config);
      expect(client).toBeInstanceOf(Redis);
      expect((client as any).clientType).toBe('client');
    });

    test('creates subscriber type', () => {
      const subscriber = Redis.createClient('subscriber', config);
      expect(subscriber).toBeInstanceOf(Redis);
      expect((subscriber as any).clientType).toBe('subscriber');
    });

    test('creates bclient type with blocking ops enabled', () => {
      const bclient = Redis.createClient('bclient', config);
      expect(bclient).toBeInstanceOf(Redis);
      expect((bclient as any).clientType).toBe('bclient');
      expect((bclient as any).enableBlockingOps).toBe(true);
    });

    test('returns client immediately (Bull compatibility)', () => {
      const start = Date.now();
      const client = Redis.createClient('client', config);
      const elapsed = Date.now() - start;

      expect(client).toBeInstanceOf(Redis);
      expect(elapsed).toBeLessThan(100); // Should return immediately
    });
  });

  describe('Enhanced ZSET operations', () => {
    beforeEach(async () => {
      // Set up test data
      await redis.zadd('testzset', 1, 'one', 2, 'two', 3, 'three', 4, 'four');
    });

    test('zrangebyscore basic functionality', async () => {
      const result = await redis.zrangebyscore('testzset', 1, 3);
      expect(result).toEqual(['one', 'two', 'three']);
    });

    test('zrangebyscore with WITHSCORES', async () => {
      const result = await redis.zrangebyscore('testzset', 1, 2, 'WITHSCORES');
      expect(result).toEqual(['one', '1', 'two', '2']);
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
      expect(result).toEqual(['two', 'three']);
    });

    test('zrevrangebyscore functionality', async () => {
      const result = await redis.zrevrangebyscore('testzset', 3, 1);
      expect(result).toEqual(['three', 'two', 'one']);
    });

    test('zpopmin functionality', async () => {
      const result = await redis.zpopmin('testzset', 2);
      expect(result).toHaveLength(4); // member, score, member, score
      expect(result[0]).toBe('one');
      expect(result[1]).toBe('1');
    });

    test('zpopmax functionality', async () => {
      const result = await redis.zpopmax('testzset', 1);
      expect(result).toHaveLength(2); // member, score
      expect(result[0]).toBe('four');
      expect(result[1]).toBe('4');
    });
  });

  describe('Blocking operations', () => {
    test('brpoplpush with existing data', async () => {
      await redis.lpush('source', 'item1', 'item2');

      const result = await redis.brpoplpush('source', 'dest', 1);
      expect(result).toBe('item1');

      const destItems = await redis.lrange('dest', 0, -1);
      expect(destItems).toEqual(['item1']);
    });

    test('brpoplpush timeout behavior', async () => {
      const startTime = Date.now();
      const result = await redis.brpoplpush('empty-source', 'dest', 1);
      const elapsed = Date.now() - startTime;

      expect(result).toBeNull();
      expect(elapsed).toBeGreaterThanOrEqual(900); // Allow some tolerance
      expect(elapsed).toBeLessThanOrEqual(1200);
    });

    test('blpop with existing data', async () => {
      await redis.lpush('testlist', 'item1');

      const result = await redis.blpop('testlist', 1);
      expect(result).toEqual(['testlist', 'item1']);
    });

    test('blpop timeout behavior', async () => {
      const result = await redis.blpop('empty-list', 1);
      expect(result).toBeNull();
    });

    test('brpop with existing data', async () => {
      await redis.lpush('testlist', 'item1', 'item2');

      const result = await redis.brpop('testlist', 1);
      expect(result).toEqual(['testlist', 'item1']);
    });
  });

  describe('Enhanced duplicate method', () => {
    test('preserves client type when duplicating', async () => {
      const original = Redis.createClient('bclient', config);
      const duplicated = await original.duplicate();

      expect((duplicated as any).clientType).toBe('bclient');
    });

    test('allows override options', async () => {
      const targetPort = process.env.REDIS_PORT
        ? Number(process.env.REDIS_PORT)
        : 6379;
      const duplicated = await redis.duplicate({ port: targetPort });
      expect((duplicated as any)._options.port).toBe(targetPort);
    });

    test('connects in background (Bull compatibility)', async () => {
      const start = Date.now();
      const duplicated = await redis.duplicate();
      const elapsed = Date.now() - start;

      expect(duplicated).toBeInstanceOf(Redis);
      expect(elapsed).toBeLessThan(100); // Should return immediately
    });
  });
});
