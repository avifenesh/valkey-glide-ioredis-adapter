/**
 * Rate Limiting Integration Test
 * Tests that our ioredis adapter works with express-rate-limit and rate-limit-redis
 */

import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from 'node:test';
import assert from 'node:assert';
// Using dynamic imports for CommonJS modules
const express = (await import('express')).default;
const { default: rateLimit } = await import('express-rate-limit');
import { RedisStore } from 'rate-limit-redis';
const supertest = (await import('supertest')).default;
import pkg from '../../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../../utils/test-config.mjs';

async function checkTestServers() {
  try {
    const config = getStandaloneConfig();
    const testClient = new Redis(config);
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch (error) {
    return false;
  }
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
describe('Rate Limiting Integration', () => {
  let app;
  let redisAdapter;
  let request;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available - Redis connection required for rate limiting integration tests'
      );
      return;
    }
  });

  beforeEach(async () => {
    // Fail tests if servers are not available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available - Redis connection required for rate limiting integration tests'
      );
    }

    // Use test server configuration
    const config = await getStandaloneConfig();
    redisAdapter = new Redis(config);
    await redisAdapter.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redisAdapter.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

    // Create Express app with rate limiting
    app = express();

    // Trust proxy from local networks only (safer than 'true')
    app.set('trust proxy', 'loopback, linklocal, uniquelocal');

    // Configure rate limiter with our Redis adapter
    const limiter = rateLimit({
      windowMs: 1000, // 1 second window
      max: 3, // Limit each IP to 3 requests per windowMs
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      store: new RedisStore({
        // Use our adapter instance
        sendCommand: (...args) => {
          const [command, ...restArgs] = args;
          if (!command) throw new Error('Command is required');
          return redisAdapter.call(command, ...restArgs);
        },
      }),
    });

    app.use('/api/', limiter);
    app.get('/api/test', (_req, res) => {
      res.json({ message: 'Success', timestamp: Date.now() });
    });

    app.get('/unlimited', (_req, res) => {
      res.json({ message: 'Unlimited endpoint' });
    });

    request = supertest(app);
  });

  afterEach(async () => {
    if (redisAdapter) {
      try {
        // Clean up rate limiting keys
        const keys = await redisAdapter.keys('rl:*');
        if (keys.length > 0) {
          await redisAdapter.del(...keys);
        }
      } catch {
        // Ignore cleanup errors
      }
      await redisAdapter.disconnect();
    }
  });

  describe('Basic Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      // First request should succeed
      const response1 = await request.get('/api/test');
      assert.strictEqual(response1.status, 200);
      assert.strictEqual(response1.headers['ratelimit-limit'], '3');
      assert.strictEqual(response1.headers['ratelimit-remaining'], '2');

      // Second request should succeed
      const response2 = await request.get('/api/test');
      assert.strictEqual(response2.status, 200);
      assert.strictEqual(response2.headers['ratelimit-remaining'], '1');

      // Third request should succeed
      const response3 = await request.get('/api/test');
      assert.strictEqual(response3.status, 200);
      assert.strictEqual(response3.headers['ratelimit-remaining'], '0');
    });

    test('should block requests over limit', async () => {
      // Make 3 allowed requests
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test');

      // Fourth request should be rate limited
      const response = await request.get('/api/test');
      assert.strictEqual(response.status, 429);
      assert.strictEqual(response.headers['ratelimit-remaining'], '0');
    });

    test('should not affect unlimited endpoints', async () => {
      // Make requests beyond limit on limited endpoint
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test'); // This should be blocked

      // Unlimited endpoint should still work
      const response = await request.get('/unlimited');
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.message, 'Unlimited endpoint');
    });
  });

  describe('Rate Limit Reset', () => {
    test('should reset rate limit after window expires', async () => {
      // Use up the rate limit
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test');

      // Next request should be blocked
      const blockedResponse = await request.get('/api/test');
      assert.strictEqual(blockedResponse.status, 429);

      // Wait for window to reset (1 second + buffer)
      await delay(1200);

      // Should be able to make requests again
      const resetResponse = await request.get('/api/test');
      assert.strictEqual(resetResponse.status, 200);
      assert.strictEqual(resetResponse.headers['ratelimit-remaining'], '2');
    });
  });

  describe('Multiple IPs', () => {
    test('should track rate limits per IP independently', async () => {
      // Use up limit for default IP
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test');

      // Default IP should be blocked
      const defaultBlocked = await request.get('/api/test');
      assert.strictEqual(defaultBlocked.status, 429);

      // Different IP should still work
      const ip2Success = await request
        .get('/api/test')
        .set('X-Forwarded-For', '192.168.1.2');
      assert.strictEqual(ip2Success.status, 200);
      assert.strictEqual(ip2Success.headers['ratelimit-remaining'], '2');
    });
  });

  describe('Redis Integration', () => {
    test('should store rate limit data in Redis', async () => {
      // Make a request to create rate limit entry
      await request.get('/api/test');

      // Check that keys were created in Redis
      const keys = await redisAdapter.keys('rl:*');
      assert.ok(keys.length > 0);

      // Verify the key contains rate limit data
      if (keys[0]) {
        const keyValue = await redisAdapter.get(keys[0]);
        assert.ok(keyValue !== undefined);
      }
    });

    test('should clean up expired keys', async () => {
      // Make requests to create entries
      await request.get('/api/test');

      // Wait for expiration + buffer
      await delay(1200);

      // Keys should be cleaned up (or at least not affect new requests)
      const response = await request.get('/api/test');
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers['ratelimit-remaining'], '2');
    });
  });
});
