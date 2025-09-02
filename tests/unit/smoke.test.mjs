/**
 * Basic smoke test for Redis
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('Redis Basic Functionality', () => {
  it('should create adapter instance', () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.ok(adapter instanceof Redis);
    assert.strictEqual(adapter.status, 'disconnected');
  });

  it('should create adapter with port and host', () => {
    const adapter = new Redis(6379, 'localhost', { lazyConnect: true });
    assert.ok(adapter instanceof Redis);
  });

  it('should create adapter with options object', () => {
    const adapter = new Redis({ port: 6379, host: 'localhost', lazyConnect: true });
    assert.ok(adapter instanceof Redis);
  });

  it('should parse redis URL', () => {
    const adapter = new Redis('redis://localhost:6379/0', { lazyConnect: true });
    assert.ok(adapter instanceof Redis);
  });

  it('should be an event emitter', () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.strictEqual(typeof adapter.on, 'function');
    assert.strictEqual(typeof adapter.emit, 'function');
  });
});
