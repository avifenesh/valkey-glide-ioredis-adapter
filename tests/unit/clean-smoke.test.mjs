/**
 * Clean Smoke Test - Using simplified test infrastructure
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { testUtils } from '../setup/clean-setup.mjs';

// Import the module using the same pattern as existing tests
import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('Clean Redis Basic Functionality', () => {
  after(async () => {
    await testUtils.cleanupTestClients();
  });

  it('should create adapter instance with lazyConnect', async () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.ok(adapter instanceof Redis);
    assert.strictEqual(adapter.status, 'disconnected');
  });

  it('should connect and execute commands', async () => {
    const client = await testUtils.createTestClient();
    await client.connect();
    assert.strictEqual(client.status, 'ready');
    
    // Test basic string operation
    await client.set('test:key', 'test:value');
    const result = await client.get('test:key');
    assert.strictEqual(result, 'test:value');
    
    // Clean up test data
    await client.del('test:key');
  });

  it('should work with lazy connection on first command', async () => {
    const config = testUtils.getStandaloneConfig();
    const client = new Redis({ ...config, lazyConnect: true });
    
    // Should start disconnected
    assert.strictEqual(client.status, 'disconnected');
    
    // First command should trigger connection
    await client.set('test:lazy:key', 'test:lazy:value');
    assert.strictEqual(client.status, 'ready');
    
    const result = await client.get('test:lazy:key');
    assert.strictEqual(result, 'test:lazy:value');
    
    // Clean up
    await client.del('test:lazy:key');
    await client.quit();
  });

  it('should handle hash commands with lazy connection', async () => {
    const config = testUtils.getStandaloneConfig();
    const client = new Redis({ ...config, lazyConnect: true });
    
    // Should start disconnected
    assert.strictEqual(client.status, 'disconnected');
    
    // Hash operations should work with lazy connection
    await client.hset('test:hash', 'field1', 'value1', 'field2', 'value2');
    assert.strictEqual(client.status, 'ready');
    
    const value1 = await client.hget('test:hash', 'field1');
    assert.strictEqual(value1, 'value1');
    
    const allFields = await client.hgetall('test:hash');
    assert.deepStrictEqual(allFields, { field1: 'value1', field2: 'value2' });
    
    // Clean up
    await client.del('test:hash');
    await client.quit();
  });
});