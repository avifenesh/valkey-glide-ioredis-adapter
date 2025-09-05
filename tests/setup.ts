/**
 * Test setup file for ioredis adapter tests
 * This file is executed before running any tests
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
// Local lightweight types for setup utilities (avoid unavailable ESM imports)
type ServerConfig = { host: string; port: number };
type DiscoveredServer = ServerConfig & { responsive?: boolean };

// Load test environment variables if they exist
const envTestPath = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Global test timeout - increased for real server operations (guard for Jest)
// When running under Node's built-in test runner, `jest` is undefined
if (typeof (globalThis as any).jest !== 'undefined') {
  (globalThis as any).jest.setTimeout(60000);
}

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

  randomPort: (): number => 40000 + Math.floor(Math.random() * 10000),

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
    // Prefer explicit env ports, otherwise return a common default range
    const ports: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const p = process.env[`VALKEY_CLUSTER_PORT_${i}` as any];
      if (p) ports.push(parseInt(p, 10));
    }
    const list = (ports.length ? ports : [7000, 7001, 7002, 7003, 7004, 7005]).map(
      port => ({ host: 'localhost', port })
    );
    return list;
  },

  // Enhanced server discovery with caching
  async discoverAvailableServers(forceRefresh = false): Promise<DiscoveredServer[]> {
    const now = Date.now();
    if (!forceRefresh && discoveredServers && now - lastDiscoveryTime < DISCOVERY_CACHE_TTL) {
      return discoveredServers;
    }
    // Minimal implementation: assume localhost:6379 is available
    discoveredServers = [{ host: 'localhost', port: 6379, responsive: true }];
    lastDiscoveryTime = now;
    return discoveredServers;
  },

  // Check if test servers are available with enhanced discovery
  async checkTestServers(): Promise<boolean> {
    // Lightweight check: assume available if VALKEY_HOST/PORT reachable would be handled by tests
    return true;
  },

  // Validate Redis connection with dynamic configuration
  async validateRedisConnection(_config?: ServerConfig): Promise<boolean> {
    // Minimal stub always returns true; specific tests will exercise actual connectivity
    return true;
  },

  // Get or allocate a Redis server for testing
  async getOrAllocateTestServer(): Promise<ServerConfig> {
    return { host: 'localhost', port: 6379 };
  },

  // Check if any Redis server is available anywhere
  async hasAnyRedisServer(): Promise<boolean> {
    return true;
  },

  // Generate unique test configuration
  async generateUniqueTestConfig(): Promise<ServerConfig> {
    return { host: 'localhost', port: 40000 + Math.floor(Math.random() * 10000) };
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
