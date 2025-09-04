// Global test setup to ensure DB cleanup after each test across the suite
import { afterEach } from 'node:test';
import pkg from '../dist/index.js';
import { getStandaloneConfig, getClusterConfig } from './utils/test-config.mjs';

// Global cleanup connection pool to reuse connections
let globalCleanupClient = null;
let globalClusterClient = null;

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
  // Temporarily disable global cleanup to isolate hanging issue
  // TODO: Re-enable once connection cleanup is fixed
});

// Final cleanup when process exits - use exit instead of beforeExit for sync cleanup
process.on('exit', (code) => {
  // Synchronous cleanup only
  try {
    if (globalCleanupClient) {
      globalCleanupClient = null;
    }
    if (globalClusterClient) {
      globalClusterClient = null;
    }
  } catch {}
});

// Handle SIGINT and SIGTERM for graceful shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, async () => {
    try {
      // Clean up global clients
      if (globalCleanupClient) {
        try {
          await globalCleanupClient.quit();
          if (globalCleanupClient.disconnect) {
            await globalCleanupClient.disconnect();
          }
        } catch {}
        globalCleanupClient = null;
      }
      
      if (globalClusterClient) {
        try {
          await globalClusterClient.quit();
          if (globalClusterClient.disconnect) {
            await globalClusterClient.disconnect();
          }
        } catch {}
        globalClusterClient = null;
      }
      
      // Allow time for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch {}
    
    process.exit(0);
  });
});

// Diagnostic snapshot before process exits
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
