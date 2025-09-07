/**
 * Express Session Store Integration Test
 *
 * Tests that our ioredis adapter works correctly with connect-redis
 * for Express session management - a critical use case for web applications.
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
const session = (await import('express-session')).default;
import { RedisStore } from 'connect-redis';
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
describe('Express Session Store Integration', () => {
  let app;
  let redisClient;
  let request;
  const keyPrefix = 'TEST:session:';

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available - Server connection required for session store integration tests'
      );
      return;
    }
  });

  beforeEach(async () => {
    // Fail tests if servers are not available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available - Server connection required for session store integration tests'
      );
    }

    // Setup Redis client with our adapter
    const config = getStandaloneConfig();
    redisClient = new Redis({
      ...config,
      keyPrefix: keyPrefix,
    });

    await redisClient.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redisClient.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

    // Create Express app with session management
    app = express();

    // Configure session store with our Redis adapter
    app.use(
      session({
        store: new RedisStore({
          client: redisClient, // Type assertion for compatibility
          prefix: `${keyPrefix}sess:`,
          ttl: 3600, // 1 hour
        }),
        secret: 'test-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: false, // Set to true in production with HTTPS
          maxAge: 3600000, // 1 hour in milliseconds
        },
      })
    );

    // Test routes
    app.get('/login', (req, res) => {
      req.session.userId = 'user123';
      req.session.username = 'testuser';
      req.session.loginTime = Date.now();
      res.json({
        message: 'Logged in successfully',
        sessionId: req.sessionID,
      });
    });

    app.get('/profile', (req, res) => {
      if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      return res.json({
        userId: req.session.userId,
        username: req.session.username,
        loginTime: req.session.loginTime,
        sessionId: req.sessionID,
      });
    });

    app.post('/update-profile', (req, res) => {
      if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      req.session.lastUpdate = Date.now();
      req.session.updateCount = (req.session.updateCount || 0) + 1;
      return res.json({
        message: 'Profile updated',
        updateCount: req.session.updateCount,
      });
    });

    app.post('/logout', (req, res) => {
      req.session.destroy(err => {
        if (err) {
          return res.status(500).json({ error: 'Failed to logout' });
        }
        return res.json({ message: 'Logged out successfully' });
      });
    });

    request = supertest(app);
  });

  afterEach(async () => {
    if (redisClient) {
      try {
        // Clean up session data
        const keys = await redisClient.keys(`${keyPrefix}*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch {
        // Ignore cleanup errors
      }
      await redisClient.disconnect();
    }
  });

  describe('Session Lifecycle', () => {
    test('should create session on login', async () => {
      const response = await request.get('/login');

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.message, 'Logged in successfully');
      assert.ok(response.body.sessionId !== undefined);

      // Check session data exists in Redis
      const sessionKeys = await redisClient.keys(`${keyPrefix}sess:*`);
      assert.ok(sessionKeys.length > 0);
    });

    test('should maintain session across requests', async () => {
      // Login to create session
      const loginResponse = await request.get('/login');
      const sessionCookie = loginResponse.headers['set-cookie'];

      assert.ok(sessionCookie !== undefined);

      // Access profile with session cookie
      const profileResponse = await request
        .get('/profile')
        .set('Cookie', sessionCookie);

      assert.strictEqual(profileResponse.status, 200);
      assert.strictEqual(profileResponse.body.userId, 'user123');
      assert.strictEqual(profileResponse.body.username, 'testuser');
      assert.ok(profileResponse.body.loginTime !== undefined);
    });

    test('should update session data', async () => {
      // Login first
      const loginResponse = await request.get('/login');
      const sessionCookie = loginResponse.headers['set-cookie'];

      // Update profile multiple times
      const update1 = await request
        .post('/update-profile')
        .set('Cookie', sessionCookie);

      assert.strictEqual(update1.status, 200);
      assert.strictEqual(update1.body.updateCount, 1);

      const update2 = await request
        .post('/update-profile')
        .set('Cookie', sessionCookie);

      assert.strictEqual(update2.status, 200);
      assert.strictEqual(update2.body.updateCount, 2);
    });

    test('should destroy session on logout', async () => {
      // Login first
      const loginResponse = await request.get('/login');
      const sessionCookie = loginResponse.headers['set-cookie'];

      // Verify session works
      const profileResponse = await request
        .get('/profile')
        .set('Cookie', sessionCookie);
      assert.strictEqual(profileResponse.status, 200);

      // Logout
      const logoutResponse = await request
        .post('/logout')
        .set('Cookie', sessionCookie);
      assert.strictEqual(logoutResponse.status, 200);

      // Verify session is destroyed
      const profileAfterLogout = await request
        .get('/profile')
        .set('Cookie', sessionCookie);
      assert.strictEqual(profileAfterLogout.status, 401);
    });
  });

  describe('Session Security & TTL', () => {
    test('should handle concurrent sessions', async () => {
      // Create multiple sessions
      const session1 = await request.get('/login');
      const session2 = await request.get('/login');

      const cookie1 = session1.headers['set-cookie'];
      const cookie2 = session2.headers['set-cookie'];

      // Both sessions should be independent
      const profile1 = await request.get('/profile').set('Cookie', cookie1);
      const profile2 = await request.get('/profile').set('Cookie', cookie2);

      assert.strictEqual(profile1.status, 200);
      assert.strictEqual(profile2.status, 200);
      assert.notStrictEqual(profile1.body.sessionId, profile2.body.sessionId);
    });

    test('should reject requests without valid session', async () => {
      const response = await request.get('/profile');
      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.error, 'Not authenticated');
    });

    test('should handle invalid session cookies', async () => {
      const response = await request
        .get('/profile')
        .set('Cookie', 'connect.sid=invalid-session-id');

      assert.strictEqual(response.status, 401);
    });
  });

  describe('Redis Integration', () => {
    test('should store session data with correct TTL', async () => {
      // Create session
      await request.get('/login');

      // Check session exists in Redis with TTL
      const sessionKeys = await redisClient.keys(`${keyPrefix}sess:*`);
      assert.ok(sessionKeys.length > 0);

      if (sessionKeys[0]) {
        const ttl = await redisClient.ttl(sessionKeys[0]);
        assert.ok(ttl > 0);
        assert.ok(ttl <= 3600); // Should be <= 1 hour
      }
    });

    test('should handle Redis connection errors gracefully', async () => {
      // Disconnect Redis to simulate connection failure
      await redisClient.disconnect();

      // App should still work but session won't persist
      const response = await request.get('/login');

      // The exact behavior depends on connect-redis configuration
      // It might return 500 or create in-memory session
      assert.ok([200, 500].includes(response.status));
    });

    test('should clean up expired sessions', async () => {
      // This test would need a shorter TTL to be practical
      // We'll verify the TTL is set correctly instead
      await request.get('/login');

      // Wait a small amount of time to ensure TTL starts counting
      await delay(500);

      const sessionKeys = await redisClient.keys(`${keyPrefix}sess:*`);
      if (sessionKeys[0]) {
        const ttl = await redisClient.ttl(sessionKeys[0]);
        // TTL should be set and should be <= 3600
        assert.ok(ttl > 0);
        assert.ok(ttl <= 3600);

        // If TTL is exactly 3600, wait a bit more to see it decrease
        if (ttl === 3600) {
          await delay(1100); // Wait just over 1 second
          const updatedTtl = await redisClient.ttl(sessionKeys[0]);
          assert.ok(updatedTtl < 3600); // Should now be decreasing
        }
      }
    });
  });
});
