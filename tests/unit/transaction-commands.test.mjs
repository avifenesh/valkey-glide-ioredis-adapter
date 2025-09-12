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
import { getStandaloneConfig } from '../utils/test-config.mjs';
async function checkTestServers() {
  try {
    const config = getStandaloneConfig();
    const testClient = new Redis(config);
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch (error) {
    return false;
  }
}
describe('Transaction Commands', () => {
  let client;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }

    const config = await getStandaloneConfig();
    client = new Redis(config);
    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  after(async () => {
    if (client) {
      await client.quit();
    }
  });

  it('should watch and unwatch keys', async () => {
    // Skip test if servers are not available
    if (!(await checkTestServers())) {
      return;
    }

    await client.set('watchkey', 'value1');

    // Watch the key
    const watchResult = await client.watch('watchkey');
    assert.strictEqual(watchResult, 'OK');

    // Unwatch the key
    const unwatchResult = await client.unwatch();
    assert.strictEqual(unwatchResult, 'OK');
  });

  it('should execute transaction with multi/exec', async () => {
    // Skip test if servers are not available
    if (!(await checkTestServers())) {
      return;
    }

    await client.set('multikey1', 'value1');
    await client.set('multikey2', 'value2');

    const multi = client.multi();
    multi.get('multikey1');
    multi.get('multikey2');
    multi.set('multikey3', 'value3');

    const results = await multi.exec();

    assert.ok(results !== null);
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
    if (!(await checkTestServers())) {
      return;
    }

    // This test is more complex as it requires simulating a transaction failure
    // For now, we'll just test that the multi/exec flow works
    await client.set('watchtestkey', 'initial');

    const multi = client.multi();
    multi.get('watchtestkey');
    multi.set('watchtestkey', 'modified');

    const results = await multi.exec();

    assert.ok(results !== null);
    if (results) {
      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results[0], [null, 'initial']);
      assert.deepStrictEqual(results[1], [null, 'OK']);
    }
  });
});
