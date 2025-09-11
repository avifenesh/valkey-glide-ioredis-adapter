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
          t.unref?.();
        })
      ]);
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
});
