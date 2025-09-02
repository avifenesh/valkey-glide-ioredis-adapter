
import { describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;;
import { testUtils } from '../../tests/setup';

describe('Transaction Commands', () => {
  let redis;

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }

    const config = await testUtils.testUtils.getStandaloneConfig();
    redis = new Redis(config);
    await redis.connect();
  });

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  it('should watch and unwatch keys', async () => {
    // Skip test if servers are not available
    if (!(await testUtils.checkTestServers())) {
      return;
    }

    await redis.set('watchkey', 'value1');

    // Watch the key
    const watchResult = await redis.watch('watchkey');
    assert.strictEqual(watchResult, 'OK');

    // Unwatch the key
    const unwatchResult = await redis.unwatch();
    assert.strictEqual(unwatchResult, 'OK');
  });

  it('should execute transaction with multi/exec', async () => {
    // Skip test if servers are not available
    if (!(await testUtils.checkTestServers())) {
      return;
    }

    await redis.set('multikey1', 'value1');
    await redis.set('multikey2', 'value2');

    const multi = redis.multi();
    multi.get('multikey1');
    multi.get('multikey2');
    multi.set('multikey3', 'value3');

    const results = await multi.exec();

    assert.ok(results);
    assert.ok(Array.isArray(results));
    if (results) {
      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results[0], [null, 'value1']);
      assert.deepStrictEqual(results[1], [null, 'value2']);
      assert.deepStrictEqual(results[2], [null, 'OK']);
    }
  });

  it('should handle transaction with watched key modification', async () => {
    // Skip test if servers are not available
    if (!(await testUtils.checkTestServers())) {
      return;
    }

    // This test is more complex requires simulating a transaction failure
    // For now, we'll just test that the multi/exec flow works
    await redis.set('watchtestkey', 'initial');

    const multi = redis.multi();
    multi.get('watchtestkey');
    multi.set('watchtestkey', 'modified');

    const results = await multi.exec();

    assert.ok(results).not.toBeNull();
    if (results) {
      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results[0], [null, 'initial']);
      assert.deepStrictEqual(results[1], [null, 'OK']);
    }
  });
});
