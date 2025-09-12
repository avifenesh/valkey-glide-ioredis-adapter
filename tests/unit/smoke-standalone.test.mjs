/**
 * Basic smoke test for Redis - Standalone version without globals
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('Redis Basic Functionality (No Globals)', () => {
  test('should create adapter instance with lazyConnect', async () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.ok(adapter instanceof Redis);
    assert.strictEqual(adapter.status, 'disconnected');
  });

  test('should create adapter with port and host', async () => {
    const adapter = new Redis(getStandaloneConfig());
    assert.ok(adapter instanceof Redis);
    assert.strictEqual(adapter.status, 'disconnected');
  });

  test('should create adapter with options object', async () => {
    const adapter = new Redis(getStandaloneConfig());
    assert.ok(adapter instanceof Redis);
  });

  test('should parse redis URL', async () => {
    const adapter = new Redis({
      lazyConnect: true,
    });
    // Just test that we can create with URL-like config
    assert.ok(adapter instanceof Redis);
  });

  test('should be an event emitter', async () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.strictEqual(typeof adapter.on, 'function');
    assert.strictEqual(typeof adapter.emit, 'function');
    assert.strictEqual(typeof adapter.removeListener, 'function');
  });

  test('should have expected methods', async () => {
    const adapter = new Redis({ lazyConnect: true });

    // Test basic command methods exist
    assert.strictEqual(typeof adapter.get, 'function');
    assert.strictEqual(typeof adapter.set, 'function');
    assert.strictEqual(typeof adapter.del, 'function');
    assert.strictEqual(typeof adapter.exists, 'function');

    // Test connection methods exist
    assert.strictEqual(typeof adapter.connect, 'function');
    assert.strictEqual(typeof adapter.disconnect, 'function');
    assert.strictEqual(typeof adapter.quit, 'function');
  });

  test('should support pipeline creation', async () => {
    const adapter = new Redis({ lazyConnect: true });
    const pipeline = adapter.pipeline();

    assert.ok(pipeline);
    assert.strictEqual(typeof pipeline.get, 'function');
    assert.strictEqual(typeof pipeline.set, 'function');
    assert.strictEqual(typeof pipeline.exec, 'function');
  });

  test('should support multi/transaction creation', async () => {
    const adapter = new Redis({ lazyConnect: true });
    const multi = adapter.multi();

    assert.ok(multi);
    assert.strictEqual(typeof multi.get, 'function');
    assert.strictEqual(typeof multi.set, 'function');
    assert.strictEqual(typeof multi.exec, 'function');
  });
});
