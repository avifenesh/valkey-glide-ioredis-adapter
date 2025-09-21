/**
 * Basic smoke test for Redis
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { describeForEachMode, createClient } from '../setup/dual-mode.mjs';

describeForEachMode('Adapter Basic Functionality', mode => {
  test('should create adapter instance (lazy)', async () => {
    const adapter = await createClient(mode);
    assert.ok(adapter);
    // should be disconnected before connect
    assert.strictEqual(adapter.status, 'disconnected');
  });

  test('should be an event emitter', async () => {
    const adapter = await createClient(mode);
    assert.strictEqual(typeof adapter.on, 'function');
    assert.strictEqual(typeof adapter.emit, 'function');
    assert.strictEqual(typeof adapter.removeListener, 'function');
  });

  test('should expose key command methods', async () => {
    const adapter = await createClient(mode);
    assert.strictEqual(typeof adapter.get, 'function');
    assert.strictEqual(typeof adapter.set, 'function');
    assert.strictEqual(typeof adapter.del, 'function');
    assert.strictEqual(typeof adapter.exists, 'function');
  });

  test('should support pipeline/multi creation', async () => {
    const adapter = await createClient(mode);
    const pipeline = adapter.pipeline();
    const multi = adapter.multi();
    assert.ok(pipeline && typeof pipeline.exec === 'function');
    assert.ok(multi && typeof multi.exec === 'function');
  });
});
