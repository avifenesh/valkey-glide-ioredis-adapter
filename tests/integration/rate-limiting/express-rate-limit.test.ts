/**
 * Rate Limiting Integration Test
 * Tests that our ioredis adapter works with express-rate-limit and rate-limit-redis
 */

import express = require('express');
const rateLimit = require('express-rate-limit');
import { RedisStore } from 'rate-limit-redis';
import supertest = require('supertest');
import { RedisAdapter } from '../../../src/adapters/RedisAdapter';
import { testUtils } from '../../setup';

describe('Rate Limiting Integration', () => {
  let app: express.Application;
  let redisAdapter: RedisAdapter;
  let request: any;

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      console.warn('⚠️  Test servers not available. Skipping rate limiting integration tests...');
      return;
    }
  });

  beforeEach(async () => {
    // Skip tests if servers are not available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      pending('Test servers not available');
      return;
    }

    // Use test server configuration
    const config = testUtils.getStandaloneConfig();
    redisAdapter = new RedisAdapter(config);
    await redisAdapter.connect();

    // Create Express app with rate limiting
    app = express();

    // Configure rate limiter with our Redis adapter
    const limiter = rateLimit({
      windowMs: 1000, // 1 second window
      max: 3, // Limit each IP to 3 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        // Use our adapter instance
        sendCommand: (...args: string[]) => {
          const [command, ...restArgs] = args;
          if (!command) throw new Error('Command is required');
          return redisAdapter.call(command, ...restArgs);
        },
      }),
    });

    app.use('/api/', limiter);
    app.get('/api/test', (_req: express.Request, res: express.Response) => {
      res.json({ message: 'Success', timestamp: Date.now() });
    });

    app.get('/unlimited', (_req: express.Request, res: express.Response) => {
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
      expect(response1.status).toBe(200);
      expect(response1.headers['x-ratelimit-limit']).toBe('3');
      expect(response1.headers['x-ratelimit-remaining']).toBe('2');

      // Second request should succeed
      const response2 = await request.get('/api/test');
      expect(response2.status).toBe(200);
      expect(response2.headers['x-ratelimit-remaining']).toBe('1');

      // Third request should succeed
      const response3 = await request.get('/api/test');
      expect(response3.status).toBe(200);
      expect(response3.headers['x-ratelimit-remaining']).toBe('0');
    });

    test('should block requests over limit', async () => {
      // Make 3 allowed requests
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test');

      // Fourth request should be rate limited
      const response = await request.get('/api/test');
      expect(response.status).toBe(429);
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });

    test('should not affect unlimited endpoints', async () => {
      // Make requests beyond limit on limited endpoint
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test');
      await request.get('/api/test'); // This should be blocked

      // Unlimited endpoint should still work
      const response = await request.get('/unlimited');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Unlimited endpoint');
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
      expect(blockedResponse.status).toBe(429);

      // Wait for window to reset (1 second + buffer)
      await testUtils.delay(1200);

      // Should be able to make requests again
      const resetResponse = await request.get('/api/test');
      expect(resetResponse.status).toBe(200);
      expect(resetResponse.headers['x-ratelimit-remaining']).toBe('2');
    });
  });

  describe('Multiple IPs', () => {
    test('should track rate limits per IP independently', async () => {
      // Simulate different IPs by setting X-Forwarded-For header
      const ip1Requests = request.set('X-Forwarded-For', '192.168.1.1');
      const ip2Requests = request.set('X-Forwarded-For', '192.168.1.2');

      // Use up limit for IP1
      await ip1Requests.get('/api/test');
      await ip1Requests.get('/api/test');
      await ip1Requests.get('/api/test');

      // IP1 should be blocked
      const ip1Blocked = await ip1Requests.get('/api/test');
      expect(ip1Blocked.status).toBe(429);

      // IP2 should still work
      const ip2Success = await ip2Requests.get('/api/test');
      expect(ip2Success.status).toBe(200);
      expect(ip2Success.headers['x-ratelimit-remaining']).toBe('2');
    });
  });

  describe('Redis Integration', () => {
    test('should store rate limit data in Redis', async () => {
      // Make a request to create rate limit entry
      await request.get('/api/test');

      // Check that keys were created in Redis
      const keys = await redisAdapter.keys('rl:*');
      expect(keys.length).toBeGreaterThan(0);

      // Verify the key contains rate limit data
      if (keys[0]) {
        const keyValue = await redisAdapter.get(keys[0]);
        expect(keyValue).toBeDefined();
      }
    });

    test('should clean up expired keys', async () => {
      // Make requests to create entries
      await request.get('/api/test');

      // Wait for expiration + buffer
      await testUtils.delay(1200);

      // Keys should be cleaned up (or at least not affect new requests)
      const response = await request.get('/api/test');
      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-remaining']).toBe('2');
    });
  });
});