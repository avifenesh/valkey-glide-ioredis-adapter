/**
 * Test setup file for ioredis adapter tests
 * This file is executed before running any tests
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { PortDiscovery, DiscoveredServer, ServerConfig, portUtils } from './utils/port-discovery';

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
const STANDALONE_CONFIG_CACHE_TTL = 30000; // 30 seconds
let hasLoggedDiscovery = false; // Flag to prevent repeated discovery logs

// Global test utilities
export const testUtils = {
  delay: (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms)),
  
  randomString: (length = 8): string => 
    Math.random().toString(36).substring(2, 2 + length),
  
  randomPort: (): number => 
    PortDiscovery.generateRandomPort(),
    
  // Get test server configuration with dynamic discovery
  async getStandaloneConfig(): Promise<ServerConfig> {
    const now = Date.now();
    
    // Return cached config if still valid
    if (cachedStandaloneConfig && (now - lastStandaloneConfigTime) < STANDALONE_CONFIG_CACHE_TTL) {
      return cachedStandaloneConfig;
    }
    
    try {
      // First try to find any existing Redis server
      const result = await portUtils.findRedisServerOrPort();
      
      let config: ServerConfig;
      
      if (result.server) {
        if (!hasLoggedDiscovery) {
          console.log(`🔍 Discovered Redis server at ${result.server.host}:${result.server.port} (${result.server.type} ${result.server.version || 'unknown version'})`);
          hasLoggedDiscovery = true;
        }
        config = { host: result.server.host, port: result.server.port };
      } else if (process.env.VALKEY_STANDALONE_HOST && process.env.VALKEY_STANDALONE_PORT) {
        // If no server found, check environment variables as fallback
        config = {
          host: process.env.VALKEY_STANDALONE_HOST,
          port: parseInt(process.env.VALKEY_STANDALONE_PORT, 10)
        };
        console.log(`📋 Using environment configuration: ${config.host}:${config.port}`);
      } else {
        // Default to standard Redis port
        console.log('📍 Using default Redis configuration: localhost:6379');
        config = { host: 'localhost', port: 6379 };
      }
      
      // Cache the result
      cachedStandaloneConfig = config;
      lastStandaloneConfigTime = now;
      
      return config;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️  Error during server discovery, using default:', errorMessage);
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
        { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_1, 10) },
        { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_2 || '7001', 10) },
        { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_3 || '7002', 10) },
        { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_4 || '7003', 10) },
        { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_5 || '7004', 10) },
        { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_6 || '7005', 10) }
      ];
    }
    
    // Generate dynamic cluster configuration
    try {
      const config = await portUtils.generateTestConfig(true);
      return config.cluster || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️  Error generating cluster config, using defaults:', errorMessage);
      return [
        { host: 'localhost', port: 7000 },
        { host: 'localhost', port: 7001 },
        { host: 'localhost', port: 7002 },
        { host: 'localhost', port: 7003 },
        { host: 'localhost', port: 7004 },
        { host: 'localhost', port: 7005 }
      ];
    }
  },
  
  // Enhanced server discovery with caching
  async discoverAvailableServers(forceRefresh = false): Promise<DiscoveredServer[]> {
    const now = Date.now();
    
    if (!forceRefresh && discoveredServers && (now - lastDiscoveryTime) < DISCOVERY_CACHE_TTL) {
      return discoveredServers;
    }
    
    try {
      discoveredServers = await PortDiscovery.discoverRedisServers();
      lastDiscoveryTime = now;
      return discoveredServers;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️  Server discovery failed:', errorMessage);
      return [];
    }
  },
  
  // Check if test servers are available with enhanced discovery
  async checkTestServers(): Promise<boolean> {
    try {
      // Quick check for default Redis port first
      if (await portUtils.isDefaultRedisAvailable()) {
        return true;
      }
      
      // Broader discovery if default port is not available
      const servers = await this.discoverAvailableServers();
      const responsiveServers = servers.filter(s => s.responsive);
      
      if (responsiveServers.length > 0) {
        console.log(`🔍 Found ${responsiveServers.length} responsive Redis server(s)`);
        return true;
      }
      
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️  Error checking test servers:', errorMessage);
      return false;
    }
  },

  // Validate Redis connection with dynamic configuration
  async validateRedisConnection(config?: ServerConfig): Promise<boolean> {
    try {
      const targetConfig = config || await this.getStandaloneConfig();
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
  }
};

// Type for test utilities
interface TestUtils {
  delay: (ms: number) => Promise<void>;
  randomString: (length?: number) => string;
  randomPort: () => number;
  getStandaloneConfig: () => Promise<ServerConfig>;
  getClusterConfig: () => Promise<ServerConfig[]>;
  discoverAvailableServers: (forceRefresh?: boolean) => Promise<DiscoveredServer[]>;
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