// Global test setup to ensure DB cleanup after each test across the suite
// Minimal global setup — no diagnostics or process hooks
import { after, afterEach } from 'node:test';

// Global cleanup to ensure all connections are closed after tests
afterEach(async () => {
  // Proactively close any clients created during a test to avoid lingering handles
  try {
    const pkg = await import('../dist/index.js');
    const { Redis } = pkg;
    if (Redis.forceCloseAllClients) {
      await Promise.race([
        Redis.forceCloseAllClients(2000), // Give GLIDE Rust core more time
        new Promise(resolve => {
          const t = setTimeout(resolve, 3000); // Longer race timeout
          if (typeof t.unref === 'function') t.unref();
        }),
      ]);
    }

    // Ensure socket files are cleaned up after each test
    try {
      const { SocketFileManager } = pkg;
      if (SocketFileManager) {
        // Use aggressive cleanup in CI environment
        if (process.env.CI) {
          await SocketFileManager.forceCleanupAllGlideSocketFiles();
        } else {
          await SocketFileManager.closeAllSocketFiles();
        }
      }
    } catch {}

    // Optional leak check: ensure no clients remain after cleanup
    try {
      const active =
        typeof Redis.getActiveClientCount === 'function'
          ? Redis.getActiveClientCount()
          : 0;
      if (active > 0) {
        const msg = `Leak check: ${active} Redis clients still active after test`;
        if (process.env.LEAK_STRICT === '1') {
          throw new Error(msg);
        } else {
          console.warn(msg);
        }
      }
    } catch {}
  } catch {}

  // Optional diagnostics: report active clients after each test
  try {
    if (process.env.ADAPTER_DIAG === '1') {
      const pkg = await import('../dist/index.js');
      const { Redis } = pkg;
      const active =
        typeof Redis.getActiveClientCount === 'function'
          ? Redis.getActiveClientCount()
          : 0;

      console.log(`[diag] active-clients-after-each=${active}`);
    }
  } catch {}
});

after(async () => {
  try {
    const pkg = await import('../dist/index.js');
    const { Redis } = pkg;

    if (Redis.forceCloseAllClients) {
      // Force close all clients with a timeout
      await Promise.race([
        Redis.forceCloseAllClients(3000), // Give GLIDE Rust core even more time at test end
        new Promise(resolve => {
          const t = setTimeout(resolve, 5000); // Longer race timeout for final cleanup
          if (typeof t.unref === 'function') t.unref();
        }),
      ]);
    }
  } catch (error) {
    // Ignore errors during cleanup
  }

  // Graceful GLIDE socket cleanup
  try {
    const pkg = await import('../dist/index.js');
    const { SocketFileManager } = pkg;
    if (SocketFileManager) {
      await SocketFileManager.closeAllSocketFiles();
    }
  } catch (error) {
    // SocketFileManager might not be available
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
