/**
 * Basic smoke test for Redis
 */

import { describe, it, test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('Redis Basic Functionality', () => {
  test('should create adapter instance', async () => {
    const adapter = new Redis();
    assert.ok(adapter instanceof Redis);
    assert.strictEqual(adapter.status, 'disconnected');
  });

  test('should create adapter with port and host', async () => {
    const adapter = new Redis(parseInt(process.env.VALKEY_PORT || "6383"), 'localhost');
    assert.ok(adapter instanceof Redis);
  });

  test('should create adapter with options object', async () => {
    const adapter = new Redis({ port: parseInt(process.env.VALKEY_PORT || "6383"), host: 'localhost' });
    assert.ok(adapter instanceof Redis);
  });

  test('should parse redis URL', async () => {
    const adapter = new Redis(`redis://localhost:${process.env.VALKEY_PORT || "6383"}/0`);
    assert.ok(adapter instanceof Redis);
  });

  test('should be an event emitter', async () => {
    const adapter = new Redis();
    assert.strictEqual(typeof adapter.on, 'function');
    assert.strictEqual(typeof adapter.emit, 'function');
  });
});
