/**
 * Caching, Analytics & E-commerce Integration Test
 *
 * Tests that our ioredis adapter works correctly with common caching patterns,
 * analytics data aggregation, and e-commerce scenarios like shopping carts.
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
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
describe('Caching, Analytics & E-commerce Integration', () => {
  let redisClient;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available - Redis connection required for caching integration tests'
      );
      return;
    }
  });

  beforeEach(async () => {
    // Skip tests if servers are not available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      this.skip('Test servers not available');
      return;
    }

    // Setup Redis client
    const config = await getStandaloneConfig();
    redisClient = new Redis(config);

    await redisClient.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await redisClient.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }

    // Clean up any existing test data at the start
    try {
      const allKeys = await redisClient.keys('*');
      if (allKeys.length > 0) {
        await redisClient.del(...allKeys);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    if (redisClient) {
      try {
        // Clean up all test data
        const keys = await redisClient.keys('*');
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch {
        // Ignore cleanup errors
      }
      await redisClient.disconnect();
    }
  });

  describe('Application Caching Patterns', () => {
    test('should implement basic cache-aside pattern', async () => {
      const userId = 'user123';
      const cacheKey = `user:${userId}`;

      // Simulate cache miss
      let cachedUser = await redisClient.get(cacheKey);
      assert.strictEqual(cachedUser, null);

      // Simulate database fetch and cache set
      const userData = {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
        lastLogin: Date.now(),
      };

      await redisClient.setex(cacheKey, 3600, JSON.stringify(userData));

      // Simulate cache hit
      cachedUser = await redisClient.get(cacheKey);
      assert.ok(cachedUser !== undefined);
      assert.deepStrictEqual(JSON.parse(cachedUser), userData);

      // Verify TTL is set
      const ttl = await redisClient.ttl(cacheKey);
      assert.ok(ttl > 0);
      assert.ok(ttl <= 3600);
    });

    test('should handle cache invalidation patterns', async () => {
      const productId = 'product456';
      const cacheKeys = [
        `product:${productId}`,
        `product:${productId}:reviews`,
        `product:${productId}:related`,
      ];

      // Set multiple related cache entries
      await Promise.all([
        redisClient.set(
          cacheKeys[0],
          JSON.stringify({ id: productId, name: 'Widget' })
        ),
        redisClient.set(
          cacheKeys[1],
          JSON.stringify([{ rating: 5, comment: 'Great' }])
        ),
        redisClient.set(cacheKeys[2], JSON.stringify(['related1', 'related2'])),
      ]);

      // Verify all are cached
      const cached = await Promise.all(
        cacheKeys.map(key => redisClient.get(key))
      );
      assert.strictEqual(
        cached.every(c => c !== null),
        true
      );

      // Invalidate all related caches
      await redisClient.del(...cacheKeys);

      // Verify all are removed
      const afterDeletion = await Promise.all(
        cacheKeys.map(key => redisClient.get(key))
      );
      assert.strictEqual(
        afterDeletion.every(c => c === null),
        true
      );
    });

    test('should implement write-through cache pattern', async () => {
      const configKey = 'app:config';
      const configData = {
        theme: 'dark',
        language: 'en',
        notifications: true,
        version: '1.2.3',
      };

      // Write-through: update both cache and "database" simultaneously
      const pipeline = redisClient.pipeline();
      pipeline.set(configKey, JSON.stringify(configData));
      pipeline.expire(configKey, 7200); // 2 hours

      // Simulate additional database operations
      pipeline.set(`${configKey}:backup`, JSON.stringify(configData));
      pipeline.set(`${configKey}:timestamp`, Date.now().toString());

      const results = await pipeline.exec();
      assert.strictEqual(results.length, 4);
      assert.strictEqual(
        results.every(([err]) => err === null),
        true
      );

      // Verify data consistency
      const cached = await redisClient.get(configKey);
      assert.deepStrictEqual(JSON.parse(cached), configData);
    });

    test('should handle cache stampede prevention', async () => {
      const expensiveDataKey = 'expensive:calculation';
      const lockKey = `${expensiveDataKey}:lock`;

      // Simulate multiple concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, async (_, index) => {
        // Try to acquire lock
        const lockAcquired = await redisClient.setnx(
          lockKey,
          `worker-${index}`
        );

        if (lockAcquired) {
          // Only one worker should get the lock
          await redisClient.expire(lockKey, 10); // 10 second lock

          // Simulate expensive calculation
          await delay(100);
          const result = {
            calculated: true,
            worker: `worker-${index}`,
            timestamp: Date.now(),
          };

          // Cache the result
          await redisClient.setex(
            expensiveDataKey,
            300,
            JSON.stringify(result)
          );

          // Release lock
          await redisClient.del(lockKey);

          return result;
        } else {
          // Wait for the calculation to complete
          let attempts = 0;
          while (attempts < 20) {
            const cached = await redisClient.get(expensiveDataKey);
            if (cached) {
              return JSON.parse(cached);
            }
            await delay(50);
            attempts++;
          }
          throw new Error('Timeout waiting for calculation');
        }
      });

      const results = await Promise.all(concurrentRequests);

      // All should get the same result
      const firstResult = results[0];
      assert.ok(results.every(r => r.worker === firstResult.worker));
    });
  });

  describe('Analytics Data Aggregation', () => {
    test('should track page views with counters', async () => {
      const pages = ['/home', '/products', '/about', '/contact'];
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Simulate page view tracking
      for (const page of pages) {
        const viewCount = Math.floor(Math.random() * 100) + 1;
        for (let i = 0; i < viewCount; i++) {
          await redisClient.incr(`pageviews:${today}:${page}`);
        }
      }

      // Get analytics data
      const analytics = {};
      for (const page of pages) {
        const views = await redisClient.get(`pageviews:${today}:${page}`);
        analytics[page] = parseInt(views || '0');
      }

      assert.strictEqual(Object.keys(analytics).length, 4);
      assert.ok(
        Object.values(analytics).every(v => typeof v === 'number' && v > 0)
      );
    });

    test('should implement real-time event aggregation', async () => {
      const eventTypes = ['login', 'purchase', 'signup', 'click'];
      const timeWindow = Math.floor(Date.now() / 1000 / 60); // Current minute

      // Track events in real-time
      const eventPromises = eventTypes.map(async eventType => {
        const count = Math.floor(Math.random() * 50) + 1;
        const key = `events:${timeWindow}:${eventType}`;

        // Use pipeline for efficiency
        const pipeline = redisClient.pipeline();
        for (let i = 0; i < count; i++) {
          pipeline.incr(key);
        }
        pipeline.expire(key, 3600); // Expire after 1 hour

        await pipeline.exec();
        return { eventType, count };
      });

      const eventResults = await Promise.all(eventPromises);

      // Verify all events were tracked
      for (const { eventType, count } of eventResults) {
        const storedCount = await redisClient.get(
          `events:${timeWindow}:${eventType}`
        );
        assert.strictEqual(parseInt(storedCount), count);
      }
    });

    test('should handle user activity tracking', async () => {
      const userId = 'user789';
      const activities = [
        { action: 'login', timestamp: Date.now() },
        {
          action: 'view_product',
          productId: 'prod123',
          timestamp: Date.now() + 1000,
        },
        {
          action: 'add_to_cart',
          productId: 'prod123',
          timestamp: Date.now() + 2000,
        },
        { action: 'checkout', total: 99.99, timestamp: Date.now() + 3000 },
      ];

      // Store user activity timeline
      const activityKey = `user:${userId}:activity`;

      for (const activity of activities) {
        await redisClient.lpush(activityKey, JSON.stringify(activity));
      }

      // Set expiration for the activity log
      await redisClient.expire(activityKey, 86400); // 24 hours

      // Retrieve recent activities
      const recentActivities = await redisClient.lrange(activityKey, 0, 9); // Last 10 activities
      assert.strictEqual(recentActivities.length, 4);

      const parsedActivities = recentActivities.map(a => JSON.parse(a));
      assert.strictEqual(parsedActivities[0].action, 'checkout'); // Most recent first
      assert.strictEqual(parsedActivities[3].action, 'login'); // Oldest last
    });
  });

  describe('E-commerce Shopping Cart', () => {
    test('should implement shopping cart with hash operations', async () => {
      const cartId = 'cart:user456';
      const products = [
        { id: 'prod1', name: 'Widget A', price: 29.99, quantity: 2 },
        { id: 'prod2', name: 'Widget B', price: 49.99, quantity: 1 },
        { id: 'prod3', name: 'Widget C', price: 19.99, quantity: 3 },
      ];

      // Add products to cart using hash
      for (const product of products) {
        await redisClient.hset(
          cartId,
          product.id,
          JSON.stringify({
            name: product.name,
            price: product.price,
            quantity: product.quantity,
            subtotal: product.price * product.quantity,
          })
        );
      }

      // Set cart expiration (30 days)
      await redisClient.expire(cartId, 30 * 24 * 3600);

      // Retrieve entire cart
      const cart = await redisClient.hgetall(cartId);
      assert.strictEqual(Object.keys(cart).length, 3);

      // Calculate total
      let total = 0;
      for (const [_productId, productData] of Object.entries(cart)) {
        const product = JSON.parse(productData);
        total += product.subtotal;
        assert.ok(product.name !== undefined);
        assert.ok(product.price > 0);
      }

      assert.ok(Math.abs(total - 169.94) < Math.pow(10, -2)); // 2*29.99 + 1*49.99 + 3*19.99 = 59.98 + 49.99 + 59.97
    });

    test('should handle cart modifications', async () => {
      const cartId = 'cart:user789';
      const productId = 'prod456';

      // Add product to cart
      await redisClient.hset(
        cartId,
        productId,
        JSON.stringify({
          name: 'Test Product',
          price: 25.0,
          quantity: 1,
        })
      );

      // Update quantity
      const currentProduct = await redisClient.hget(cartId, productId);
      const product = JSON.parse(currentProduct);
      product.quantity = 3;
      product.subtotal = product.price * product.quantity;

      await redisClient.hset(cartId, productId, JSON.stringify(product));

      // Verify update
      const updatedProduct = await redisClient.hget(cartId, productId);
      assert.strictEqual(JSON.parse(updatedProduct).quantity, 3);

      // Remove product from cart
      await redisClient.hdel(cartId, productId);

      // Verify removal
      const removedProduct = await redisClient.hget(cartId, productId);
      assert.strictEqual(removedProduct, null);
    });

    test('should implement cart abandonment tracking', async () => {
      const userId = 'user999';
      const cartKey = `cart:${userId}`;
      const abandonmentKey = `cart:abandoned:${userId}`;

      // Create cart with items
      await redisClient.hset(
        cartKey,
        'item1',
        JSON.stringify({
          name: 'Abandoned Item',
          price: 99.99,
          quantity: 1,
        })
      );

      // Simulate cart abandonment (copy cart to abandoned carts)
      const cartItems = await redisClient.hgetall(cartKey);

      if (Object.keys(cartItems).length > 0) {
        // Store abandoned cart for marketing purposes
        await redisClient.set(
          abandonmentKey,
          JSON.stringify({
            items: cartItems,
            abandonedAt: Date.now(),
            userId: userId,
          })
        );

        // Set longer expiration for abandoned cart tracking
        await redisClient.expire(abandonmentKey, 7 * 24 * 3600); // 7 days
      }

      // Verify abandoned cart is tracked
      const abandonedCart = await redisClient.get(abandonmentKey);
      assert.ok(abandonedCart !== undefined);

      const parsed = JSON.parse(abandonedCart);
      assert.strictEqual(parsed.userId, userId);
      assert.ok(parsed.items.item1 !== undefined);
    });
  });

  describe('Live Notifications & Real-time Features', () => {
    test('should implement notification queues', async () => {
      const userId = 'user123';
      const notificationQueue = `notifications:${userId}`;

      const notifications = [
        {
          type: 'order_shipped',
          orderId: 'order456',
          message: 'Your order has been shipped',
        },
        {
          type: 'promotion',
          message: '20% off your next purchase',
          expiresAt: Date.now() + 86400000,
        },
        {
          type: 'friend_request',
          fromUser: 'friend789',
          message: 'New friend request',
        },
      ];

      // Add notifications to queue
      for (const notification of notifications) {
        await redisClient.lpush(
          notificationQueue,
          JSON.stringify({
            ...notification,
            id: Math.random().toString(36).substring(7),
            createdAt: Date.now(),
            read: false,
          })
        );
      }

      // Set expiration for notification queue
      await redisClient.expire(notificationQueue, 30 * 24 * 3600); // 30 days

      // Get unread notifications
      const unreadNotifications = await redisClient.lrange(
        notificationQueue,
        0,
        -1
      );
      assert.strictEqual(unreadNotifications.length, 3);

      // Mark notification as read (update specific notification)
      const notificationList = unreadNotifications.map(n => JSON.parse(n));
      notificationList[0].read = true;

      // Update the list (in production, you might use a more efficient method)
      await redisClient.del(notificationQueue);
      for (const notification of notificationList.reverse()) {
        await redisClient.lpush(
          notificationQueue,
          JSON.stringify(notification)
        );
      }

      // Verify update
      const updatedNotifications = await redisClient.lrange(
        notificationQueue,
        0,
        -1
      );
      if (updatedNotifications.length > 0) {
        const firstNotification = JSON.parse(updatedNotifications[0] || '{}');
        assert.strictEqual(firstNotification.read, true);
      }
    });

    test('should track online users', async () => {
      const onlineUsersKey = 'users:online';
      const users = ['user1', 'user2', 'user3', 'user4'];

      // Ensure clean state
      await redisClient.del(onlineUsersKey);
      
      // Simulate users coming online
      for (const user of users) {
        await redisClient.setex(
          `user:${user}:lastseen`,
          300,
          Date.now().toString()
        ); // 5 min expiry
        await redisClient.sadd(onlineUsersKey, user);
      }

      // Get online user count
      const onlineCount = await redisClient.scard(onlineUsersKey);
      assert.strictEqual(onlineCount, 4, `Expected 4 online users, got ${onlineCount}`);

      // Get list of online users
      const onlineUsers = await redisClient.smembers(onlineUsersKey);
      assert.ok(Array.isArray(onlineUsers), 'smembers should return an array');
      assert.strictEqual(onlineUsers.length, 4, `Expected 4 users in array, got ${onlineUsers.length}`);
      assert.ok(onlineUsers.includes('user1'), 'user1 should be in the set');

      // Simulate user going offline
      await redisClient.srem(onlineUsersKey, 'user1');
      const updatedCount = await redisClient.scard(onlineUsersKey);
      assert.strictEqual(updatedCount, 3, `Expected 3 users after removal, got ${updatedCount}`);
    });
  });

  describe('Performance & Memory Optimization', () => {
    test('should handle large data sets efficiently', async () => {
      const largeDataKey = 'large:dataset';
      const itemCount = 1000;

      const startTime = Date.now();

      // Use pipeline for bulk operations
      const pipeline = redisClient.pipeline();

      for (let i = 0; i < itemCount; i++) {
        const data = {
          id: i,
          value: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
          score: Math.random(),
        };
        pipeline.hset(largeDataKey, i.toString(), JSON.stringify(data));
      }

      const pipelineResults = await pipeline.exec();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Debug pipeline execution
      console.log('Pipeline results length:', pipelineResults?.length);
      console.log('Sample pipeline results:', pipelineResults?.slice(0, 3));

      // Verify pipeline execution succeeded
      assert.ok(pipelineResults, 'Pipeline results should exist');
      assert.ok(Array.isArray(pipelineResults), 'Pipeline results should be an array');
      assert.strictEqual(pipelineResults.length, itemCount, `Expected ${itemCount} results, got ${pipelineResults.length}`);

      // Check for any errors in pipeline results
      const errors = pipelineResults.filter(result => {
        // Check if this is an error result
        if (Array.isArray(result) && result.length >= 2) {
          return result[0] !== null; // result[0] is the error
        }
        return false;
      });
      if (errors.length > 0) {
        console.log('Pipeline errors:', errors.slice(0, 3));
        throw new Error(`Pipeline had ${errors.length} errors`);
      }

      // Verify data integrity
      const randomKey = Math.floor(Math.random() * itemCount).toString();

      // First check if the hash exists
      const hashExists = await redisClient.exists(largeDataKey);
      assert.strictEqual(hashExists, 1);

      // Then try to get the random item
      const randomItem = await redisClient.hget(largeDataKey, randomKey);

      // If the random key doesn't exist, try a known key (0)
      if (randomItem === null) {
        const firstItem = await redisClient.hget(largeDataKey, '0');
        assert.ok(firstItem !== undefined);
        assert.ok(firstItem !== null);

        const parsed = JSON.parse(firstItem);
        assert.strictEqual(parsed.id, 0);
      } else {
        assert.ok(randomItem !== undefined);
        assert.ok(randomItem !== null);

        const parsed = JSON.parse(randomItem);
        assert.strictEqual(parsed.id, parseInt(randomKey));
      }

      // Check total items
      const allItems = await redisClient.hgetall(largeDataKey);
      assert.strictEqual(Object.keys(allItems).length, itemCount);

      assert.ok(duration < 5000); // Should complete within 5 seconds
    });
  });
});
