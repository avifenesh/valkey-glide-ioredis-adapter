// Global test setup to ensure DB cleanup after each test across the suite
// Minimal global setup; only optional diagnostics when ADAPTER_DIAG_HANDLES=1
import { afterEach } from 'node:test';
import { Socket as NetSocket } from 'node:net';

// No-op afterEach to keep file valid; actual diagnostics only on beforeExit
afterEach(() => {});

if (process.env.ADAPTER_DIAG_HANDLES === '1') {
  process.on('beforeExit', () => {
    try {
      const handles = (process)._getActiveHandles?.() || [];
      const requests = (process)._getActiveRequests?.() || [];

      const summarize = (h) => {
        if (h instanceof NetSocket) {
          return {
            type: 'Socket',
            local: `${h.localAddress}:${h.localPort}`,
            remote: `${h.remoteAddress}:${h.remotePort}`,
            connecting: !!h.connecting,
            destroyed: !!h.destroyed,
            readable: !!h.readable,
            writable: !!h.writable,
          };
        }
        // Fallback to constructor name
        return { type: h && h.constructor ? h.constructor.name : typeof h };
      };

      console.log('[diag][beforeExit] active handles:', handles.map(summarize));
      console.log('[diag][beforeExit] active requests:', requests.map(r => r && r.constructor ? r.constructor.name : typeof r));
    } catch {}
  });
}
