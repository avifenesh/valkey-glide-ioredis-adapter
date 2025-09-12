import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

/**
 * Dual-Mode String Commands Test
 * Tests string operations in both standalone and cluster modes
 * Example of how to convert existing tests to dual-mode testing
 */

import pkg from '../../dist/index.js';
const { Redis, Cluster } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

function getClusterConfig() {
  return [
    { host: 'localhost', port: 17000 },
    { host: 'localhost', port: 17001 },
    { host: 'localhost', port: 17002 },
  ];
}

// Test modes to run
const testModes = [
  {
    name: 'standalone',
    createClient: () => new Redis(getStandaloneConfig()),
  },
];

// Add cluster tests by default (unless explicitly disabled)
// This ensures feature parity between standalone and cluster
if (process.env.DISABLE_CLUSTER_TESTS !== 'true') {
  testModes.push({
    name: 'cluster',
    createClient: () => new Cluster(getClusterConfig(), { lazyConnect: true }),
  });
}

testModes.forEach(({ name: mode, createClient }) => {
  describe(`String Commands (${mode} mode)`, () => {
    describe('Basic String Operations', () => {
      let client;

      beforeEach(async () => {
        client = createClient();
        await client.connect();

        // Clean slate: flush all data to prevent test pollution
        // GLIDE's flushall is multislot safe
        try {
          await client.flushall();
        } catch (error) {
          console.warn('Warning: Could not flush database:', error.message);
        }
      });

      afterEach(async () => {
        if (client) {
          await client.quit();
        }
      });

      it('should set and get string values', async () => {
        const key = `test:${mode}:${Date.now()}`;
        const value = `hello-${mode}`;

        await client.set(key, value);
        const result = await client.get(key);

        assert.strictEqual(result, value);
      });

      it('should handle SET with expiration', async () => {
        const key = `test:expire:${mode}:${Date.now()}`;
        const value = `expire-${mode}`;

        await client.setex(key, 1, value);
        const result = await client.get(key);
        assert.strictEqual(result, value);

        const ttl = await client.ttl(key);
        assert.ok(ttl > 0);
      });

      it('should increment and decrement counters', async () => {
        const key = `test:counter:${mode}:${Date.now()}`;

        await client.set(key, '10');

        const incr1 = await client.incr(key);
        assert.strictEqual(incr1, 11);

        const decr1 = await client.decr(key);
        assert.strictEqual(decr1, 10);

        const incrBy = await client.incrby(key, 5);
        assert.strictEqual(incrBy, 15);
      });

      it('should handle multiple key operations', async () => {
        const keys = [
          `test:multi1:${mode}:${Date.now()}`,
          `test:multi2:${mode}:${Date.now()}`,
          `test:multi3:${mode}:${Date.now()}`,
        ];
        const values = ['value1', 'value2', 'value3'];

        // MSET - set multiple keys
        await client.mset(
          keys[0],
          values[0],
          keys[1],
          values[1],
          keys[2],
          values[2]
        );

        // MGET - get multiple keys
        const results = await client.mget(keys);
        assert.deepStrictEqual(results, values);
      });

      it('should handle conditional operations', async () => {
        const key = `test:conditional:${mode}:${Date.now()}`;

        // SETNX - set if not exists (should succeed)
        const result1 = await client.setnx(key, 'first');
        assert.strictEqual(result1, 1);

        // SETNX - set if not exists (should fail)
        const result2 = await client.setnx(key, 'second');
        assert.strictEqual(result2, 0);

        // Value should still be 'first'
        const value = await client.get(key);
        assert.strictEqual(value, 'first');
      });
    });

    describe('Advanced String Operations', () => {
      let client;

      beforeEach(async () => {
        client = createClient();
        await client.connect();

        // Clean slate: flush all data to prevent test pollution
        // GLIDE's flushall is multislot safe
        try {
          await client.flushall();
        } catch (error) {
          console.warn('Warning: Could not flush database:', error.message);
        }
      });

      afterEach(async () => {
        if (client) {
          await client.quit();
        }
      });

      it('should handle string ranges and manipulation', async () => {
        const key = `test:range:${mode}:${Date.now()}`;
        const value = 'Hello World';

        await client.set(key, value);

        // GETRANGE
        const range = await client.getrange(key, 0, 4);
        assert.strictEqual(range, 'Hello');

        // SETRANGE
        await client.setrange(key, 6, 'Redis');
        const modified = await client.get(key);
        assert.strictEqual(modified, 'Hello Redis');
      });

      it('should handle bit operations', async () => {
        const key = `test:bits:${mode}:${Date.now()}`;

        // Set some bits
        await client.setbit(key, 0, 1);
        await client.setbit(key, 2, 1);

        // Get bits
        const bit0 = await client.getbit(key, 0);
        const bit1 = await client.getbit(key, 1);
        const bit2 = await client.getbit(key, 2);

        assert.strictEqual(bit0, 1);
        assert.strictEqual(bit1, 0);
        assert.strictEqual(bit2, 1);
      });
    });
  });
});
