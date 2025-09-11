/**
 * Clean Test Setup - Minimal, reliable test infrastructure
 *
 * Provides simple, reliable test utilities without complex global state
 * or aggressive cleanup that can cause hanging tests.
 */

export const testUtils = {
  /**
   * Get standalone server configuration
   */
  getStandaloneConfig() {
    return {
      host: process.env.VALKEY_HOST || 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
      connectTimeout: 5000,
      lazyConnect: false, // Connect immediately for tests
    };
  },

  /**
   * Get cluster configuration
   */
  getClusterConfig() {
    if (!process.env.ENABLE_CLUSTER_TESTS) {
      return [];
    }

    const basePort = 17000;
    const nodes = [];
    for (let i = 0; i < 3; i++) {
      nodes.push({
        host: 'localhost',
        port: basePort + i,
      });
    }
    return nodes;
  },

  /**
   * Check if test servers are available (simplified)
   */
  checkTestServers() {
    // Always return true - let individual tests handle connection failures
    return true;
  },

  /**
   * Create a test client with safe cleanup
   */
  async createTestClient(config = {}) {
    // Use require for CommonJS module
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../../dist/index.js');
    const { Redis } = pkg;
    const clientConfig = {
      ...this.getStandaloneConfig(),
      ...config,
    };

    const client = new Redis(clientConfig);

    // Store for cleanup
    if (!global.__testClients) {
      global.__testClients = [];
    }
    global.__testClients.push(client);

    return client;
  },

  /**
   * Safe cleanup of all test clients
   */
  async cleanupTestClients() {
    if (!global.__testClients) return;

    const clients = [...global.__testClients];
    global.__testClients = [];

    await Promise.all(
      clients.map(async client => {
        try {
          if (client && typeof client.quit === 'function') {
            await Promise.race([
              client.quit(),
              new Promise(resolve => setTimeout(resolve, 1000).unref()), // 1s timeout
            ]);
          }
        } catch {
          // Ignore cleanup errors
        }
      })
    );
  },
};

// Minimal global cleanup only when explicitly requested
if (process.env.ENABLE_TEST_CLEANUP === '1') {
  const { after } = await import('node:test');
  after(async () => {
    await testUtils.cleanupTestClients();
  });
}
