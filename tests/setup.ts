/**
 * Test setup file for ioredis adapter tests
 * This file is executed before running any tests
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import {
  PortDiscovery,
  DiscoveredServer,
  ServerConfig,
  portUtils,
} from './utils/port-discovery';

// Load test environment variables if they exist
const envTestPath = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Global test timeout - increased for real server operations
jest.setTimeout(60000);

// Set test environment
process.env.NODE_ENV = 'test';

// Cache for discovered servers to avoid repeated discovery
let discoveredServers: DiscoveredServer[] | null = null;
let lastDiscoveryTime = 0;
const DISCOVERY_CACHE_TTL = 30000; // 30 seconds

// Cache for standalone config to avoid repeated discovery logs
let cachedStandaloneConfig: ServerConfig | null = null;
let lastStandaloneConfigTime = 0;
const STANDALONE_CONFIG_CACHE_TTL = 0; // Disable caching for now
// Remove unused variable

// Global test utilities
export const testUtils = {
  delay: (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms)),

  randomString: (length = 8): string =>
    Math.random()
      .toString(36)
      .substring(2, 2 + length),

  randomPort: (): number => PortDiscovery.generateRandomPort(),

  // Get test server configuration with dynamic discovery
  async getStandaloneConfig(): Promise<ServerConfig> {
    const now = Date.now();

    // Return cached config if still valid
    if (
      cachedStandaloneConfig &&
      now - lastStandaloneConfigTime < STANDALONE_CONFIG_CACHE_TTL
    ) {
      return cachedStandaloneConfig;
    }

    try {
      // Highest priority: explicit env (support both REDIS_ and VALKEY_ prefixes)
      if (
        (process.env.REDIS_HOST && process.env.REDIS_PORT) ||
        (process.env.VALKEY_STANDALONE_HOST &&
          process.env.VALKEY_STANDALONE_PORT)
      ) {
        const envConfig = {
          host:
            process.env.VALKEY_STANDALONE_HOST ||
            process.env.REDIS_HOST ||
            'localhost',
          port: parseInt(
            process.env.VALKEY_STANDALONE_PORT ||
              process.env.REDIS_PORT ||
              '6379',
            10
          ),
        } as ServerConfig;
        cachedStandaloneConfig = envConfig;
        lastStandaloneConfigTime = now;
        return envConfig;
      }

      // For Bull/BeeQueue tests, always use standalone Redis on port 6379
      // These libraries are not designed for cluster mode
      const config = { host: 'localhost', port: 6379 };

      // Cache the result
      cachedStandaloneConfig = config;
      lastStandaloneConfigTime = now;

      return config;
    } catch (error) {
      const defaultConfig = { host: 'localhost', port: 6379 };

      // Cache the default config too
      cachedStandaloneConfig = defaultConfig;
      lastStandaloneConfigTime = now;

      return defaultConfig;
    }
  },

  async getClusterConfig(): Promise<ServerConfig[]> {
    // Try environment variables first for cluster config
    if (process.env.VALKEY_CLUSTER_PORT_1) {
      return [
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_CLUSTER_PORT_1, 10),
        },
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_CLUSTER_PORT_2 || '7001', 10),
        },
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_CLUSTER_PORT_3 || '7002', 10),
        },
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_CLUSTER_PORT_4 || '7003', 10),
        },
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_CLUSTER_PORT_5 || '7004', 10),
        },
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_CLUSTER_PORT_6 || '7005', 10),
        },
      ];
    }

    // Generate dynamic cluster configuration
    try {
      const config = await portUtils.generateTestConfig(true);
      return config.cluster || [];
    } catch (error) {
      return [
        { host: 'localhost', port: 7000 },
        { host: 'localhost', port: 7001 },
        { host: 'localhost', port: 7002 },
        { host: 'localhost', port: 7003 },
        { host: 'localhost', port: 7004 },
        { host: 'localhost', port: 7005 },
      ];
    }
  },

  // Enhanced server discovery with caching
  async discoverAvailableServers(
    forceRefresh = false
  ): Promise<DiscoveredServer[]> {
    const now = Date.now();

    if (
      !forceRefresh &&
      discoveredServers &&
      now - lastDiscoveryTime < DISCOVERY_CACHE_TTL
    ) {
      return discoveredServers;
    }

    try {
      discoveredServers = await PortDiscovery.discoverRedisServers();
      lastDiscoveryTime = now;
      return discoveredServers;
    } catch (error) {
      return [];
    }
  },

  // Check if test servers are available with enhanced discovery
  async checkTestServers(): Promise<boolean> {
    try {
      // Use our new TestEnvironment for server checking
      const { TestEnvironment } = await import('./utils/testEnvironment');
      const testEnv = TestEnvironment.getInstance();

      // Check standalone server health
      const standaloneHealth = await testEnv.checkStandaloneHealth();
      return standaloneHealth.available && standaloneHealth.responsive;
    } catch (error) {
      return false;
    }
  },

  // Validate Redis connection with dynamic configuration
  async validateRedisConnection(config?: ServerConfig): Promise<boolean> {
    try {
      const targetConfig = config || (await this.getStandaloneConfig());
      const serverInfo = await PortDiscovery.validateRedisServer(targetConfig);
      return serverInfo?.responsive ?? false;
    } catch (error) {
      return false;
    }
  },

  // Get or allocate a Redis server for testing
  async getOrAllocateTestServer(): Promise<ServerConfig> {
    return PortDiscovery.getOrAllocateRedisServer();
  },

  // Check if any Redis server is available anywhere
  async hasAnyRedisServer(): Promise<boolean> {
    return PortDiscovery.hasAnyRedisServer();
  },

  // Generate unique test configuration
  async generateUniqueTestConfig(): Promise<ServerConfig> {
    const availablePort = await PortDiscovery.findAvailablePort();
    return { host: 'localhost', port: availablePort };
  },
};

// Type for test utilities
interface TestUtils {
  delay: (ms: number) => Promise<void>;
  randomString: (length?: number) => string;
  randomPort: () => number;
  getStandaloneConfig: () => Promise<ServerConfig>;
  getClusterConfig: () => Promise<ServerConfig[]>;
  discoverAvailableServers: (
    forceRefresh?: boolean
  ) => Promise<DiscoveredServer[]>;
  checkTestServers: () => Promise<boolean>;
  validateRedisConnection: (config?: ServerConfig) => Promise<boolean>;
  getOrAllocateTestServer: () => Promise<ServerConfig>;
  hasAnyRedisServer: () => Promise<boolean>;
  generateUniqueTestConfig: () => Promise<ServerConfig>;
}

// Make test utilities available globally
declare global {
  var testUtils: TestUtils;
}

(global as any).testUtils = testUtils;
