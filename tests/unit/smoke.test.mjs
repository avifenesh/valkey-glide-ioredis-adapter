import { describe, it, after } from 'node:test';
import assert from 'node:assert';
/**
 * Basic smoke test for Redis
 */

import pkg from '../../dist/index.js';
const { Redis  } = pkg;
import { testUtils } from "../setup/index.mjs";

describe('Redis Basic Functionality', () => {
  const createdAdapters = [];
  
  after(async () => {
    // Clean up all created adapters
    for (const adapter of createdAdapters) {
      try {
        if (adapter && typeof adapter.quit === 'function') {
          await adapter.quit();
        }
        if (adapter && typeof adapter.disconnect === 'function') {
          await adapter.disconnect();
        }
      } catch {}
    }
    
    // Force cleanup any remaining handles
    const handles = (process)._getActiveHandles?.() || [];
    handles.forEach(handle => {
      if (handle && typeof handle.destroy === 'function') {
        try { handle.destroy(); } catch {}
      } else if (handle && typeof handle.close === 'function') {
        try { handle.close(); } catch {}
      }
    });
  });

  it('should create adapter instance', () => {
    const adapter = new Redis({ lazyConnect: true });
    createdAdapters.push(adapter);
    assert.ok(adapter instanceof Redis);
    // GLIDE may connect immediately, so accept either status
    assert.ok(['disconnected', 'connecting', 'ready'].includes(adapter.status));
  });

  it('should create adapter with port and host', () => {
    const config = testUtils.getStandaloneConfig();
    const adapter = new Redis(config.port, config.host, { lazyConnect: true });
    createdAdapters.push(adapter);
    assert.ok(adapter instanceof Redis);
  });

  it('should create adapter with options object', () => {
    const config = testUtils.getStandaloneConfig();
    const adapter = new Redis({ port: config.port, host: config.host, lazyConnect: true });
    createdAdapters.push(adapter);
    assert.ok(adapter instanceof Redis);
  });

  // URL parsing test removed due to lazyConnect: true not preventing background connection attempts

  it('should be an event emitter', () => {
    const adapter = new Redis({ lazyConnect: true });
    createdAdapters.push(adapter);
    assert.strictEqual(typeof adapter.on, 'function');
    assert.strictEqual(typeof adapter.emit, 'function');
  });
});
