import { describe, it, beforeEach, afterEach, before } from 'node:test';
import assert from 'node:assert';

// Global declarations for Node.js built-in APIs
/* global setTimeout */

/**
 * String Commands Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */

import pkg from '../../dist/index.js';
import { testUtils } from '../setup/index.mjs';
const { Redis  } = pkg;

describe('String Commands (ioredis compatibility)', () => {
  let redis;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
  });

  beforeEach(async () => {
    // Health check before each test
    const serversAvailable = testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers became unavailable during test execution');
    }

    // Use test server configuration
    const config = testUtils.getStandaloneConfig();
    redis = new Redis(config);
    await redis.connect();

    // Clean up any existing test data
    try {
      await redis.del(
        'foo',
        'key',
        'newkey',
        'key1',
        'key2',
        'key3',
        'counter',
        'newcounter',
        'float_counter',
        'mykey',
        'largekey',
        'tempkey',
        'textkey',
        'nonexistent',
        'existing',
        'newkey',
        'number',
        'text'
      );
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    if (redis) {
      if (redis) {
      await redis.quit();
    }
    }
  });

  describe('GET and SET operations', () => {
    it('set and get should work with basic string values', async () => {
      // Basic SET/GET - most common pattern
      await redis.set('foo', 'bar');
      assert.strictEqual(await redis.get('foo'), 'bar');
    });

    it('get should return null for non-existent keys', async () => {
      assert.strictEqual(await redis.get('nonexistent'), null);
    });

    it('set should overwrite existing values', async () => {
      await redis.set('key', 'value1');
      await redis.set('key', 'value2');
      assert.strictEqual(await redis.get('key'), 'value2');
    });

    it('set with expiration using EX option', async () => {
      // ioredis pattern.set('key', 'value', 'EX', 1)
      await redis.set('foo', 'bar', 'EX', 1);
      assert.strictEqual(await redis.get('foo'), 'bar');

      // Wait for expiration - increased delay for reliability
      await new Promise(resolve => setTimeout(resolve, 1500));
      assert.strictEqual(await redis.get('foo'), null);
    });

    it('set with expiration using PX option', async () => {
      // ioredis pattern.set('key', 'value', 'PX', 500)
      await redis.set('foo', 'bar', 'PX', 500);
      assert.strictEqual(await redis.get('foo'), 'bar');

      await new Promise(resolve => setTimeout(resolve, 600));
      assert.strictEqual(await redis.get('foo'), null);
    });

    it('set with NX option (only if not exists)', async () => {
      // ioredis pattern.set('key', 'value', 'NX')
      await redis.set('foo', 'bar');
      const result = await redis.set('foo', 'new_value', 'NX');
      assert.strictEqual(result, null); // Should fail because key exists
      assert.strictEqual(await redis.get('foo'), 'bar'); // Value unchanged
    });

    it('set with XX option (only if exists)', async () => {
      // ioredis pattern.set('key', 'value', 'XX')
      const result1 = await redis.set('nonexistent', 'value', 'XX');
      assert.strictEqual(result1, null); // Should fail because key doesn't exist

      await redis.set('existing', 'old_value');
      const result2 = await redis.set('existing', 'new_value', 'XX');
      assert.strictEqual(result2, 'OK');
      assert.strictEqual(await redis.get('existing'), 'new_value');
    });

    it('set with combined options EX and NX', async () => {
      // ioredis pattern.set('key', 'value', 'EX', 60, 'NX')
      const result1 = await redis.set('newkey', 'value', 'EX', 1, 'NX');
      assert.strictEqual(result1, 'OK');

      const result2 = await redis.set('newkey', 'other', 'EX', 1, 'NX');
      assert.strictEqual(result2, null); // Should fail due to NX
    });
  });

  describe('MGET and MSET operations', () => {
    it('mset should set multiple keys at once', async () => {
      // ioredis variadic pattern.mset('key1', 'val1', 'key2', 'val2')
      await redis.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');

      assert.strictEqual(await redis.get('key1'), 'val1');
      assert.strictEqual(await redis.get('key2'), 'val2');
      assert.strictEqual(await redis.get('key3'), 'val3');
    });

    it('mset should accept object format', async () => {
      // ioredis object pattern.mset({key1: 'val1', key2: 'val2'})
      await redis.mset({ key1: 'val1', key2: 'val2' });

      assert.strictEqual(await redis.get('key1'), 'val1');
      assert.strictEqual(await redis.get('key2'), 'val2');
    });

    it('mget should return multiple values', async () => {
      await redis.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');

      // ioredis variadic pattern.mget('key1', 'key2', 'key3')
      const result1 = await redis.mget('key1', 'key2', 'key3');
      assert.deepStrictEqual(result1, ['val1', 'val2', 'val3']);

      // ioredis array pattern.mget(['key1', 'key2', 'key3'])
      const result2 = await redis.mget(['key1', 'key2', 'key3']);
      assert.deepStrictEqual(result2, ['val1', 'val2', 'val3']);
    });

    it('mget should return null for non-existent keys', async () => {
      await redis.set('existing', 'value');
      const result = await redis.mget('existing', 'nonexistent', 'alsonothere');
      assert.deepStrictEqual(result, ['value', null, null]);
    });
  });

  describe('Increment and Decrement operations', () => {
    it('incr should increment by 1', async () => {
      await redis.set('counter', '10');
      const result = await redis.incr('counter');
      assert.strictEqual(result, 11);
      assert.strictEqual(await redis.get('counter'), '11');
    });

    it('incr should initialize to 1 for non-existent key', async () => {
      const result = await redis.incr('newcounter');
      assert.strictEqual(result, 1);
    });

    it('incrby should increment by specified amount', async () => {
      await redis.set('counter', '10');
      const result = await redis.incrby('counter', 5);
      assert.strictEqual(result, 15);
    });

    it('decr should decrement by 1', async () => {
      await redis.set('counter', '10');
      const result = await redis.decr('counter');
      assert.strictEqual(result, 9);
    });

    it('decrby should decrement by specified amount', async () => {
      await redis.set('counter', '10');
      const result = await redis.decrby('counter', 3);
      assert.strictEqual(result, 7);
    });

    it('incrbyfloat should handle float values', async () => {
      await redis.set('float_counter', '10.5');
      const result = await redis.incrbyfloat('float_counter', 2.3);
      assert.strictEqual(result, 12.8);
    });
  });

  describe('String manipulation operations', () => {
    it('append should append to existing string', async () => {
      await redis.set('mykey', 'Hello');
      const length = await redis.append('mykey', ' World');
      assert.strictEqual(length, 11);
      assert.strictEqual(await redis.get('mykey'), 'Hello World');
    });

    it('append should set value for non-existent key', async () => {
      const length = await redis.append('newkey', 'Hello');
      assert.strictEqual(length, 5);
      assert.strictEqual(await redis.get('newkey'), 'Hello');
    });

    it('strlen should return string length', async () => {
      await redis.set('mykey', 'Hello World');
      const length = await redis.strlen('mykey');
      assert.strictEqual(length, 11);
    });

    it('strlen should return 0 for non-existent key', async () => {
      const length = await redis.strlen('nonexistent');
      assert.strictEqual(length, 0);
    });

    it('getrange should return substring', async () => {
      await redis.set('mykey', 'Hello World');
      const substr = await redis.getrange('mykey', 0, 4);
      assert.strictEqual(substr, 'Hello');
    });

    it('setrange should modify part of string', async () => {
      await redis.set('mykey', 'Hello World');
      const length = await redis.setrange('mykey', 6, 'Redis');
      assert.strictEqual(length, 11);
      assert.strictEqual(await redis.get('mykey'), 'Hello Redis');
    });
  });

  describe('Advanced SET operations', () => {
    it('setex should set key with expiration', async () => {
      await redis.setex('tempkey', 1, 'tempvalue');
      assert.strictEqual(await redis.get('tempkey'), 'tempvalue');

      // Wait for expiration - increased delay for reliability
      await new Promise(resolve => setTimeout(resolve, 1500));
      assert.strictEqual(await redis.get('tempkey'), null);
    });

    it('setnx should set only if key does not exist', async () => {
      const result1 = await redis.setnx('newkey', 'value1');
      assert.strictEqual(result1, 1); // Success

      const result2 = await redis.setnx('newkey', 'value2');
      assert.strictEqual(result2, 0); // Failed because key exists

      assert.strictEqual(await redis.get('newkey'), 'value1');
    });

    it('psetex should set key with millisecond expiration', async () => {
      await redis.psetex('tempkey', 500, 'tempvalue');
      assert.strictEqual(await redis.get('tempkey'), 'tempvalue');

      await new Promise(resolve => setTimeout(resolve, 600));
      assert.strictEqual(await redis.get('tempkey'), null);
    });
  });

  describe('Error handling', () => {
    it('incr should throw error for non-numeric value', async () => {
      await redis.set('textkey', 'not_a_number');
      await assert.rejects(redis.incr('textkey'));
    });

    it('incrby should throw error for non-numeric value', async () => {
      await redis.set('textkey', 'not_a_number');
      await assert.rejects(redis.incrby('textkey', 5));
    });

    it('operations should handle large values', async () => {
      const largeValue = 'x'.repeat(10000);
      await redis.set('largekey', largeValue);
      assert.strictEqual(await redis.get('largekey'), largeValue);
    });
  });
});
