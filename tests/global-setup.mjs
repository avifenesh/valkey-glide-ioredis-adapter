// Global test setup to ensure DB cleanup after each test across the suite
// Minimal global setup — no diagnostics or process hooks
import { after } from 'node:test';

// Global cleanup to ensure all connections are closed after tests
after(async () => {
  // Import Redis dynamically to avoid circular dependencies
  try {
    const pkg = await import('../dist/index.js');
    const { Redis } = pkg;

    if (Redis.forceCloseAllClients) {
      // Force close all clients with a timeout
      await Promise.race([
        Redis.forceCloseAllClients(500),
        new Promise(resolve => {
          const t = setTimeout(resolve, 1000);
          if (typeof t.unref === 'function') t.unref();
        }),
      ]);
    }
  } catch (error) {
    // Ignore errors during cleanup
  }

  // Force unref all remaining timers to prevent hanging
  // This handles timers from Bull, BeeQueue, ioredis, and other libraries
  try {
    if (process._getActiveHandles) {
      const handles = process._getActiveHandles();
      handles.forEach(handle => {
        // Unref any timer handles
        if (
          handle &&
          (handle.constructor.name === 'Timeout' ||
            handle.constructor.name === 'Timer' ||
            handle.constructor.name === 'Immediate')
        ) {
          if (typeof handle.unref === 'function') {
            handle.unref();
          }
        }

        // Also try to close TCP sockets that aren't stdin/stdout/stderr
        if (handle && handle.constructor.name === 'Socket' && handle.fd > 2) {
          if (typeof handle.destroy === 'function') {
            try {
              handle.destroy();
            } catch (e) {
              // Ignore errors
            }
          }
        }
      });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});
