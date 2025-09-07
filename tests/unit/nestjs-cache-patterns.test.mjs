/**
 * NestJS Cache Integration Pattern Tests
 * Real-world patterns manager, decorators, TTL management, invalidation
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
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('NestJS Cache Integration Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    redis = new Redis(config);

    await redis.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redis.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  afterEach(async () => {
    await redis.quit();
  });

  describe('Cache Manager Pattern', () => {
    test('should implement basic cache GET/SET with TTL', async () => {
      const cacheKey = 'cache:user:profile:' + Math.random();

      // Cache user profile data
      const userProfile = {
        id: 123,
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
      assert.ok(ttl <= 60);
    });

    test('should handle cache miss gracefully', async () => {
      const nonExistentKey = 'cache:missing:' + Math.random();

      const result = await redis.get(nonExistentKey);
      assert.strictEqual(result, null);

      const ttl = await redis.ttl(nonExistentKey);
      assert.strictEqual(ttl, -2); // Key doesn't exist
    });

    test('should implement cache namespace patterns', async () => {
      const baseKey = 'app:cache:';
      const userId = 456;

      // User-specific caches
      const profileKey = `${baseKey}user:${userId}:profile`;
      const settingsKey = `${baseKey}user:${userId}:settings`;
      const activityKey = `${baseKey}user:${userId}:activity`;

      // Set multiple related caches
      await redis.setex(profileKey, 300, JSON.stringify({ name: 'Alice' }));
      await redis.setex(
        settingsKey,
        300,
        JSON.stringify({ notifications: true })
      );
      await redis.setex(
        activityKey,
        300,
        JSON.stringify({ lastLogin: Date.now() })
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
    test('should simulate @Cacheable decorator behavior', async () => {
      const methodCacheKey = 'method:getUserById:' + Math.random();
      const userId = 789;
      const cacheKey = `${methodCacheKey}:${userId}`;

      // Simulate expensive database operation
      const expensiveUserLookup = async id => {
        return {
          id,
          name: 'Expensive User',
          email: `user${id}@example.com`,
          computedAt: Date.now(),
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

      const cachedUser = JSON.parse(secondCall);
      assert.strictEqual(cachedUser.computedAt, userData.computedAt); // Same timestamp proves cache hit
    });

    test('should simulate @CacheEvict decorator behavior', async () => {
      const cachePrefix = 'method:updateUser:' + Math.random();
      const userId = 321;

      // Setup cached data
      const profileKey = `${cachePrefix}:profile:${userId}`;
      const settingsKey = `${cachePrefix}:settings:${userId}`;

      await redis.setex(profileKey, 300, JSON.stringify({ name: 'Old Name' }));
      await redis.setex(settingsKey, 300, JSON.stringify({ theme: 'light' }));

      // Verify data is cached
      assert.ok(await redis.get(profileKey));
      assert.ok(await redis.get(settingsKey));

      // Simulate cache eviction after update
      await redis.del(profileKey, settingsKey);

      // Verify cache is cleared
      assert.strictEqual(await redis.get(profileKey), null);
      assert.strictEqual(await redis.get(settingsKey), null);
    });
  });

  describe('Advanced Caching Patterns', () => {
    test('should implement write-through caching pattern', async () => {
      const entityId = 'product_' + Math.random();
      const cacheKey = `cache:product:${entityId}`;

      const productData = {
        id: entityId,
        name: 'Redis T-Shirt',
        price: 29.99,
        stock: 100,
        updatedAt: Date.now(),
      };

      // Write-through cache and database simultaneously
      await redis.setex(cacheKey, 600, JSON.stringify(productData));
      // In real app: also update database here

      // Verify cache contains latest data
      const cached = await redis.get(cacheKey);
      assert.ok(cached);

      const cachedProduct = JSON.parse(cached);
      assert.strictEqual(cachedProduct.name, 'Redis T-Shirt');
      assert.strictEqual(cachedProduct.price, 29.99);
    });

    test('should implement cache-aside pattern', async () => {
      const articleId = 'article_' + Math.random();
      const cacheKey = `cache:article:${articleId}`;

      // Cache-aside cache first
      let cachedArticle = await redis.get(cacheKey);

      if (!cachedArticle) {
        // Simulate database fetch
        const articleFromDB = {
          id: articleId,
          title: 'Redis Patterns in NestJS',
          content: 'Lorem ipsum...',
          author: 'Redis Expert',
          publishedAt: Date.now(),
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

    test('should handle cache stampede with SET NX', async () => {
      const popularKey = 'cache:popular:article:' + Math.random();
      const lockKey = `${popularKey}:lock`;

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
            views: 1000000,
            computedAt: Date.now(),
          };

          // Cache the result
          await redis.setex(popularKey, 300, JSON.stringify(expensiveData));

          // Release lock
          await redis.del(lockKey);

          return expensiveData;
        } else {
          // Wait for cache to be populated
          let retries = 0;
          while (retries < 10) {
            const cached = await redis.get(popularKey);
            if (cached) {
              return JSON.parse(cached);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
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
    test('should implement tag-based cache invalidation', async () => {
      const baseKey = 'cache:tagged:' + Math.random();

      // Create caches with tags
      const userCaches = [
        {
          key: `${baseKey}:user:1:profile`,
          data: { name: 'User 1' },
          tags: ['user:1', 'profile'],
        },
        {
          key: `${baseKey}:user:1:posts`,
          data: { posts: [] },
          tags: ['user:1', 'posts'],
        },
        {
          key: `${baseKey}:user:2:profile`,
          data: { name: 'User 2' },
          tags: ['user:2', 'profile'],
        },
      ];

      // Set caches and maintain tag mappings
      for (const cache of userCaches) {
        await redis.setex(cache.key, 300, JSON.stringify(cache.data));

        // Maintain tag-to-keys mapping
        for (const tag of cache.tags) {
          const tagKey = `${baseKey}:tag:${tag}`;
          await redis.sadd(tagKey, cache.key);
          await redis.expire(tagKey, 300);
        }
      }

      // Invalidate all caches tagged with 'user:1'
      const tagKey = `${baseKey}:tag:user:1`;
      const keysToInvalidate = await redis.smembers(tagKey);

      if (keysToInvalidate.length > 0) {
        await redis.del(...keysToInvalidate);
        await redis.del(tagKey); // Remove tag mapping
      }

      // Verify user:1 caches are gone
      assert.strictEqual(await redis.get(`${baseKey}:user:1:profile`), null);
      assert.strictEqual(await redis.get(`${baseKey}:user:1:posts`), null);

      // But user:2 cache remains
      assert.ok(await redis.get(`${baseKey}:user:2:profile`));
    });

    test('should implement time-based cache refresh', async () => {
      const refreshKey = 'cache:refresh:' + Math.random();
      const lastRefreshKey = `${refreshKey}:last_refresh`;

      // Initial cache setup
      const initialData = {
        data: 'Initial data',
        timestamp: Date.now(),
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
          timestamp: currentTime,
        };

        await redis.setex(refreshKey, 60, JSON.stringify(newData));
        await redis.set(lastRefreshKey, currentTime.toString());
      }

      const cached = await redis.get(refreshKey);
      assert.ok(cached);

      const cachedData = JSON.parse(cached);
      assert.match(cachedData.data, /data/);
    });
  });

  describe('Performance and Monitoring Patterns', () => {
    test('should track cache hit/miss statistics', async () => {
      const statsKey = 'cache:stats:' + Math.random();
      const dataKey = 'cache:data:' + Math.random();

      // Simulate cache operations with statistics
      const trackCacheOperation = async operation => {
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
      assert.strictEqual(parseInt(stats.misses || '0'), 1);
      assert.strictEqual(parseInt(stats.hits || '0'), 1);
      assert.strictEqual(parseInt(stats.total || '0'), 2);
    });

    test('should implement cache warming strategy', async () => {
      const warmupPrefix = 'cache:warmup:' + Math.random();

      // Critical data that should always be cached
      const criticalData = [
        {
          key: `${warmupPrefix}:config`,
          data: { maintenance: false, version: '1.0' },
        },
        {
          key: `${warmupPrefix}:features`,
          data: { newFeature: true, beta: false },
        },
        {
          key: `${warmupPrefix}:limits`,
          data: { maxUsers: 10000, rateLimit: 100 },
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

        const parsed = JSON.parse(cached);
        assert.deepStrictEqual(parsed, item.data);

        const ttl = await redis.ttl(item.key);
        assert.ok(ttl > 3500); // Confirm long TTL
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle cache failures gracefully', async () => {
      const resilientKey = 'cache:resilient:' + Math.random();

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

    test('should handle expired cache keys properly', async () => {
      const expiringKey = 'cache:expiring:' + Math.random();

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
