/**
 * Test Mode Configuration Helper
 * Provides consistent test execution across standalone and cluster modes
 * Enables running the same test suite against both deployment types
 */

/* global process */

import pkg from '../../dist/index.js';
const { Redis, Cluster } = pkg;

/**
 * Get test configuration for specified mode
 * @param {string} mode - 'standalone' or 'cluster'
 * @returns {Object} Configuration for creating clients
 */
export function getTestConfig(mode = 'standalone') {
  if (mode === 'cluster') {
    return {
      mode: 'cluster',
      nodes: getClusterConfig(),
      createClient: (options = {}) =>
        new Cluster(getClusterConfig(), {
          lazyConnect: true,
          ...options,
        }),
    };
  } else {
    return {
      mode: 'standalone',
      config: getStandaloneConfig(),
      createClient: (options = {}) =>
        new Redis({
          ...getStandaloneConfig(),
          ...options,
        }),
    };
  }
}

/**
 * Get Redis/Valkey configuration for standalone tests
 * @returns {Object} Redis configuration object
 */
export function getStandaloneConfig() {
  return {
    host: process.env.VALKEY_HOST || 'localhost',
    port: parseInt(process.env.VALKEY_PORT || '6383'),
    lazyConnect: true, // Critical for valkey-bundle compatibility
  };
}

/**
 * Get Redis/Valkey configuration for cluster tests
 * @returns {Array} Array of cluster node configurations
 */
export function getClusterConfig() {
  const clusterNodes =
    process.env.VALKEY_CLUSTER_NODES ||
    'localhost:17000,localhost:17001,localhost:17002';

  return clusterNodes.split(',').map(node => {
    const [host, port] = node.trim().split(':');
    return {
      host: host || 'localhost',
      port: parseInt(port || '17000'),
    };
  });
}

/**
 * Test suite runner that executes tests in both modes
 * @param {string} testName - Name of the test suite
 * @param {Function} testFn - Test function that receives (getClient, mode)
 */
export function testBothModes(testName, testFn) {
  const modes = ['standalone'];

  // Only test cluster mode if cluster nodes are available
  if (process.env.ENABLE_CLUSTER_TESTS === 'true') {
    modes.push('cluster');
  }

  modes.forEach(mode => {
    describe(`${testName} (${mode})`, () => {
      const config = getTestConfig(mode);

      // Pass a factory function that creates clients
      testFn(() => config.createClient(), mode);
    });
  });
}

export default {
  getTestConfig,
  getStandaloneConfig,
  getClusterConfig,
  testBothModes,
};
