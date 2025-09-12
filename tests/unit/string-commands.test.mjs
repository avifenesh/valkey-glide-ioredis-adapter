/**
 * String Commands Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
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
import { delay } from '../utils/test-config.mjs';
import { describeForEachMode, createClient, flushAll } from '../setup/dual-mode.mjs';

describeForEachMode('String Commands (ioredis compatibility)', mode => {
  let client;

  beforeEach(async () => {
    client = await createClient(mode);
    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    await flushAll(client);
    await delay(50);
  });

  afterEach(async () => {
    if (client) {
      await client.quit();
    }
  });

  describe('GET and SET operations', () => {
    test('set and get should work with basic string values', async () => {
      // Basic SET/GET - most common pattern
      await client.set('foo', 'bar');
      assert.strictEqual(await client.get('foo'), 'bar');
    });

    test('get should return null for non-existent keys', async () => {
      assert.strictEqual(await client.get('nonexistent'), null);
    });

    test('set should overwrite existing values', async () => {
      await client.set('key', 'value1');
      await client.set('key', 'value2');
      assert.strictEqual(await client.get('key'), 'value2');
    });

    test('set with expiration using EX option', async () => {
      // ioredis pattern: redis.set('key', 'value', 'EX', 1)
      await client.set('foo', 'bar', 'EX', 1);
      assert.strictEqual(await client.get('foo'), 'bar');

      // Wait for expiration - increased delay for reliability
      await delay(1500);
      assert.strictEqual(await client.get('foo'), null);
    });

    test('set with expiration using PX option', async () => {
      // ioredis pattern: redis.set('key', 'value', 'PX', 500)
      await client.set('foo', 'bar', 'PX', 500);
      assert.strictEqual(await client.get('foo'), 'bar');

      await delay(600);
      assert.strictEqual(await client.get('foo'), null);
    });

    test('set with NX option (only if not exists)', async () => {
      // ioredis pattern: redis.set('key', 'value', 'NX')
      await client.set('foo', 'bar');
      const result = await client.set('foo', 'new_value', 'NX');
      assert.strictEqual(result, null); // Should fail because key exists
      assert.strictEqual(await client.get('foo'), 'bar'); // Value unchanged
    });

    test('set with XX option (only if exists)', async () => {
      // ioredis pattern: redis.set('key', 'value', 'XX')
      const result1 = await client.set('nonexistent', 'value', 'XX');
      assert.strictEqual(result1, null); // Should fail because key doesn't exist

      await client.set('existing', 'old_value');
      const result2 = await client.set('existing', 'new_value', 'XX');
      assert.strictEqual(result2, 'OK');
      assert.strictEqual(await client.get('existing'), 'new_value');
    });

    test('set with combined options EX and NX', async () => {
      // ioredis pattern: redis.set('key', 'value', 'EX', 60, 'NX')
      const result1 = await client.set('newkey', 'value', 'EX', 1, 'NX');
      assert.strictEqual(result1, 'OK');

      const result2 = await client.set('newkey', 'other', 'EX', 1, 'NX');
      assert.strictEqual(result2, null); // Should fail due to NX
    });
  });

  describe('MGET and MSET operations', () => {
    test('mset should set multiple keys at once', async () => {
      // ioredis variadic pattern: redis.mset('key1', 'val1', 'key2', 'val2')
      await client.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');

      assert.strictEqual(await client.get('key1'), 'val1');
      assert.strictEqual(await client.get('key2'), 'val2');
      assert.strictEqual(await client.get('key3'), 'val3');
    });

    test('mset should accept object format', async () => {
      // ioredis object pattern: redis.mset({key1: 'val1', key2: 'val2'})
      await client.mset({ key1: 'val1', key2: 'val2' });

      assert.strictEqual(await client.get('key1'), 'val1');
      assert.strictEqual(await client.get('key2'), 'val2');
    });

    test('mget should return multiple values', async () => {
      await client.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');

      // ioredis variadic pattern: redis.mget('key1', 'key2', 'key3')
      const result1 = await client.mget('key1', 'key2', 'key3');
      assert.deepStrictEqual(result1, ['val1', 'val2', 'val3']);

      // ioredis array pattern: redis.mget(['key1', 'key2', 'key3'])
      const result2 = await client.mget(['key1', 'key2', 'key3']);
      assert.deepStrictEqual(result2, ['val1', 'val2', 'val3']);
    });

    test('mget should return null for non-existent keys', async () => {
      await client.set('existing', 'value');
      const result = await client.mget(
        'existing',
        'nonexistent',
        'alsonothere'
      );
      assert.deepStrictEqual(result, ['value', null, null]);
    });
  });

  describe('Increment and Decrement operations', () => {
    test('incr should increment by 1', async () => {
      await client.set('counter', '10');
      const result = await client.incr('counter');
      assert.strictEqual(result, 11);
      assert.strictEqual(await client.get('counter'), '11');
    });

    test('incr should initialize to 1 for non-existent key', async () => {
      const result = await client.incr('newcounter');
      assert.strictEqual(result, 1);
    });

    test('incrby should increment by specified amount', async () => {
      await client.set('counter', '10');
      const result = await client.incrby('counter', 5);
      assert.strictEqual(result, 15);
    });

    test('decr should decrement by 1', async () => {
      await client.set('counter', '10');
      const result = await client.decr('counter');
      assert.strictEqual(result, 9);
    });

    test('decrby should decrement by specified amount', async () => {
      await client.set('counter', '10');
      const result = await client.decrby('counter', 3);
      assert.strictEqual(result, 7);
    });

    test('incrbyfloat should handle float values', async () => {
      await client.set('float_counter', '10.5');
      const result = await client.incrbyfloat('float_counter', 2.3);
      assert.strictEqual(result, 12.8);
    });
  });

  describe('String manipulation operations', () => {
    test('append should append to existing string', async () => {
      await client.set('mykey', 'Hello');
      const length = await client.append('mykey', ' World');
      assert.strictEqual(length, 11);
      assert.strictEqual(await client.get('mykey'), 'Hello World');
    });

    test('append should set value for non-existent key', async () => {
      const length = await client.append('newkey', 'Hello');
      assert.strictEqual(length, 5);
      assert.strictEqual(await client.get('newkey'), 'Hello');
    });

    test('strlen should return string length', async () => {
      await client.set('mykey', 'Hello World');
      const length = await client.strlen('mykey');
      assert.strictEqual(length, 11);
    });

    test('strlen should return 0 for non-existent key', async () => {
      const length = await client.strlen('nonexistent');
      assert.strictEqual(length, 0);
    });

    test('getrange should return substring', async () => {
      await client.set('mykey', 'Hello World');
      const substr = await client.getrange('mykey', 0, 4);
      assert.strictEqual(substr, 'Hello');
    });

    test('setrange should modify part of string', async () => {
      await client.set('mykey', 'Hello World');
      const length = await client.setrange('mykey', 6, 'Redis');
      assert.strictEqual(length, 11);
      assert.strictEqual(await client.get('mykey'), 'Hello Redis');
    });
  });

  describe('Advanced SET operations', () => {
    test('setex should set key with expiration', async () => {
      await client.setex('tempkey', 1, 'tempvalue');
      assert.strictEqual(await client.get('tempkey'), 'tempvalue');

      // Wait for expiration - increased delay for reliability
      await delay(1500);
      assert.strictEqual(await client.get('tempkey'), null);
    });

    test('setnx should set only if key does not exist', async () => {
      const result1 = await client.setnx('newkey', 'value1');
      assert.strictEqual(result1, 1); // Success

      const result2 = await client.setnx('newkey', 'value2');
      assert.strictEqual(result2, 0); // Failed because key exists

      assert.strictEqual(await client.get('newkey'), 'value1');
    });

    test('psetex should set key with millisecond expiration', async () => {
      await client.psetex('tempkey', 500, 'tempvalue');
      assert.strictEqual(await client.get('tempkey'), 'tempvalue');

      await delay(600);
      assert.strictEqual(await client.get('tempkey'), null);
    });
  });

  describe('Error handling', () => {
    test('incr should throw error for non-numeric value', async () => {
      await client.set('textkey', 'not_a_number');
      await assert.rejects(async () => {
        await client.incr('textkey');
      });
    });

    test('incrby should throw error for non-numeric value', async () => {
      await client.set('textkey', 'not_a_number');
      await assert.rejects(async () => {
        await client.incrby('textkey', 5);
      });
    });

    test('operations should handle large values', async () => {
      const largeValue = 'x'.repeat(10000);
      await client.set('largekey', largeValue);
      assert.strictEqual(await client.get('largekey'), largeValue);
    });
  });
});
