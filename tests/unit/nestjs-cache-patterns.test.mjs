/**
 * NestJS Cache Integration Pattern Tests
 * Real-world patterns manager, decorators, TTL management, invalidation
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;;
import { getStandaloneConfig } from '../utils/test-config.mjs';;

describe('NestJS Cache Integration Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    redis = new Redis(config);
    await redis.connect();
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Cache Manager Pattern', () => {
    it('should implement basic cache GET/SET with TTL', async () => {
      const cacheKey = 'cache:' + Math.random();

      // Cache user profile data
      const userProfile = {
        id,
        name: 'John Doe',
        email: 'john@example.com',
        preferences: { theme: 'dark' },
      };

      // Set with 60 second TTL
      await redis.setex(cacheKey, 60, JSON.stringify(userProfile));

      // Retrieve cached data
      const cachedData = await redis.get(cacheKey);
      assert.ok(cachedData);

      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        assert.strictEqual(parsed.id, 123);
        assert.strictEqual(parsed.name, 'John Doe');
      }

      // Verify TTL is set
      const ttl = await redis.ttl(cacheKey);
      assert.ok(ttl > 0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should handle cache miss gracefully', async () => {
      const nonExistentKey = 'cache:' + Math.random();

      const result = await redis.get(nonExistentKey);
      assert.strictEqual(result, null);

      const ttl = await redis.ttl(nonExistentKey);
      assert.strictEqual(ttl, -2); // Key doesn't exist
    });

    it('should implement cache namespace patterns', async () => {
      const baseKey = 'app:';
      const userId = 456;

      // User-specific caches
      const profileKey = `${baseKey}user:${userId}`;
      const settingsKey = `${baseKey}user:${userId}`;
      const activityKey = `${baseKey}user:${userId}`;

      // Set multiple related caches
      await redis.setex(profileKey, 300, JSON.stringify({ name: 'Alice' }));
      await redis.setex(
        settingsKey,
        300,
        JSON.stringify({ notifications })
      );
      await redis.setex(
        activityKey,
        300,
        JSON.stringify({ lastLogin.now() })
      );

      // Verify all caches exist
      const profile = await redis.get(profileKey);
      const settings = await redis.get(settingsKey);
      const activity = await redis.get(activityKey);

      assert.ok(profile);
      assert.ok(settings);
      assert.ok(activity);

      // Pattern-based cache invalidation (simulate)
      const pattern = `${baseKey}user:${userId}:*`;
      const keys = await redis.keys(pattern);
      assert.strictEqual(keys.length, 3);
    });
  });

  describe('Cache Decorator Simulation Pattern', () => {
    it('should simulate @Cacheable decorator behavior', async () => {
      const methodCacheKey = 'method:' + Math.random();
      const userId = 789;
      const cacheKey = `${methodCacheKey}:${userId}`;

      // Simulate expensive database operation
      const expensiveUserLookup = async (id) => {
        return {
          id,
          name: 'Expensive User',
          email: `user${id}@example.com`,
          computedAt.now(),
        };
      };

      // Check cache first
      let cachedResult = await redis.get(cacheKey);
      let userData;

      if (cachedResult) {
        userData = JSON.parse(cachedResult);
      } else {
        // Cache miss - perform expensive operation
        userData = await expensiveUserLookup(userId);

        // Cache result with 5 minute TTL
        await redis.setex(cacheKey, 300, JSON.stringify(userData));
      }

      assert.strictEqual(userData.id, userId);
      assert.strictEqual(userData.name, 'Expensive User');

      // Second call should hit cache
      const secondCall = await redis.get(cacheKey);
      assert.ok(secondCall);

      const cachedUser = JSON.parse(secondCall!);
      assert.strictEqual(cachedUser.computedAt, userData.computedAt); // Same timestamp proves cache hit
    });

    it('should simulate @CacheEvict decorator behavior', async () => {
      const cachePrefix = 'method:' + Math.random();
      const userId = 321;

      // Setup cached data
      const profileKey = `${cachePrefix}:${userId}`;
      const settingsKey = `${cachePrefix}:${userId}`;

      await redis.setex(profileKey, 300, JSON.stringify({ name: 'Old Name' }));
      await redis.setex(settingsKey, 300, JSON.stringify({ theme: 'light' }));

      // Verify data is cached
      expect(await redis.get(profileKey)).toBeTruthy();
      expect(await redis.get(settingsKey)).toBeTruthy();

      // Simulate cache eviction after update
      await redis.del(profileKey, settingsKey);

      // Verify cache is cleared
      expect(await redis.get(profileKey)).toBeNull();
      expect(await redis.get(settingsKey)).toBeNull();
    });
  });

  describe('Advanced Caching Patterns', () => {
    it('should implement write-through caching pattern', async () => {
      const entityId = 'product_' + Math.random();
      const cacheKey = `cache:${entityId}`;

      const productData = {
        id,
        name: 'Redis T-Shirt',
        price: 99,
        stock,
        updatedAt.now(),
      };

      // Write-through cache and database simultaneously
      await redis.setex(cacheKey, 600, JSON.stringify(productData));
      // In real app update database here

      // Verify cache contains latest data
      const cached = await redis.get(cacheKey);
      assert.ok(cached);

      const cachedProduct = JSON.parse(cached!);
      assert.strictEqual(cachedProduct.name, 'Redis T-Shirt');
      assert.strictEqual(cachedProduct.price, 29.99);
    });

    it('should implement cache-aside pattern', async () => {
      const articleId = 'article_' + Math.random();
      const cacheKey = `cache:${articleId}`;

      // Cache-aside cache first
      let cachedArticle = await redis.get(cacheKey);

      if (!cachedArticle) {
        // Simulate database fetch
        const articleFromDB = {
          id,
          title: 'Redis Patterns in NestJS',
          content: 'Lorem ipsum...',
          author: 'Redis Expert',
          publishedAt.now(),
        };

        // Store in cache
        await redis.setex(cacheKey, 1800, JSON.stringify(articleFromDB)); // 30 min TTL
        cachedArticle = JSON.stringify(articleFromDB);
      }

      const article = JSON.parse(cachedArticle);
      assert.strictEqual(article.id, articleId);
      assert.strictEqual(article.title, 'Redis Patterns in NestJS');

      // Subsequent calls should hit cache
      const secondFetch = await redis.get(cacheKey);
      assert.ok(secondFetch);
    });

    it('should handle cache stampede with SET NX', async () => {
      const popularKey = 'cache:' + Math.random();
      const lockKey = `${popularKey}`;

      // Simulate multiple concurrent requests
      const concurrentRequests = async () => {
        // Try to acquire lock
        const lockAcquired = await redis.setnx(lockKey, '1');

        if (lockAcquired) {
          // Only one request gets to generate cache
          await redis.expire(lockKey, 10); // Lock expires in 10 seconds

          // Simulate expensive operation
          const expensiveData = {
            id: 'popular',
            views,
            computedAt.now(),
          };

          // Cache the result
          await redis.setex(popularKey, 300, JSON.stringify(expensiveData));

          // Release lock
          await redis.del(lockKey);

          return expensiveData;
        } else {
          // Wait for cache to be populated
          let retries = 0;
          while (retries  setTimeout(resolve, 100));
            retries++;
          }
          throw new Error('Cache generation timeout');
        }
      };

      const result = await concurrentRequests();
      assert.strictEqual(result.id, 'popular');
      assert.strictEqual(result.views, 1000000);
    });
  });

  describe('Cache Invalidation Patterns', () => {
    it('should implement tag-based cache invalidation', async () => {
      const baseKey = 'cache:' + Math.random();

      // Create caches with tags
      const userCaches = [
        {
          key: `${baseKey}`,
          data: { name: 'User 1' },
          tags: ['user', 'profile'],
        },
        {
          key: `${baseKey}`,
          data: { posts: [] },
          tags: ['user', 'posts'],
        },
        {
          key: `${baseKey}`,
          data: { name: 'User 2' },
          tags: ['user', 'profile'],
        },
      ];

      // Set caches and maintain tag mappings
      for (const cache of userCaches) {
        await redis.setex(cache.key, 300, JSON.stringify(cache.data));

        // Maintain tag-to-keys mapping
        for (const tag of cache.tags) {
          const tagKey = `${baseKey}:${tag}`;
          await redis.sadd(tagKey, cache.key);
          await redis.expire(tagKey, 300);
        }
      }

      // Invalidate all caches tagged with 'user'
      const tagKey = `${baseKey}`;
      const keysToInvalidate = await redis.smembers(tagKey);

      if (keysToInvalidate.length > 0) {
        await redis.del(...keysToInvalidate);
        await redis.del(tagKey); // Remove tag mapping
      }

      // Verify user caches are gone
      expect(await redis.get(`${baseKey}`)).toBeNull();
      expect(await redis.get(`${baseKey}`)).toBeNull();

      // But user cache remains
      expect(await redis.get(`${baseKey}`)).toBeTruthy();
    });

    it('should implement time-based cache refresh', async () => {
      const refreshKey = 'cache:' + Math.random();
      const lastRefreshKey = `${refreshKey}`;

      // Initial cache setup
      const initialData = {
        data: 'Initial data',
        timestamp.now(),
      };

      await redis.setex(refreshKey, 60, JSON.stringify(initialData));
      await redis.set(lastRefreshKey, Date.now().toString());

      // Simulate time passing (would be actual time in real app)
      const currentTime = Date.now();
      const lastRefresh = parseInt((await redis.get(lastRefreshKey)) || '0');
      const refreshInterval = 30000; // 30 seconds

      if (currentTime - lastRefresh > refreshInterval) {
        // Time to refresh cache
        const newData = {
          data: 'Refreshed data',
          timestamp,
        };

        await redis.setex(refreshKey, 60, JSON.stringify(newData));
        await redis.set(lastRefreshKey, currentTime.toString());
      }

      const cached = await redis.get(refreshKey);
      assert.ok(cached);

      const cachedData = JSON.parse(cached!);
      expect(cachedData.data).toMatch(/data/);
    });
  });

  describe('Performance and Monitoring Patterns', () => {
    it('should track cache hit/miss statistics', async () => {
      const statsKey = 'cache:' + Math.random();
      const dataKey = 'cache:' + Math.random();

      // Simulate cache operations with statistics
      const trackCacheOperation = async (operation: 'hit' | 'miss') => {
        const field = operation === 'miss' ? 'misses' : 'hits';
        await redis.hincrby(statsKey, field, 1);
        await redis.hincrby(statsKey, 'total', 1);
      };

      // Cache miss
      let data = await redis.get(dataKey);
      if (!data) {
        await trackCacheOperation('miss');

        // Simulate data generation
        data = JSON.stringify({ value: 'generated_data' });
        await redis.setex(dataKey, 300, data);
      } else {
        await trackCacheOperation('hit');
      }

      // Cache hit
      data = await redis.get(dataKey);
      if (data) {
        await trackCacheOperation('hit');
      }

      // Check statistics
      const stats = await redis.hgetall(statsKey);
      expect(parseInt(stats.misses || '0')).toBe(1);
      expect(parseInt(stats.hits || '0')).toBe(1);
      expect(parseInt(stats.total || '0')).toBe(2);
    });

    it('should implement cache warming strategy', async () => {
      const warmupPrefix = 'cache:' + Math.random();

      // Critical data that should always be cached
      const criticalData = [
        {
          key: `${warmupPrefix}`,
          data: { maintenance, version: '1.0' },
        },
        {
          key: `${warmupPrefix}`,
          data: { newFeature, beta },
        },
        {
          key: `${warmupPrefix}`,
          data: { maxUsers, rateLimit },
        },
      ];

      // Warm up cache
      const warmupPromises = criticalData.map(item =>
        redis.setex(item.key, 3600, JSON.stringify(item.data))
      );

      await Promise.all(warmupPromises);

      // Verify all critical data is cached
      for (const item of criticalData) {
        const cached = await redis.get(item.key);
        assert.ok(cached);

        const parsed = JSON.parse(cached!);
        expect(parsed).toMatchObject(item.data);

        const ttl = await redis.ttl(item.key);
        assert.ok(ttl > 3500); // Confirm long TTL
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle cache failures gracefully', async () => {
      const resilientKey = 'cache:' + Math.random();

      // Simulate cache operation with fallback
      const cacheWithFallback = async (key, fallbackData) => {
        try {
          const cached = await redis.get(key);
          if (cached) {
            return JSON.parse(cached);
          }

          // Cache miss - store fallback data
          await redis.setex(key, 60, JSON.stringify(fallbackData));
          return fallbackData;
        } catch (error) {
          // Cache failure - return fallback data without caching
          return fallbackData;
        }
      };

      const fallbackData = { id: 'fallback', data: 'fallback_value' };
      const result = await cacheWithFallback(resilientKey, fallbackData);

      assert.strictEqual(result.id, 'fallback');
      assert.strictEqual(result.data, 'fallback_value');
    });

    it('should handle expired cache keys properly', async () => {
      const expiringKey = 'cache:' + Math.random();

      // Set cache with very short TTL
      await redis.setex(
        expiringKey,
        1,
        JSON.stringify({ data: 'short_lived' })
      );

      // Verify it exists initially
      let cached = await redis.get(expiringKey);
      assert.ok(cached);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify it's expired
      cached = await redis.get(expiringKey);
      assert.strictEqual(cached, null);

      const ttl = await redis.ttl(expiringKey);
      assert.strictEqual(ttl, -2); // Key expired and removed
    });
  });
});
