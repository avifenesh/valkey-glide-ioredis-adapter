/**
 * Shared utilities for integration tests
 */

import { RedisAdapter } from '../../../src/adapters/RedisAdapter';
import { testUtils } from '../../setup';

export interface IntegrationTestConfig {
  keyPrefix: string;
  cleanupKeys?: string[];
  timeout?: number;
}

export class IntegrationTestHelper {
  private redisClient: RedisAdapter | null = null;
  private config: IntegrationTestConfig;

  constructor(config: IntegrationTestConfig) {
    this.config = config;
  }

  /**
   * Setup Redis client for integration tests
   */
  async setupRedis(): Promise<RedisAdapter> {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available. Please run: ./scripts/start-test-servers.sh');
    }

    const serverConfig = testUtils.getStandaloneConfig();
    this.redisClient = new RedisAdapter({
      ...serverConfig,
      keyPrefix: this.config.keyPrefix
    });

    await this.redisClient.connect();
    return this.redisClient;
  }

  /**
   * Get Redis connection configuration for external libraries
   */
  getConnectionConfig() {
    const serverConfig = testUtils.getStandaloneConfig();
    return {
      port: serverConfig.port,
      host: serverConfig.host,
      keyPrefix: this.config.keyPrefix
    };
  }

  /**
   * Clean up test data and disconnect
   */
  async cleanup(): Promise<void> {
    if (!this.redisClient) return;

    try {
      // Clean up test keys
      const patterns = [
        `${this.config.keyPrefix}*`,
        ...(this.config.cleanupKeys || [])
      ];

      for (const pattern of patterns) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      }
    } catch (error) {
      console.warn('Cleanup error (non-fatal):', error);
    }

    try {
      await this.redisClient.disconnect();
    } catch (error) {
      console.warn('Disconnect error (non-fatal):', error);
    }

    this.redisClient = null;
  }

  /**
   * Get the Redis client instance
   */
  getRedisClient(): RedisAdapter {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized. Call setupRedis() first.');
    }
    return this.redisClient;
  }

  /**
   * Wait for a condition with timeout
   */
  async waitForCondition(
    condition: () => Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      await testUtils.delay(intervalMs);
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  /**
   * Create isolated test data with automatic cleanup
   */
  createTestKey(suffix: string): string {
    const key = `${this.config.keyPrefix}${suffix}:${Date.now()}:${Math.random()}`;
    
    // Add to cleanup list
    if (!this.config.cleanupKeys) {
      this.config.cleanupKeys = [];
    }
    this.config.cleanupKeys.push(key);
    
    return key;
  }
}

/**
 * Jest setup helpers for integration tests
 */
export function createIntegrationTestSuite(
  suiteName: string,
  keyPrefix: string,
  testFn: (helper: IntegrationTestHelper) => void
) {
  describe(suiteName, () => {
    let helper: IntegrationTestHelper;

    beforeAll(async () => {
      // Check if test servers are available
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        console.warn('⚠️  Test servers not available. Please run: ./scripts/start-test-servers.sh');
        console.warn(`   Skipping ${suiteName}...`);
      }
    });

    beforeEach(async () => {
      // Skip tests if servers are not available
      const serversAvailable = await testUtils.checkTestServers();
      if (!serversAvailable) {
        pending('Test servers not available');
        return;
      }

      helper = new IntegrationTestHelper({ keyPrefix });
      await helper.setupRedis();
    });

    afterEach(async () => {
      if (helper) {
        await helper.cleanup();
      }
    });

    testFn(helper);
  });
}

/**
 * Performance measurement utilities
 */
export class PerformanceMeasurement {
  private measurements: Array<{ name: string; duration: number }> = [];

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = process.hrtime.bigint();
    const result = await operation();
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1_000_000; // Convert to milliseconds
    this.measurements.push({ name, duration: durationMs });
    
    return result;
  }

  getResults() {
    return this.measurements.slice();
  }

  getAverageDuration(name: string): number {
    const filtered = this.measurements.filter(m => m.name === name);
    if (filtered.length === 0) return 0;
    
    const total = filtered.reduce((sum, m) => sum + m.duration, 0);
    return total / filtered.length;
  }

  clear() {
    this.measurements = [];
  }
}

/**
 * Mock data generators for consistent testing
 */
export const mockData = {
  /**
   * Generate job data for queue testing
   */
  generateJobData(index: number = 0) {
    return {
      id: `job-${index}-${Date.now()}`,
      payload: {
        message: `Test job ${index}`,
        timestamp: Date.now(),
        randomValue: Math.random()
      },
      metadata: {
        created: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  },

  /**
   * Generate user session data
   */
  generateSessionData(userId: string = 'test-user') {
    return {
      userId,
      sessionId: `session-${Date.now()}-${Math.random()}`,
      loginTime: Date.now(),
      lastActivity: Date.now(),
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1'
    };
  },

  /**
   * Generate rate limiting test scenarios
   */
  generateRateLimitScenarios() {
    return [
      { windowMs: 1000, max: 5, name: 'strict' },
      { windowMs: 5000, max: 20, name: 'moderate' },
      { windowMs: 10000, max: 100, name: 'lenient' }
    ];
  }
};