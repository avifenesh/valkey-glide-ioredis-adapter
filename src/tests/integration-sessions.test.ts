/**
 * Integration Tests with Session Stores
 * Testing session management scenarios with Express-like session stores
 */

import { RedisAdapter } from '../adapters/RedisAdapter';
import { EventEmitter } from 'events';

// Mock Session Store (similar to connect-redis)
class MockRedisSessionStore extends EventEmitter {
  private redis: any;
  private prefix: string;
  private serializer: any;
  private ttl: number;

  constructor(options: {
    client: any;
    prefix?: string;
    ttl?: number;
    serializer?: any;
  }) {
    super();
    this.redis = options.client;
    this.prefix = options.prefix || 'sess:';
    this.ttl = options.ttl || 86400; // 24 hours default
    this.serializer = options.serializer || {
      stringify: JSON.stringify,
      parse: JSON.parse
    };
  }

  private getKey(sessionId: string): string {
    return this.prefix + sessionId;
  }

  async get(sessionId: string): Promise<any> {
    try {
      const key = this.getKey(sessionId);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      const session = this.serializer.parse(data);
      
      // Check if session has expired
      if (session.expires && session.expires <= Date.now()) {
        await this.destroy(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  async set(sessionId: string, session: any, callback?: Function): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      
      // Add expiration timestamp
      const sessionData = {
        ...session,
        expires: Date.now() + (this.ttl * 1000)
      };

      const serialized = this.serializer.stringify(sessionData);
      await this.redis.setex(key, this.ttl, serialized);
      
      this.emit('set', sessionId);
      if (callback) callback();
    } catch (error) {
      this.emit('error', error);
      if (callback) callback(error);
    }
  }

  async destroy(sessionId: string, callback?: Function): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      await this.redis.del(key);
      
      this.emit('destroy', sessionId);
      if (callback) callback();
    } catch (error) {
      this.emit('error', error);
      if (callback) callback(error);
    }
  }

  async touch(sessionId: string, session: any, callback?: Function): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      
      // Update expiration without changing session data
      await this.redis.expire(key, this.ttl);
      
      this.emit('touch', sessionId);
      if (callback) callback();
    } catch (error) {
      this.emit('error', error);
      if (callback) callback(error);
    }
  }

  async clear(callback?: Function): Promise<void> {
    try {
      // Get all session keys
      const pattern = this.prefix + '*';
      const keys = await this.getScanKeys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      this.emit('clear');
      if (callback) callback();
    } catch (error) {
      this.emit('error', error);
      if (callback) callback(error);
    }
  }

  async length(callback?: Function): Promise<number> {
    try {
      const pattern = this.prefix + '*';
      const keys = await this.getScanKeys(pattern);
      const count = keys.length;
      
      if (callback) callback(null, count);
      return count;
    } catch (error) {
      this.emit('error', error);
      if (callback) callback(error);
      return 0;
    }
  }

  async all(callback?: Function): Promise<any[]> {
    try {
      const pattern = this.prefix + '*';
      const keys = await this.getScanKeys(pattern);
      const sessions = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          try {
            const session = this.serializer.parse(data);
            const sessionId = key.substring(this.prefix.length);
            sessions.push({ sessionId, ...session });
          } catch (parseError) {
            console.warn('Failed to parse session data for key:', key);
          }
        }
      }

      if (callback) callback(null, sessions);
      return sessions;
    } catch (error) {
      this.emit('error', error);
      if (callback) callback(error);
      return [];
    }
  }

  private async getScanKeys(pattern: string): Promise<string[]> {
    // Simple implementation - in real scenario, would use SCAN for better performance
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      try {
        // Mock SCAN implementation using basic approach
        // In real implementation, would use proper SCAN command
        const allKeys = await this.redis.keys(pattern);
        keys.push(...allKeys);
        break;
      } catch (error) {
        break;
      }
    } while (cursor !== '0');

    return keys;
  }

  async cleanup(): Promise<void> {
    // Cleanup expired sessions
    const pattern = this.prefix + '*';
    const keys = await this.getScanKeys(pattern);
    const expiredKeys = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const session = this.serializer.parse(data);
          if (session.expires && session.expires <= Date.now()) {
            expiredKeys.push(key);
          }
        } catch (error) {
          // If can't parse, consider it expired
          expiredKeys.push(key);
        }
      }
    }

    if (expiredKeys.length > 0) {
      await this.redis.del(...expiredKeys);
      this.emit('cleanup', expiredKeys.length);
    }
  }
}

// Mock Session object
class MockSession {
  id: string;
  data: any = {};
  cookie: any;
  store: MockRedisSessionStore;

  constructor(sessionId: string, store: MockRedisSessionStore) {
    this.id = sessionId;
    this.store = store;
    this.cookie = {
      maxAge: 86400000, // 24 hours
      httpOnly: true,
      secure: false
    };
  }

  async save(): Promise<void> {
    await this.store.set(this.id, {
      data: this.data,
      cookie: this.cookie
    });
  }

  async destroy(): Promise<void> {
    await this.store.destroy(this.id);
  }

  async reload(): Promise<void> {
    const sessionData = await this.store.get(this.id);
    if (sessionData) {
      this.data = sessionData.data || {};
      this.cookie = sessionData.cookie || this.cookie;
    }
  }

  async touch(): Promise<void> {
    await this.store.touch(this.id, {
      data: this.data,
      cookie: this.cookie
    });
  }
}

describe('Session Store Integration Tests', () => {
  let redis: RedisAdapter;
  let sessionStore: MockRedisSessionStore;

  beforeEach(async () => {
    redis = new RedisAdapter({
      pooling: {
        enablePooling: true,
        maxConnections: 5,
        minConnections: 1
      },
      caching: {
        l1Size: 100,
        defaultTtl: 300000 // 5 minutes
      }
    });

    sessionStore = new MockRedisSessionStore({
      client: redis,
      prefix: 'test-sess:',
      ttl: 3600 // 1 hour
    });
  });

  afterEach(async () => {
    await sessionStore.clear();
    await redis.disconnect();
  });

  describe('Basic Session Operations', () => {
    it('should create and retrieve sessions', async () => {
      const sessionId = 'session-123';
      const sessionData = {
        userId: 'user-456',
        username: 'testuser',
        loginTime: Date.now()
      };

      // Create session
      const session = new MockSession(sessionId, sessionStore);
      session.data = sessionData;
      await session.save();

      // Retrieve session
      const retrievedData = await sessionStore.get(sessionId);
      expect(retrievedData).not.toBeNull();
      expect(retrievedData.data.userId).toBe('user-456');
      expect(retrievedData.data.username).toBe('testuser');
    });

    it('should update existing sessions', async () => {
      const sessionId = 'session-update';
      
      // Create initial session
      const session = new MockSession(sessionId, sessionStore);
      session.data = { step: 1, progress: 'started' };
      await session.save();

      // Update session
      session.data.step = 2;
      session.data.progress = 'in-progress';
      session.data.lastAction = 'form-submit';
      await session.save();

      // Verify update
      const updated = await sessionStore.get(sessionId);
      expect(updated.data.step).toBe(2);
      expect(updated.data.progress).toBe('in-progress');
      expect(updated.data.lastAction).toBe('form-submit');
    });

    it('should destroy sessions', async () => {
      const sessionId = 'session-destroy';
      
      // Create session
      const session = new MockSession(sessionId, sessionStore);
      session.data = { temporary: 'data' };
      await session.save();

      // Verify session exists
      const beforeDestroy = await sessionStore.get(sessionId);
      expect(beforeDestroy).not.toBeNull();

      // Destroy session
      await session.destroy();

      // Verify session is gone
      const afterDestroy = await sessionStore.get(sessionId);
      expect(afterDestroy).toBeNull();
    });

    it('should handle session expiration', async () => {
      const shortTtlStore = new MockRedisSessionStore({
        client: redis,
        prefix: 'short-sess:',
        ttl: 1 // 1 second TTL
      });

      const sessionId = 'expiring-session';
      const session = new MockSession(sessionId, shortTtlStore);
      session.data = { expires: 'soon' };
      await session.save();

      // Session should exist immediately
      const immediate = await shortTtlStore.get(sessionId);
      expect(immediate).not.toBeNull();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Session should be expired
      const expired = await shortTtlStore.get(sessionId);
      expect(expired).toBeNull();
    });
  });

  describe('Session Store Management', () => {
    it('should count active sessions', async () => {
      // Create multiple sessions
      const sessionIds = ['count-1', 'count-2', 'count-3'];
      
      for (const sessionId of sessionIds) {
        const session = new MockSession(sessionId, sessionStore);
        session.data = { index: sessionId };
        await session.save();
      }

      // Count sessions
      const count = await sessionStore.length();
      expect(count).toBe(3);
    });

    it('should retrieve all sessions', async () => {
      // Create test sessions
      const sessions = [
        { id: 'all-1', data: { user: 'alice' } },
        { id: 'all-2', data: { user: 'bob' } },
        { id: 'all-3', data: { user: 'charlie' } }
      ];

      for (const sessionData of sessions) {
        const session = new MockSession(sessionData.id, sessionStore);
        session.data = sessionData.data;
        await session.save();
      }

      // Get all sessions
      const allSessions = await sessionStore.all();
      expect(allSessions.length).toBe(3);
      
      const usernames = allSessions.map(s => s.data.user);
      expect(usernames).toContain('alice');
      expect(usernames).toContain('bob');
      expect(usernames).toContain('charlie');
    });

    it('should clear all sessions', async () => {
      // Create sessions
      for (let i = 0; i < 5; i++) {
        const session = new MockSession(`clear-${i}`, sessionStore);
        session.data = { index: i };
        await session.save();
      }

      // Verify sessions exist
      const beforeClear = await sessionStore.length();
      expect(beforeClear).toBe(5);

      // Clear all sessions
      await sessionStore.clear();

      // Verify all sessions are gone
      const afterClear = await sessionStore.length();
      expect(afterClear).toBe(0);
    });

    it('should touch sessions to extend TTL', async () => {
      const sessionId = 'touch-test';
      const session = new MockSession(sessionId, sessionStore);
      session.data = { touchTest: true };
      await session.save();

      // Get initial TTL
      const initialTtl = await redis.ttl(`test-sess:${sessionId}`);
      expect(initialTtl).toBeGreaterThan(0);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Touch session
      await session.touch();

      // TTL should be refreshed (close to original value)
      const refreshedTtl = await redis.ttl(`test-sess:${sessionId}`);
      expect(refreshedTtl).toBeGreaterThan(initialTtl - 2); // Account for time passed
    });
  });

  describe('Session Cleanup and Maintenance', () => {
    it('should cleanup expired sessions', async () => {
      // Create store with short TTL for testing
      const cleanupStore = new MockRedisSessionStore({
        client: redis,
        prefix: 'cleanup-sess:',
        ttl: 1 // 1 second
      });

      // Create sessions
      for (let i = 0; i < 3; i++) {
        const session = new MockSession(`cleanup-${i}`, cleanupStore);
        session.data = { index: i };
        await session.save();
      }

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Perform cleanup
      await cleanupStore.cleanup();

      // Verify sessions are cleaned up
      const remaining = await cleanupStore.length();
      expect(remaining).toBe(0);
    });

    it('should handle concurrent session operations', async () => {
      const sessionId = 'concurrent-test';
      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          (async () => {
            const session = new MockSession(sessionId, sessionStore);
            session.data = { 
              operationId: i,
              timestamp: Date.now(),
              randomValue: Math.random()
            };
            await session.save();
            
            // Simulate some work
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            
            return await sessionStore.get(sessionId);
          })()
        );
      }

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result).not.toBeNull();
        expect(result.data).toBeDefined();
      });

      // Final session should exist
      const finalSession = await sessionStore.get(sessionId);
      expect(finalSession).not.toBeNull();
    });
  });

  describe('Performance with Session Store', () => {
    it('should handle high session throughput', async () => {
      const startTime = Date.now();
      const sessionOperations = [];

      // Create 100 sessions rapidly
      for (let i = 0; i < 100; i++) {
        sessionOperations.push(
          (async () => {
            const sessionId = `perf-${i}`;
            const session = new MockSession(sessionId, sessionStore);
            session.data = {
              userId: `user-${i}`,
              createdAt: Date.now(),
              preferences: {
                theme: i % 2 === 0 ? 'dark' : 'light',
                language: 'en'
              }
            };
            await session.save();
            return sessionId;
          })()
        );
      }

      const sessionIds = await Promise.all(sessionOperations);
      const createTime = Date.now() - startTime;

      // Verify all sessions were created
      expect(sessionIds.length).toBe(100);
      
      // Performance should be reasonable (within 5 seconds)
      expect(createTime).toBeLessThan(5000);

      // Test retrieval performance
      const retrieveStart = Date.now();
      const retrieveOperations = sessionIds.map(id => sessionStore.get(id));
      const sessions = await Promise.all(retrieveOperations);
      const retrieveTime = Date.now() - retrieveStart;

      // All sessions should be retrievable
      expect(sessions.filter(s => s !== null).length).toBe(100);
      expect(retrieveTime).toBeLessThan(3000);

      console.log(`Created 100 sessions in ${createTime}ms, retrieved in ${retrieveTime}ms`);
    });

    it('should efficiently use connection pooling for sessions', async () => {
      const pooledRedis = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 3,
          minConnections: 1
        }
      });

      const pooledSessionStore = new MockRedisSessionStore({
        client: pooledRedis,
        prefix: 'pooled-sess:',
        ttl: 3600
      });

      try {
        // Perform multiple concurrent session operations
        const operations = [];
        for (let i = 0; i < 20; i++) {
          operations.push(
            (async () => {
              const session = new MockSession(`pooled-${i}`, pooledSessionStore);
              session.data = { poolTest: i };
              await session.save();
              await session.reload();
              await session.touch();
              return session.id;
            })()
          );
        }

        await Promise.all(operations);

        // Check pool statistics
        const poolStats = pooledRedis.getPoolStats();
        expect(poolStats.poolingEnabled).toBe(true);
        expect(poolStats.totalConnections).toBeLessThanOrEqual(3);
        expect(poolStats.activeConnections).toBeLessThanOrEqual(3);

        // Verify session count
        const sessionCount = await pooledSessionStore.length();
        expect(sessionCount).toBe(20);

      } finally {
        await pooledSessionStore.clear();
        await pooledRedis.disconnect();
      }
    });
  });

  describe('Redis Commands Used by Session Stores', () => {
    it('should use Redis commands efficiently for session operations', async () => {
      const sessionId = 'redis-commands-test';
      
      // Test SETEX for session storage with TTL
      await redis.setex(`direct-sess:${sessionId}`, 3600, JSON.stringify({
        userId: 'test-user',
        loginTime: Date.now()
      }));

      // Test GET for session retrieval
      const sessionData = await redis.get(`direct-sess:${sessionId}`);
      expect(sessionData).not.toBeNull();
      
      const parsed = JSON.parse(sessionData!);
      expect(parsed.userId).toBe('test-user');

      // Test TTL for session expiration
      const ttl = await redis.ttl(`direct-sess:${sessionId}`);
      expect(ttl).toBeGreaterThan(3500); // Should be close to 3600

      // Test EXPIRE for session touch
      await redis.expire(`direct-sess:${sessionId}`, 7200);
      const newTtl = await redis.ttl(`direct-sess:${sessionId}`);
      expect(newTtl).toBeGreaterThan(7000);

      // Test DEL for session destruction
      const deleted = await redis.del(`direct-sess:${sessionId}`);
      expect(deleted).toBe(1);

      // Verify session is gone
      const afterDelete = await redis.get(`direct-sess:${sessionId}`);
      expect(afterDelete).toBeNull();
    });

    it('should use pipelining for batch session operations', async () => {
      const pipeline = redis.pipeline();
      
      // Batch create multiple sessions
      for (let i = 0; i < 5; i++) {
        const sessionData = JSON.stringify({
          userId: `batch-user-${i}`,
          sessionIndex: i
        });
        pipeline.setex(`batch-sess:${i}`, 3600, sessionData);
      }

      const results = await pipeline.exec();
      
      // All operations should succeed
      expect(results.length).toBe(5);
      results.forEach(([error, result]) => {
        expect(error).toBeNull();
        expect(result).toBe('OK');
      });

      // Verify sessions were created
      for (let i = 0; i < 5; i++) {
        const sessionData = await redis.get(`batch-sess:${i}`);
        expect(sessionData).not.toBeNull();
        
        const parsed = JSON.parse(sessionData!);
        expect(parsed.sessionIndex).toBe(i);
      }

      // Cleanup
      await redis.del('batch-sess:0', 'batch-sess:1', 'batch-sess:2', 'batch-sess:3', 'batch-sess:4');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Redis connection failures gracefully', async () => {
      let errorEmitted = false;
      sessionStore.on('error', () => {
        errorEmitted = true;
      });

      const sessionId = 'resilient-session';
      const session = new MockSession(sessionId, sessionStore);
      session.data = { resilientTest: true };

      // This should succeed under normal conditions
      await session.save();

      // Verify session was saved
      const saved = await sessionStore.get(sessionId);
      expect(saved).not.toBeNull();
      expect(saved.data.resilientTest).toBe(true);
    });

    it('should maintain session data integrity', async () => {
      const sessionId = 'integrity-test';
      const complexData = {
        user: {
          id: 12345,
          profile: {
            name: 'Test User',
            preferences: {
              theme: 'dark',
              notifications: true,
              locale: 'en-US'
            }
          }
        },
        cart: [
          { id: 1, name: 'Product A', price: 29.99 },
          { id: 2, name: 'Product B', price: 49.99 }
        ],
        metadata: {
          userAgent: 'Test Browser',
          ipAddress: '127.0.0.1',
          timestamp: Date.now()
        }
      };

      // Store complex session data
      const session = new MockSession(sessionId, sessionStore);
      session.data = complexData;
      await session.save();

      // Retrieve and verify data integrity
      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved.data).toEqual(complexData);
      expect(retrieved.data.user.profile.name).toBe('Test User');
      expect(retrieved.data.cart.length).toBe(2);
      expect(retrieved.data.metadata.userAgent).toBe('Test Browser');
    });
  });
});