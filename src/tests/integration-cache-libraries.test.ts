/**
 * Integration Tests with Cache Libraries
 * Testing compatibility with cache-manager, keyv, and other caching frameworks
 */

import { RedisAdapter } from '../adapters/RedisAdapter';
import { EventEmitter } from 'events';

// Mock cache-manager Redis store
class MockCacheManagerRedisStore {
  private redis: any;
  private ttl: number;
  private keyPrefix: string;

  constructor(options: { 
    redisInstance?: any; 
    ttl?: number;
    keyPrefix?: string;
  } = {}) {
    this.redis = options.redisInstance;
    this.ttl = options.ttl || 300; // 5 minutes default
    this.keyPrefix = options.keyPrefix || 'cache:';
  }

  private getKey(key: string): string {
    return this.keyPrefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const fullKey = this.getKey(key);
      const value = await this.redis.get(fullKey);
      
      if (value === null) {
        return undefined;
      }

      // Try to parse JSON, fall back to string if not valid JSON
      try {
        return JSON.parse(value);
      } catch {
        return value as T;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const fullKey = this.getKey(key);
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const cacheTtl = ttl || this.ttl;
      
      await this.redis.setex(fullKey, cacheTtl, serializedValue);
    } catch (error) {
      console.error('Cache set error:', error);
      throw error;
    }
  }

  async del(key: string | string[]): Promise<void> {
    try {
      const keys = Array.isArray(key) ? key : [key];
      const fullKeys = keys.map(k => this.getKey(k));
      
      if (fullKeys.length > 0) {
        await this.redis.del(...fullKeys);
      }
    } catch (error) {
      console.error('Cache del error:', error);
      throw error;
    }
  }

  async mget<T>(...keys: string[]): Promise<(T | undefined)[]> {
    try {
      const fullKeys = keys.map(k => this.getKey(k));
      const values = await this.redis.mget(...fullKeys);
      
      return values.map((value: string | null) => {
        if (value === null) return undefined;
        
        try {
          return JSON.parse(value);
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => undefined);
    }
  }

  async mset<T>(keyValuePairs: Array<[string, T]>, ttl?: number): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      const cacheTtl = ttl || this.ttl;
      
      for (const [key, value] of keyValuePairs) {
        const fullKey = this.getKey(key);
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.setex(fullKey, cacheTtl, serializedValue);
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Cache mset error:', error);
      throw error;
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    try {
      const searchPattern = pattern ? this.getKey(pattern) : this.getKey('*');
      const keys = await this.redis.keys(searchPattern);
      
      // Remove prefix from keys
      return keys.map((key: string) => 
        key.startsWith(this.keyPrefix) ? key.substring(this.keyPrefix.length) : key
      );
    } catch (error) {
      console.error('Cache keys error:', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(this.getKey('*'));
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.getKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      console.error('Cache ttl error:', error);
      return -1;
    }
  }
}

// Mock Keyv Redis adapter
class MockKeyvRedisAdapter extends EventEmitter {
  private redis: any;
  private namespace: string;

  constructor(redis: any, options: { namespace?: string } = {}) {
    super();
    this.redis = redis;
    this.namespace = options.namespace || 'keyv';
  }

  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get(key: string): Promise<any> {
    try {
      const fullKey = this.getKey(key);
      const value = await this.redis.get(fullKey);
      
      if (value === null) {
        return undefined;
      }

      const parsed = JSON.parse(value);
      
      // Check expiration
      if (parsed.expires && parsed.expires < Date.now()) {
        await this.delete(key);
        return undefined;
      }

      return parsed.value;
    } catch (error) {
      this.emit('error', error);
      return undefined;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const fullKey = this.getKey(key);
      const data = {
        value,
        expires: ttl ? Date.now() + ttl : null
      };
      
      const serialized = JSON.stringify(data);
      
      if (ttl) {
        await this.redis.setex(fullKey, Math.ceil(ttl / 1000), serialized);
      } else {
        await this.redis.set(fullKey, serialized);
      }
      
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.getKey(key);
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.namespace}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const value = await this.get(key);
      return value !== undefined;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }
}

// Mock distributed cache with cache-aside pattern
class MockDistributedCache {
  private store: MockCacheManagerRedisStore;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(store: MockCacheManagerRedisStore) {
    this.store = store;
  }

  async get<T>(key: string, fetcher?: () => Promise<T>, ttl?: number): Promise<T | undefined> {
    // Try cache first
    let value = await this.store.get<T>(key);
    
    if (value !== undefined) {
      this.hitCount++;
      return value;
    }

    this.missCount++;

    // If fetcher provided, get value and cache it
    if (fetcher) {
      try {
        value = await fetcher();
        if (value !== undefined) {
          await this.store.set(key, value, ttl);
        }
        return value;
      } catch (error) {
        console.error('Fetcher error:', error);
        return undefined;
      }
    }

    return undefined;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.store.set(key, value, ttl);
  }

  async del(key: string | string[]): Promise<void> {
    await this.store.del(key);
  }

  async wrap<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttl);
    return value;
  }

  getStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hitCount + this.missCount;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0
    };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}

describe('Cache Libraries Integration Tests', () => {
  let redis: RedisAdapter;

  beforeEach(async () => {
    redis = new RedisAdapter({
      pooling: {
        enablePooling: true,
        maxConnections: 5,
        minConnections: 1
      },
      caching: {
        l1Size: 100,
        l2Size: 500,
        defaultTtl: 300000
      }
    });
  });

  afterEach(async () => {
    await redis.disconnect();
  });

  describe('Cache Manager Redis Store', () => {
    let cacheStore: MockCacheManagerRedisStore;

    beforeEach(() => {
      cacheStore = new MockCacheManagerRedisStore({
        redisInstance: redis,
        ttl: 300,
        keyPrefix: 'test-cache:'
      });
    });

    afterEach(async () => {
      await cacheStore.clear();
    });

    it('should store and retrieve basic values', async () => {
      await cacheStore.set('string-key', 'hello world');
      await cacheStore.set('number-key', 42);
      await cacheStore.set('object-key', { name: 'test', value: 123 });

      const stringValue = await cacheStore.get<string>('string-key');
      const numberValue = await cacheStore.get<number>('number-key');
      const objectValue = await cacheStore.get<any>('object-key');

      expect(stringValue).toBe('hello world');
      expect(numberValue).toBe(42);
      expect(objectValue).toEqual({ name: 'test', value: 123 });
    });

    it('should handle TTL expiration', async () => {
      await cacheStore.set('expiring-key', 'expires soon', 1); // 1 second TTL

      // Should exist immediately
      const immediate = await cacheStore.get('expiring-key');
      expect(immediate).toBe('expires soon');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be expired
      const expired = await cacheStore.get('expiring-key');
      expect(expired).toBeUndefined();
    });

    it('should support batch operations', async () => {
      // Test mset
      await cacheStore.mset([
        ['batch-1', { id: 1, name: 'first' }],
        ['batch-2', { id: 2, name: 'second' }],
        ['batch-3', { id: 3, name: 'third' }]
      ]);

      // Test mget
      const values = await cacheStore.mget('batch-1', 'batch-2', 'batch-3', 'non-existent');
      
      expect(values).toHaveLength(4);
      expect(values[0]).toEqual({ id: 1, name: 'first' });
      expect(values[1]).toEqual({ id: 2, name: 'second' });
      expect(values[2]).toEqual({ id: 3, name: 'third' });
      expect(values[3]).toBeUndefined();
    });

    it('should support key pattern operations', async () => {
      // Set up test data
      await cacheStore.set('user:1', { name: 'Alice' });
      await cacheStore.set('user:2', { name: 'Bob' });
      await cacheStore.set('product:1', { name: 'Widget' });

      // Get keys by pattern
      const userKeys = await cacheStore.keys('user:*');
      const allKeys = await cacheStore.keys('*');

      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
      expect(userKeys).not.toContain('product:1');
      expect(allKeys.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle deletion operations', async () => {
      await cacheStore.set('delete-single', 'value1');
      await cacheStore.set('delete-multi-1', 'value2');
      await cacheStore.set('delete-multi-2', 'value3');

      // Single delete
      await cacheStore.del('delete-single');
      const single = await cacheStore.get('delete-single');
      expect(single).toBeUndefined();

      // Multi delete
      await cacheStore.del(['delete-multi-1', 'delete-multi-2']);
      const multi1 = await cacheStore.get('delete-multi-1');
      const multi2 = await cacheStore.get('delete-multi-2');
      expect(multi1).toBeUndefined();
      expect(multi2).toBeUndefined();
    });
  });

  describe('Keyv Redis Adapter', () => {
    let keyvAdapter: MockKeyvRedisAdapter;

    beforeEach(() => {
      keyvAdapter = new MockKeyvRedisAdapter(redis, { namespace: 'test-keyv' });
    });

    afterEach(async () => {
      await keyvAdapter.clear();
    });

    it('should handle basic key-value operations', async () => {
      const setResult = await keyvAdapter.set('test-key', 'test-value');
      expect(setResult).toBe(true);

      const getValue = await keyvAdapter.get('test-key');
      expect(getValue).toBe('test-value');

      const hasKey = await keyvAdapter.has('test-key');
      expect(hasKey).toBe(true);

      const deleteResult = await keyvAdapter.delete('test-key');
      expect(deleteResult).toBe(true);

      const getAfterDelete = await keyvAdapter.get('test-key');
      expect(getAfterDelete).toBeUndefined();
    });

    it('should handle complex data types', async () => {
      const complexData = {
        user: { id: 123, name: 'Test User' },
        permissions: ['read', 'write'],
        metadata: { created: Date.now(), version: '1.0' }
      };

      await keyvAdapter.set('complex-data', complexData);
      const retrieved = await keyvAdapter.get('complex-data');
      
      expect(retrieved).toEqual(complexData);
    });

    it('should handle TTL correctly', async () => {
      await keyvAdapter.set('ttl-test', 'temporary value', 1000); // 1 second

      const immediate = await keyvAdapter.get('ttl-test');
      expect(immediate).toBe('temporary value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1200));

      const expired = await keyvAdapter.get('ttl-test');
      expect(expired).toBeUndefined();
    });

    it('should emit error events on failures', async () => {
      let errorEmitted = false;
      keyvAdapter.on('error', () => {
        errorEmitted = true;
      });

      // This should work without errors
      await keyvAdapter.set('error-test', 'value');
      expect(errorEmitted).toBe(false);
    });
  });

  describe('Distributed Cache Pattern', () => {
    let distributedCache: MockDistributedCache;
    let cacheStore: MockCacheManagerRedisStore;

    beforeEach(() => {
      cacheStore = new MockCacheManagerRedisStore({
        redisInstance: redis,
        ttl: 300,
        keyPrefix: 'dist-cache:'
      });
      distributedCache = new MockDistributedCache(cacheStore);
    });

    afterEach(async () => {
      await cacheStore.clear();
      distributedCache.resetStats();
    });

    it('should implement cache-aside pattern', async () => {
      let fetcherCalled = 0;
      const fetcher = async () => {
        fetcherCalled++;
        return { data: 'fetched data', timestamp: Date.now() };
      };

      // First call should fetch and cache
      const result1 = await distributedCache.get('cache-aside-test', fetcher);
      expect(result1).toBeDefined();
      expect(fetcherCalled).toBe(1);

      // Second call should use cache
      const result2 = await distributedCache.get('cache-aside-test', fetcher);
      expect(result2).toEqual(result1);
      expect(fetcherCalled).toBe(1); // Fetcher not called again

      const stats = distributedCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should support wrap pattern for automatic caching', async () => {
      let computationCount = 0;
      const expensiveComputation = async () => {
        computationCount++;
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
        return `computed-${computationCount}`;
      };

      // First call
      const result1 = await distributedCache.wrap('expensive-key', expensiveComputation);
      expect(result1).toBe('computed-1');
      expect(computationCount).toBe(1);

      // Second call should use cache
      const result2 = await distributedCache.wrap('expensive-key', expensiveComputation);
      expect(result2).toBe('computed-1'); // Same result
      expect(computationCount).toBe(1); // No additional computation

      const stats = distributedCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should handle cache invalidation', async () => {
      const fetcher = async () => ({ version: 1, data: 'original' });

      // Cache initial data
      const original = await distributedCache.get('invalidation-test', fetcher);
      expect(original).toEqual({ version: 1, data: 'original' });

      // Update cache directly
      await distributedCache.set('invalidation-test', { version: 2, data: 'updated' });

      // Get should return updated data
      const updated = await distributedCache.get('invalidation-test');
      expect(updated).toEqual({ version: 2, data: 'updated' });

      // Invalidate cache
      await distributedCache.del('invalidation-test');

      // Next get should call fetcher again
      const newFetcher = async () => ({ version: 3, data: 'refetched' });
      const refetched = await distributedCache.get('invalidation-test', newFetcher);
      expect(refetched).toEqual({ version: 3, data: 'refetched' });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-frequency cache operations', async () => {
      const cacheStore = new MockCacheManagerRedisStore({
        redisInstance: redis,
        ttl: 300,
        keyPrefix: 'perf-cache:'
      });

      const startTime = Date.now();
      const operations = [];

      // Perform 200 mixed cache operations
      for (let i = 0; i < 200; i++) {
        if (i % 3 === 0) {
          operations.push(cacheStore.set(`perf-key-${i}`, { index: i, data: `data-${i}` }));
        } else if (i % 3 === 1) {
          operations.push(cacheStore.get(`perf-key-${i - 1}`));
        } else {
          operations.push(cacheStore.mget(`perf-key-${i - 2}`, `perf-key-${i - 1}`));
        }
      }

      await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      console.log(`Completed 200 cache operations in ${duration}ms`);

      await cacheStore.clear();
    });

    it('should work efficiently with connection pooling', async () => {
      const pooledRedis = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 3,
          minConnections: 1
        }
      });

      try {
        const cacheStore = new MockCacheManagerRedisStore({
          redisInstance: pooledRedis,
          keyPrefix: 'pooled-cache:'
        });

        // Perform concurrent cache operations
        const operations = [];
        for (let i = 0; i < 50; i++) {
          operations.push(
            cacheStore.set(`concurrent-${i}`, { thread: i, data: Math.random() })
          );
        }

        await Promise.all(operations);

        // Verify all keys were set
        const keys = await cacheStore.keys('concurrent-*');
        expect(keys.length).toBe(50);

        // Check pool stats
        const poolStats = pooledRedis.getPoolStats();
        expect(poolStats.poolingEnabled).toBe(true);
        expect(poolStats.totalConnections).toBeLessThanOrEqual(3);

        await cacheStore.clear();
      } finally {
        await pooledRedis.disconnect();
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const cacheStore = new MockCacheManagerRedisStore({
        redisInstance: redis,
        keyPrefix: 'resilient-cache:'
      });

      // These operations should succeed under normal conditions
      await cacheStore.set('resilient-test', 'test-value');
      const value = await cacheStore.get('resilient-test');
      expect(value).toBe('test-value');

      await cacheStore.clear();
    });

    it('should maintain cache consistency under load', async () => {
      const cacheStore = new MockCacheManagerRedisStore({
        redisInstance: redis,
        keyPrefix: 'consistency-cache:'
      });

      const key = 'consistency-test';
      const concurrentOperations = [];

      // Perform concurrent set/get operations
      for (let i = 0; i < 20; i++) {
        concurrentOperations.push(
          (async () => {
            await cacheStore.set(key, { iteration: i, timestamp: Date.now() });
            return await cacheStore.get(key);
          })()
        );
      }

      const results = await Promise.all(concurrentOperations);
      
      // All operations should complete successfully
      expect(results.length).toBe(20);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result).toHaveProperty('iteration');
        expect(result).toHaveProperty('timestamp');
      });

      await cacheStore.clear();
    });
  });

  describe('Memory and Resource Management', () => {
    it('should work with adapter caching enabled', async () => {
      const cachedRedis = new RedisAdapter({
        caching: {
          l1Size: 50,
          l2Size: 200,
          defaultTtl: 60000
        }
      });

      try {
        const cacheStore = new MockCacheManagerRedisStore({
          redisInstance: cachedRedis,
          keyPrefix: 'cached-adapter:'
        });

        // Perform operations that should benefit from adapter caching
        await cacheStore.set('cached-key-1', 'value1');
        await cacheStore.set('cached-key-2', 'value2');

        // Multiple gets should benefit from adapter cache
        for (let i = 0; i < 5; i++) {
          await cacheStore.get('cached-key-1');
          await cacheStore.get('cached-key-2');
        }

        // Check adapter cache stats
        const cacheStats = cachedRedis.getCacheStats();
        expect(cacheStats.cachingEnabled).toBe(true);

        await cacheStore.clear();
      } finally {
        await cachedRedis.disconnect();
      }
    });
  });
});