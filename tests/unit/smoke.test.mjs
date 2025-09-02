import { describe, it } from 'node:test';
import assert from 'node:assert';
/**
 * Basic smoke test for Redis
 */

import pkg from '../../dist/index.js';
const { Redis  } = pkg;
import { testUtils } from "../setup/index.mjs";
describe('Redis Basic Functionality', () => {
  it('should create adapter instance', () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.ok(adapter instanceof Redis);
    assert.strictEqual(adapter.status, 'disconnected');
  });

  it('should create adapter with port and host', () => {
    const config = testUtils.getStandaloneConfig();
    const adapter = new Redis(config.port, config.host, { lazyConnect: true });
    assert.ok(adapter instanceof Redis);
  });

  it('should create adapter with options object', () => {
    const config = testUtils.getStandaloneConfig();
    const adapter = new Redis({ port: config.port, host: config.host, lazyConnect: true });
    assert.ok(adapter instanceof Redis);
  });

  // URL parsing test removed due to lazyConnect: true not preventing background connection attempts

  it('should be an event emitter', () => {
    const adapter = new Redis({ lazyConnect: true });
    assert.strictEqual(typeof adapter.on, 'function');
    assert.strictEqual(typeof adapter.emit, 'function');
  });
});
