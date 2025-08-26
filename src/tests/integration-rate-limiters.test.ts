/**
 * Integration Tests with Rate Limiters and Distributed Locks
 */

import { RedisAdapter } from '../adapters/RedisAdapter';

// Mock Token Bucket Rate Limiter
class MockRateLimiter {
  constructor(private redis: any, private capacity: number, private refillRate: number) {}

  async isAllowed(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `rate_limit:${identifier}`;
    const tokens = await this.redis.get(key) || this.capacity;
    
    if (tokens > 0) {
      await this.redis.setex(key, 60, tokens - 1);
      return { allowed: true, remaining: tokens - 1 };
    }
    
    return { allowed: false, remaining: 0 };
  }

  async reset(identifier: string): Promise<void> {
    await this.redis.del(`rate_limit:${identifier}`);
  }
}

// Mock Distributed Lock
class MockDistributedLock {
  constructor(private redis: any, private ttl: number = 10000) {}

  async acquire(resource: string): Promise<{ success: boolean; lockValue?: string }> {
    const key = `lock:${resource}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    
    const result = await this.redis.set(key, lockValue, 'PX', this.ttl, 'NX');
    
    return {
      success: result === 'OK',
      lockValue: result === 'OK' ? lockValue : undefined
    };
  }

  async release(resource: string, lockValue: string): Promise<boolean> {
    const key = `lock:${resource}`;
    const currentValue = await this.redis.get(key);
    
    if (currentValue === lockValue) {
      const deleted = await this.redis.del(key);
      return deleted > 0;
    }
    
    return false;
  }

  async isLocked(resource: string): Promise<boolean> {
    const key = `lock:${resource}`;
    const value = await this.redis.get(key);
    return value !== null;
  }
}

describe('Rate Limiters and Distributed Locks Integration Tests', () => {
  let redis: RedisAdapter;

  beforeEach(async () => {
    redis = new RedisAdapter({
      pooling: {
        enablePooling: true,
        maxConnections: 5
      }
    });
  });

  afterEach(async () => {
    await redis.disconnect();
  });

  describe('Rate Limiter', () => {
    let rateLimiter: MockRateLimiter;

    beforeEach(() => {
      rateLimiter = new MockRateLimiter(redis, 10, 2);
    });

    it('should allow requests within limit', async () => {
      const user = 'test-user';
      
      // Should allow initial requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.isAllowed(user);
        expect(result.allowed).toBe(true);
      }

      await rateLimiter.reset(user);
    });

    it('should deny requests over limit', async () => {
      const user = 'limit-test-user';
      
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await rateLimiter.isAllowed(user);
      }
      
      // Next request should be denied
      const result = await rateLimiter.isAllowed(user);
      expect(result.allowed).toBe(false);

      await rateLimiter.reset(user);
    });

    it('should handle multiple users independently', async () => {
      const user1 = 'user1';
      const user2 = 'user2';
      
      // Consume tokens for user1
      for (let i = 0; i < 10; i++) {
        await rateLimiter.isAllowed(user1);
      }
      
      // user1 should be denied, user2 should be allowed
      const denied = await rateLimiter.isAllowed(user1);
      const allowed = await rateLimiter.isAllowed(user2);
      
      expect(denied.allowed).toBe(false);
      expect(allowed.allowed).toBe(true);

      await rateLimiter.reset(user1);
      await rateLimiter.reset(user2);
    });
  });

  describe('Distributed Lock', () => {
    let distributedLock: MockDistributedLock;

    beforeEach(() => {
      distributedLock = new MockDistributedLock(redis, 5000);
    });

    it('should acquire and release locks', async () => {
      const resource = 'test-resource';
      
      // Acquire lock
      const acquired = await distributedLock.acquire(resource);
      expect(acquired.success).toBe(true);
      expect(acquired.lockValue).toBeDefined();
      
      // Verify lock is held
      const isLocked = await distributedLock.isLocked(resource);
      expect(isLocked).toBe(true);
      
      // Release lock
      const released = await distributedLock.release(resource, acquired.lockValue!);
      expect(released).toBe(true);
      
      // Verify lock is released
      const isLockedAfter = await distributedLock.isLocked(resource);
      expect(isLockedAfter).toBe(false);
    });

    it('should prevent concurrent access', async () => {
      const resource = 'concurrent-resource';
      
      // First acquisition should succeed
      const lock1 = await distributedLock.acquire(resource);
      expect(lock1.success).toBe(true);
      
      // Second acquisition should fail
      const lock2 = await distributedLock.acquire(resource);
      expect(lock2.success).toBe(false);
      
      // Release first lock
      await distributedLock.release(resource, lock1.lockValue!);
      
      // Now second acquisition should succeed
      const lock3 = await distributedLock.acquire(resource);
      expect(lock3.success).toBe(true);
      
      await distributedLock.release(resource, lock3.lockValue!);
    });

    it('should handle lock expiration', async () => {
      const shortLock = new MockDistributedLock(redis, 500); // 500ms TTL
      const resource = 'expiring-resource';
      
      // Acquire lock
      const acquired = await shortLock.acquire(resource);
      expect(acquired.success).toBe(true);
      
      // Should be locked immediately
      const immediate = await shortLock.isLocked(resource);
      expect(immediate).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Should be expired
      const expired = await shortLock.isLocked(resource);
      expect(expired).toBe(false);
    });

    it('should not allow release with wrong value', async () => {
      const resource = 'secure-resource';
      
      const acquired = await distributedLock.acquire(resource);
      expect(acquired.success).toBe(true);
      
      // Try to release with wrong value
      const wrongRelease = await distributedLock.release(resource, 'wrong-value');
      expect(wrongRelease).toBe(false);
      
      // Lock should still be held
      const stillLocked = await distributedLock.isLocked(resource);
      expect(stillLocked).toBe(true);
      
      // Release with correct value
      const correctRelease = await distributedLock.release(resource, acquired.lockValue!);
      expect(correctRelease).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent rate limit checks', async () => {
      const rateLimiter = new MockRateLimiter(redis, 50, 10);
      
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(rateLimiter.isAllowed(`user-${i % 10}`));
      }
      
      const results = await Promise.all(operations);
      expect(results.length).toBe(100);
      
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBeGreaterThan(0);

      // Cleanup
      for (let i = 0; i < 10; i++) {
        await rateLimiter.reset(`user-${i}`);
      }
    });

    it('should handle concurrent lock operations', async () => {
      const distributedLock = new MockDistributedLock(redis);
      const resource = 'concurrent-test';
      
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(
          (async () => {
            const acquired = await distributedLock.acquire(resource);
            if (acquired.success) {
              await new Promise(resolve => setTimeout(resolve, 10));
              await distributedLock.release(resource, acquired.lockValue!);
              return true;
            }
            return false;
          })()
        );
      }
      
      const results = await Promise.all(operations);
      const successCount = results.filter(r => r).length;
      
      expect(successCount).toBeGreaterThan(0);
      expect(successCount).toBeLessThan(20); // Not all should succeed due to contention
    });
  });

  describe('Integration with Connection Pooling', () => {
    it('should work with pooled connections', async () => {
      const pooledRedis = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 3
        }
      });

      try {
        const rateLimiter = new MockRateLimiter(pooledRedis, 20, 5);
        
        // Perform operations using pooled connections
        const operations = [];
        for (let i = 0; i < 30; i++) {
          operations.push(rateLimiter.isAllowed(`pooled-user-${i % 5}`));
        }

        const results = await Promise.all(operations);
        expect(results.length).toBe(30);

        // Check pool statistics
        const poolStats = pooledRedis.getPoolStats();
        expect(poolStats.poolingEnabled).toBe(true);
        expect(poolStats.totalConnections).toBeLessThanOrEqual(3);

        // Cleanup
        for (let i = 0; i < 5; i++) {
          await rateLimiter.reset(`pooled-user-${i}`);
        }
      } finally {
        await pooledRedis.disconnect();
      }
    });
  });
});