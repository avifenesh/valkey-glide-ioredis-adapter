/**
 * Clean Smoke Test - Using simplified test infrastructure
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';

// Import the module using the same pattern as existing tests
import pkg from '../../dist/index.js';
const { Redis, Cluster } = pkg;
import { describeForEachMode, createClient, keyTag} from '../setup/dual-mode.mjs';
import { getStandaloneConfig } from '../utils/test-config.mjs';

describeForEachMode('Clean Valkey Adapter Basic Functionality', mode => {
  const tag = keyTag('smoke');

  it('should create adapter instance with lazyConnect', async () => {
    const adapter = await createClient(mode, { lazyConnect: true });
    assert.ok(adapter instanceof (mode === 'cluster' ? Cluster : Redis));
    assert.strictEqual(adapter.status, 'disconnected');
  });

  it('should connect and execute commands', async () => {
    const client = await createClient(mode);
    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
    assert.strictEqual(client.status, 'ready');

    // Test basic string operation
    await client.set(`${tag}:test:key`, 'test:value');
    const result = await client.get(`${tag}:test:key`);
    assert.strictEqual(result, 'test:value');

    // Clean up test data
    await client.del(`${tag}:test:key`);
    await client.quit();
  });

  it('should work after connect', async () => {
    const config = getStandaloneConfig();
    const client = new Redis({ ...config, lazyConnect: true });
    await client.connect();

    await client.set(`${tag}:test:lazy:key`, 'test:lazy:value');
    const result = await client.get(`${tag}:test:lazy:key`);
    assert.strictEqual(result, 'test:lazy:value');

    // Clean up
    await client.del('test:lazy:key');
    await client.quit();
  });

  it('should handle hash commands with lazy connection', async () => {
    const config = getStandaloneConfig();
    const client = new Redis({ ...config, lazyConnect: true });

    // Should start disconnected
    assert.strictEqual(client.status, 'disconnected');

    // Hash operations should work with lazy connection
    await client.hset(
      `${tag}:test:hash`,
      'field1',
      'value1',
      'field2',
      'value2'
    );
    assert.strictEqual(client.status, 'ready');

    const value1 = await client.hget(`${tag}:test:hash`, 'field1');
    assert.strictEqual(value1, 'value1');

    const allFields = await client.hgetall(`${tag}:test:hash`);
    assert.deepStrictEqual(allFields, { field1: 'value1', field2: 'value2' });

    // Clean up
    await client.del(`${tag}:test:hash`);
    await client.quit();
  });
});
