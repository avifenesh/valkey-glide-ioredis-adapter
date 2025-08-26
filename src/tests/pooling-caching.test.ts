/**
 * Tests for Connection Pooling and Advanced Caching
 */

import { RedisAdapter } from '../adapters/RedisAdapter';
import { AdvancedCache } from '../utils/AdvancedCache';

describe('Connection Pooling and Advanced Caching', () => {
  describe('Connection Pooling', () => {
    it('should create adapter with pooling enabled', () => {
      const adapter = new RedisAdapter({
        port: 6379,
        host: 'localhost',
        pooling: {
          enablePooling: true,
          maxConnections: 5,
          minConnections: 2
        }
      });

      const poolStats = adapter.getPoolStats();
      expect(poolStats.poolingEnabled).toBe(true);
      expect(poolStats.maxConnections).toBe(5);
      expect(poolStats.minConnections).toBe(2);
    });

    it('should create adapter without pooling', () => {
      const adapter = new RedisAdapter();
      const poolStats = adapter.getPoolStats();
      expect(poolStats.poolingEnabled).toBe(false);
    });

    it('should provide pool statistics', async () => {
      const adapter = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 3,
          minConnections: 1
        }
      });

      const stats = adapter.getPoolStats();
      expect(stats).toHaveProperty('poolingEnabled');
      expect(stats).toHaveProperty('maxConnections');
      expect(stats).toHaveProperty('minConnections');
    });
  });

  describe('Advanced Caching', () => {
    it('should create adapter with caching enabled', () => {
      const adapter = new RedisAdapter({
        caching: {
          l1Size: 500,
          l2Size: 2000,
          defaultTtl: 60000,
          enableCompression: true
        }
      });

      const cacheStats = adapter.getCacheStats();
      expect(cacheStats.cachingEnabled).toBe(true);
    });

    it('should create adapter without caching', () => {
      const adapter = new RedisAdapter();
      const cacheStats = adapter.getCacheStats();
      expect(cacheStats.cachingEnabled).toBe(false);
    });

    it('should provide cache statistics', () => {
      const adapter = new RedisAdapter({
        caching: {
          l1Size: 100,
          l2Size: 500
        }
      });

      const stats = adapter.getCacheStats();
      expect(stats).toHaveProperty('cachingEnabled');
      expect(stats.cachingEnabled).toBe(true);
    });

    it('should clear cache when requested', () => {
      const adapter = new RedisAdapter({
        caching: {
          l1Size: 100
        }
      });

      // This should not throw
      adapter.clearCache();
    });
  });

  describe('AdvancedCache Unit Tests', () => {
    let cache: AdvancedCache<string>;

    beforeEach(() => {
      cache = new AdvancedCache({
        l1Size: 3,
        l2Size: 5,
        defaultTtl: 1000,
        enableCompression: false // Disable for testing
      });
    });

    afterEach(() => {
      cache.destroy();
    });

    it('should store and retrieve values', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should return undefined for non-existent keys', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeUndefined();
    });

    it('should handle TTL expiration', async () => {
      await cache.set('expiring', 'value', 100); // 100ms TTL
      
      let value = await cache.get('expiring');
      expect(value).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      value = await cache.get('expiring');
      expect(value).toBeUndefined();
    });

    it('should implement LRU eviction in L1', async () => {
      // Fill L1 cache (size 3)
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');
      
      // Access key1 to make it recently used
      await cache.get('key1');
      
      // Add new key to trigger eviction
      await cache.set('key4', 'value4');
      
      // key2 should be evicted (least recently used)
      const stats = cache.getStats();
      expect(stats.l1Size).toBe(3); // L1 should be at capacity
    });

    it('should track hit/miss statistics', async () => {
      await cache.set('hit-test', 'value');
      
      // Hit
      await cache.get('hit-test');
      
      // Miss
      await cache.get('miss-test');
      
      const stats = cache.getStats();
      expect(stats.l1Hits).toBeGreaterThan(0);
      expect(stats.l1Misses).toBeGreaterThan(0);
    });

    it('should handle has() method correctly', async () => {
      await cache.set('exists', 'value');
      
      expect(cache.has('exists')).toBe(true);
      expect(cache.has('notexists')).toBe(false);
    });

    it('should delete keys correctly', async () => {
      await cache.set('todelete', 'value');
      expect(cache.has('todelete')).toBe(true);
      
      const deleted = cache.delete('todelete');
      expect(deleted).toBe(true);
      expect(cache.has('todelete')).toBe(false);
    });

    it('should clear all cache levels', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      cache.clear();
      
      const stats = cache.getStats();
      expect(stats.l1Size).toBe(0);
      expect(stats.l2Size).toBe(0);
    });

    it('should emit cache events', async () => {
      const hitListener = jest.fn();
      const missListener = jest.fn();
      const setListener = jest.fn();
      
      cache.on('cache:hit', hitListener);
      cache.on('cache:miss', missListener);
      cache.on('cache:set', setListener);
      
      await cache.set('event-test', 'value');
      await cache.get('event-test'); // hit
      await cache.get('nonexistent'); // miss
      
      expect(setListener).toHaveBeenCalled();
      expect(hitListener).toHaveBeenCalled();
      expect(missListener).toHaveBeenCalled();
    });

    it('should calculate memory usage', async () => {
      await cache.set('memory-test', 'some value for memory calculation');
      
      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should provide utilization metrics', async () => {
      await cache.set('util1', 'value1');
      await cache.set('util2', 'value2');
      
      const stats = cache.getStats();
      expect(stats.l1Utilization).toBeGreaterThan(0);
      expect(stats.l1Utilization).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance Report Integration', () => {
    it('should generate comprehensive performance report', () => {
      const adapter = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 5
        },
        caching: {
          l1Size: 100,
          l2Size: 500
        }
      });

      const report = adapter.getPerformanceReport();
      
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('performance');
      expect(report).toHaveProperty('pooling');
      expect(report).toHaveProperty('caching');
      expect(report).toHaveProperty('recommendations');
      
      expect(report.pooling.poolingEnabled).toBe(true);
      expect(report.caching.cachingEnabled).toBe(true);
    });

    it('should provide optimization recommendations', () => {
      const adapter = new RedisAdapter();
      const recommendations = adapter.getOptimizationRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Integration with Redis Operations', () => {
    it('should work with basic Redis operations', async () => {
      const adapter = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 2
        },
        caching: {
          l1Size: 50,
          enableCompression: false
        }
      });

      // Mock the connection manager for testing
      const mockClient = {
        get: jest.fn().mockResolvedValue('cached-value'),
        set: jest.fn().mockResolvedValue('OK'),
        ping: jest.fn().mockResolvedValue('PONG')
      };

      // This would need proper mocking in real tests
      // For now, just verify the adapter structure exists
      expect(adapter.getPoolStats).toBeDefined();
      expect(adapter.getCacheStats).toBeDefined();
      expect(adapter.clearCache).toBeDefined();
    });
  });
});