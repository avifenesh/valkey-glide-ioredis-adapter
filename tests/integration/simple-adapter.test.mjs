/**
 * Simple Integration Test - Basic Adapter Functionality
 * Tests that our ioredis adapter can connect and perform basic operations
 */

import { describe, test, beforeEach, afterEach, before } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig, checkTestServers } from '../utils/test-config.mjs';

describe('Simple Adapter Integration Test', () => {
  let adapter;
  let keyPrefix;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
  });

  beforeEach(async () => {
    // Health check before each test
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers became unavailable during test execution');
    }

    const config = await getStandaloneConfig();
    adapter = new Redis(config);
    await adapter.connect();

    // Use a per-test key prefix to avoid cross-test interference
    keyPrefix = `test:${Date.now()}:${Math.random().toString(36).slice(2)}:`;
  });

  afterEach(async () => {
    if (adapter) {
      try {
        // Clean up only keys created in this test using SCAN
        if (keyPrefix) {
          let cursor = '0';
          const keys = [];
          do {
            const res = await adapter.scan(cursor, 'MATCH', `${keyPrefix}*`, 'COUNT', 200);
            cursor = Array.isArray(res) ? res[0] : '0';
            const batch = Array.isArray(res) ? res[1] : [];
            if (Array.isArray(batch) && batch.length) keys.push(...batch);
          } while (cursor !== '0');

          if (keys.length > 0) {
            await adapter.del(...keys);
          }
        }
      } catch {
        // Ignore cleanup errors
      }
      await adapter.disconnect();
    }
  });

  test('should connect and ping successfully', async () => {
    const result = await adapter.ping();
    assert.strictEqual(result, 'PONG');
  });

  test('should perform basic string operations', async () => {
    // Set a value
    await adapter.set(`${keyPrefix}key1`, 'Hello World');

    // Get the value
    const value = await adapter.get(`${keyPrefix}key1`);
    assert.strictEqual(value, 'Hello World');

    // Check existence
    const exists = await adapter.exists(`${keyPrefix}key1`);
    assert.strictEqual(exists, 1);
  });

  test('should handle multiple operations', async () => {
    // Set multiple values
    await adapter.mset({
      [`${keyPrefix}key1`]: 'value1',
      [`${keyPrefix}key2`]: 'value2',
      [`${keyPrefix}key3`]: 'value3',
    });

    // Get multiple values
    const values = await adapter.mget([
      `${keyPrefix}key1`,
      `${keyPrefix}key2`,
      `${keyPrefix}key3`,
    ]);
    assert.deepStrictEqual(values, ['value1', 'value2', 'value3']);
  });

  test('should work with hash operations', async () => {
    // Set hash values
    await adapter.hset(`${keyPrefix}hash`, {
      field1: 'value1',
      field2: 'value2',
    });

    // Get hash value
    const value = await adapter.hget(`${keyPrefix}hash`, 'field1');
    assert.strictEqual(value, 'value1');

    // Get all hash values
    const allValues = await adapter.hgetall(`${keyPrefix}hash`);
    assert.deepStrictEqual(allValues, {
      field1: 'value1',
      field2: 'value2',
    });
  });

  test('should work with list operations', async () => {
    // Push values to list
    await adapter.lpush(`${keyPrefix}list`, ['item1', 'item2', 'item3']);

    // Get list length
    const length = await adapter.llen(`${keyPrefix}list`);
    assert.strictEqual(length, 3);

    // Get list range
    const items = await adapter.lrange(`${keyPrefix}list`, 0, -1);
    assert.deepStrictEqual(items, ['item3', 'item2', 'item1']); // Note reverses order
  });

  test('should work with keys pattern matching', async () => {
    // Set some test keys
    await adapter.set(`${keyPrefix}user:1`, 'user1');
    await adapter.set(`${keyPrefix}user:2`, 'user2');
    await adapter.set(`${keyPrefix}other:1`, 'other1');

    // Find keys with pattern
    const userKeys = await adapter.keys(`${keyPrefix}user:*`);
    assert.deepStrictEqual(
      userKeys.sort(),
      [`${keyPrefix}user:1`, `${keyPrefix}user:2`]
    );
  });
});
