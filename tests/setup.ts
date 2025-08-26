/**
 * Test setup file for ioredis adapter tests
 * This file is executed before running any tests
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load test environment variables if they exist
const envTestPath = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Mock console methods for cleaner test output
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console.log in tests unless explicitly needed
  if (process.env.NODE_ENV === 'test') {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test timeout - increased for real server operations
jest.setTimeout(60000);

// Mock process.env for consistent testing
process.env.NODE_ENV = 'test';

// Global test utilities
export const testUtils = {
  delay: (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms)),
  
  randomString: (length = 8): string => 
    Math.random().toString(36).substring(2, 2 + length),
  
  randomPort: (): number => 
    Math.floor(Math.random() * (65535 - 1024)) + 1024,
    
  // Get test server configuration
  getStandaloneConfig: () => ({
    host: process.env.VALKEY_STANDALONE_HOST || 'localhost',
    port: parseInt(process.env.VALKEY_STANDALONE_PORT || '6379', 10)
  }),
  
  getClusterConfig: () => [
    { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_1 || '7000', 10) },
    { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_2 || '7001', 10) },
    { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_3 || '7002', 10) },
    { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_4 || '7003', 10) },
    { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_5 || '7004', 10) },
    { host: 'localhost', port: parseInt(process.env.VALKEY_CLUSTER_PORT_6 || '7005', 10) }
  ],
  
  // Check if test servers are available
  async checkTestServers(): Promise<boolean> {
    const config = this.getStandaloneConfig();
    try {
      const net = await import('net');
      const socket = new net.Socket();
      
      return new Promise((resolve) => {
        socket.setTimeout(1000);
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(config.port, config.host);
      });
    } catch {
      return false;
    }
  }
};

// Type for test utilities
interface TestUtils {
  delay: (ms: number) => Promise<void>;
  randomString: (length?: number) => string;
  randomPort: () => number;
  getStandaloneConfig: () => { host: string; port: number };
  getClusterConfig: () => Array<{ host: string; port: number }>;
  checkTestServers: () => Promise<boolean>;
}

// Make test utilities available globally
declare global {
  var testUtils: TestUtils;
}

(global as any).testUtils = testUtils;