/**
 * Test Configuration Helper
 * Provides consistent configuration across all test files
 * Uses environment variables set by the test runner
 */

/**
 * Get Redis/Valkey configuration for standalone tests
 * @returns {Object} Redis configuration object
 */
export function getStandaloneConfig() {
  return {
    host: process.env.VALKEY_HOST || 'localhost',
    port: parseInt(process.env.VALKEY_PORT || '6379'),
    lazyConnect: true, // Critical for valkey-bundle compatibility
  };
}

/**
 * Get Redis/Valkey configuration for cluster tests
 * @returns {Array} Array of cluster node configurations
 */
export function getClusterConfig() {
  const clusterNodes = process.env.VALKEY_CLUSTER_NODES || 'localhost:17000';
  
  return clusterNodes.split(',').map(node => {
    const [host, port] = node.trim().split(':');
    return {
      host: host || 'localhost',
      port: parseInt(port || '17000')
    };
  });
}

/**
 * Check if test servers are available (for backward compatibility)
 * @returns {boolean} Always returns true since we start our own containers
 */
export function checkTestServers() {
  return true;
}

/**
 * Simple delay utility for tests
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after the delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Default export for convenience
 */
export default {
  getStandaloneConfig,
  getClusterConfig,
  checkTestServers,
  delay
};