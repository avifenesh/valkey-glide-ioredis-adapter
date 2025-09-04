// Global test setup to ensure DB cleanup after each test across the suite
import { afterEach } from 'node:test';
import pkg from '../dist/index.js';
import { getStandaloneConfig, getClusterConfig } from './utils/test-config.mjs';

afterEach(async () => {
  // Optional diagnostics for hanging tests
  if (process.env.ADAPTER_DIAG_HANDLES === '1') {
    try {
      const handles = (process)._getActiveHandles?.() || [];
      const requests = (process)._getActiveRequests?.() || [];
      const summarize = (arr) => arr.map(h => (h && h.constructor ? h.constructor.name : typeof h));
      console.log('[diag] active handles:', summarize(handles));
      console.log('[diag] active requests:', summarize(requests));
    } catch {}
  }
  try {
    const { Redis, Cluster } = pkg;
    // Standalone cleanup with minimal fallback options
    try {
      const cfg = { ...getStandaloneConfig(), connectTimeout: 200, requestTimeout: 1000 };
      if (cfg && cfg.host) {
        const client = new Redis(cfg);
        try {
          await client.flushall();
        } catch {}
        try {
          await client.quit();
        } catch {}
        await new Promise(res => setTimeout(res, 20));
      }
    } catch {}

    // Cluster cleanup with minimal fallback options
    try {
      const nodes = getClusterConfig();
      if (Array.isArray(nodes) && nodes.length > 0) {
        const cluster = new Cluster(nodes, { connectTimeout: 200, requestTimeout: 1000 });
        try {
          await cluster.flushall();
        } catch {}
        try {
          await cluster.quit();
        } catch {}
        await new Promise(res => setTimeout(res, 20));
      }
    } catch {}
  } catch {}
});

// Final diagnostic snapshot before process exits
if (process.env.ADAPTER_DIAG_HANDLES === '1') {
  process.on('beforeExit', () => {
    try {
      const handles = (process)._getActiveHandles?.() || [];
      const requests = (process)._getActiveRequests?.() || [];
      const summarize = (arr) => arr.map(h => (h && h.constructor ? h.constructor.name : typeof h));
      console.log('[diag][beforeExit] active handles:', summarize(handles));
      console.log('[diag][beforeExit] active requests:', summarize(requests));
    } catch {}
  });
}
