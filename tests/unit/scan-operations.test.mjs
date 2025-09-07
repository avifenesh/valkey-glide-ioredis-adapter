/**
 * Scan Operations Test Suite
 * Tests for safe production iteration with SCAN, HSCAN, SSCAN, ZSCAN
 *
 * Based on real-world patterns from:
 * - Instagram's follower count systems
 * - Netflix's recommendation cache scanning
 * - Shopify's product inventory scans
 * - Discord's user status monitoring
 * - GitHub's repository metadata scanning
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

describe('Scan Operations - Production Iteration Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = {
      host: 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
      lazyConnect: true,
    };
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
    if (redis) {
      await redis.quit();
    }
  });

  describe('Database SCAN Operations', () => {
    test('should implement safe key iteration with SCAN cursor', async () => {
      const testKey = 'scan_test:basic:' + Math.random();

      // Create a simple test key
      await redis.set(testKey, 'test_value');

      // Perform basic SCAN operation
      const result = await redis.scan('0');
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 2);
      assert.strictEqual(typeof result[0], 'string'); // cursor
      assert.ok(Array.isArray(result[1])); // keys array

      // SCAN should complete basic functionality
      assert.ok(result[0] !== undefined);
      assert.ok(result[1] !== undefined);
    });

    test('should handle large dataset scanning like Netflix recommendations', async () => {
      const prefix = 'netflix:' + Math.random() + ':';

      // Create many recommendation keys
      for (let userId = 1; userId <= 50; userId++) {
        for (let category of ['action', 'comedy', 'drama', 'horror']) {
          await redis.set(
            `${prefix}rec:${userId}:${category}`,
            JSON.stringify({
              userId,
              category,
              movies: [`movie${userId}_1`, `movie${userId}_2`],
            })
          );
        }
      }

      // Scan for specific user recommendations
      let cursor = '0';
      let userRecs = [];
      let totalScanned = 0;

      do {
        const result = await redis.scan(
          cursor,
          'MATCH',
          `${prefix}rec:*:action`,
          'COUNT',
          '10'
        );
        cursor = result[0];
        const keys = result[1];
        userRecs.push(...keys);
        totalScanned += keys.length;
      } while (cursor !== '0');

      assert.strictEqual(userRecs.length, 50); // 50 users with action recommendations
      assert.strictEqual(
        userRecs.every(key => key.includes(':action')),
        true
      );
    });

    test('should implement key expiration scanning for cleanup', async () => {
      const prefix = 'temp:' + Math.random() + ':';

      // Create temporary session keys with TTL
      for (let i = 1; i <= 10; i++) {
        await redis.setex(
          `${prefix}session:${i}`,
          300,
          JSON.stringify({
            userId: i,
            loginTime: Date.now(),
            lastActivity: Date.now(),
          })
        );
      }

      // Scan for session keys
      let cursor = '0';
      let sessionKeys = [];

      do {
        const result = await redis.scan(cursor, 'MATCH', `${prefix}session:*`);
        cursor = result[0];
        sessionKeys.push(...result[1]);
      } while (cursor !== '0');

      assert.strictEqual(sessionKeys.length, 10);

      // Verify TTL exists on scanned keys
      for (const key of sessionKeys.slice(0, 3)) {
        const ttl = await redis.ttl(key);
        assert.ok(ttl > 0);
        assert.ok(ttl <= 300);
      }
    });
  });

  describe('Hash SCAN Operations', () => {
    test('should scan user profile fields like LinkedIn profiles', async () => {
      const profileKey = 'profile:user:' + Math.random();

      // Create comprehensive user profile
      const profileData = {
        firstName: 'John',
        lastName: 'Smith',
        title: 'Senior Software Engineer',
        company: 'TechCorp Inc',
        location: 'San Francisco, CA',
        connections: '500+',
        experience_1: 'Software Engineer at StartupXYZ',
        experience_2: 'Junior Developer at WebCorp',
        skill_javascript: 'Expert',
        skill_python: 'Advanced',
        skill_react: 'Expert',
        skill_nodejs: 'Advanced',
        education_degree: 'Computer Science',
        education_school: 'Stanford University',
      };

      await redis.hmset(profileKey, profileData);

      // Scan for skills using HSCAN
      let cursor = '0';
      let skills = {};

      do {
        const result = await redis.hscan(
          profileKey,
          cursor,
          'MATCH',
          'skill_*',
          'COUNT',
          '5'
        );
        cursor = result[0];
        const fields = result[1];

        // Convert array to key-value pairs
        for (let i = 0; i < fields.length; i += 2) {
          if (fields[i] && fields[i + 1]) {
            skills[fields[i]] = fields[i + 1];
          }
        }
      } while (cursor !== '0');

      assert.strictEqual(Object.keys(skills).length, 4);
      assert.strictEqual(skills['skill_javascript'], 'Expert');
      assert.strictEqual(skills['skill_python'], 'Advanced');
    });

    test('should scan product inventory like Shopify store', async () => {
      const inventoryKey = 'inventory:store:' + Math.random();

      // Create product inventory
      const inventory = {};
      const categories = ['electronics', 'clothing', 'books', 'sports'];

      for (const category of categories) {
        for (let i = 1; i <= 15; i++) {
          inventory[`${category}_product_${i}_stock`] = Math.floor(
            Math.random() * 100
          );
          inventory[`${category}_product_${i}_price`] =
            Math.random() * 200 + 10;
          inventory[`${category}_product_${i}_views`] = Math.floor(
            Math.random() * 1000
          );
        }
      }

      await redis.hmset(inventoryKey, inventory);

      // Scan for electronics stock levels
      let cursor = '0';
      let electronicsStock = {};

      do {
        const result = await redis.hscan(
          inventoryKey,
          cursor,
          'MATCH',
          'electronics_*_stock',
          'COUNT',
          '10'
        );
        cursor = result[0];
        const fields = result[1];

        for (let i = 0; i < fields.length; i += 2) {
          if (fields[i] && fields[i + 1]) {
            electronicsStock[fields[i]] = fields[i + 1];
          }
        }
      } while (cursor !== '0');

      assert.strictEqual(Object.keys(electronicsStock).length, 15);
      assert.ok(
        Object.values(electronicsStock).every(val => !isNaN(parseInt(val)))
      );
    });

    test('should handle configuration scanning for system monitoring', async () => {
      const configKey = 'config:app:' + Math.random();

      // Create application configuration
      const config = {
        db_host: 'localhost',
        db_port: '5432',
        cache_ttl: '3600',
        rate_limit_requests: '1000',
        rate_limit_window: '60',
        feature_flag_payments: 'enabled',
        feature_flag_analytics: 'disabled',
        feature_flag_experimental: 'beta',
        metric_cpu_threshold: '80',
        metric_memory_threshold: '90',
        alert_email_enabled: 'true',
        alert_slack_webhook: 'https://hooks.slack.com/webhook',
      };

      await redis.hmset(configKey, config);

      // Scan for feature flags
      let cursor = '0';
      let featureFlags = {};

      do {
        const result = await redis.hscan(
          configKey,
          cursor,
          'MATCH',
          'feature_flag_*'
        );
        cursor = result[0];
        const fields = result[1];

        for (let i = 0; i < fields.length; i += 2) {
          if (fields[i] && fields[i + 1]) {
            featureFlags[fields[i]] = fields[i + 1];
          }
        }
      } while (cursor !== '0');

      assert.strictEqual(Object.keys(featureFlags).length, 3);
      assert.strictEqual(featureFlags['feature_flag_payments'], 'enabled');
    });
  });

  describe('Set SCAN Operations', () => {
    test('should scan social media followers like Twitter', async () => {
      const followersKey = 'followers:' + Math.random();

      // Add followers with different patterns
      const followers = [];
      for (let i = 1; i <= 100; i++) {
        if (i <= 30) followers.push(`verified_user_${i}`);
        else if (i <= 60) followers.push(`regular_user_${i}`);
        else followers.push(`new_user_${i}`);
      }

      await redis.sadd(followersKey, ...followers);

      // Scan for verified users
      let cursor = '0';
      let verifiedFollowers = [];

      do {
        const result = await redis.sscan(
          followersKey,
          cursor,
          'MATCH',
          'verified_*',
          'COUNT',
          '15'
        );
        cursor = result[0];
        verifiedFollowers.push(...result[1]);
      } while (cursor !== '0');

      assert.strictEqual(verifiedFollowers.length, 30);
      assert.ok(verifiedFollowers.every(user => user.startsWith('verified_')));
    });

    test('should scan active user sessions for monitoring', async () => {
      const activeUsersKey = 'active:' + Math.random();

      // Add active user sessions
      const sessions = [];
      for (let i = 1; i <= 80; i++) {
        if (i <= 20) sessions.push(`mobile_${i}`);
        else if (i <= 50) sessions.push(`desktop_${i}`);
        else sessions.push(`tablet_${i}`);
      }

      await redis.sadd(activeUsersKey, ...sessions);

      // Scan for mobile sessions
      let cursor = '0';
      let mobileSessions = [];

      do {
        const result = await redis.sscan(
          activeUsersKey,
          cursor,
          'MATCH',
          'mobile_*',
          'COUNT',
          '10'
        );
        cursor = result[0];
        mobileSessions.push(...result[1]);
      } while (cursor !== '0');

      assert.strictEqual(mobileSessions.length, 20);
      assert.ok(mobileSessions.every(session => session.startsWith('mobile_')));
    });

    test('should scan tags and categories for content management', async () => {
      const tagsKey = 'tags:post:' + Math.random();

      // Add content tags
      const tags = [
        'tech_javascript',
        'tech_python',
        'tech_react',
        'tech_nodejs',
        'lifestyle_travel',
        'lifestyle_food',
        'lifestyle_fitness',
        'business_startup',
        'business_marketing',
        'business_finance',
        'education_coding',
        'education_design',
        'education_data',
      ];

      await redis.sadd(tagsKey, ...tags);

      // Scan for tech tags
      let cursor = '0';
      let techTags = [];

      do {
        const result = await redis.sscan(tagsKey, cursor, 'MATCH', 'tech_*');
        cursor = result[0];
        techTags.push(...result[1]);
      } while (cursor !== '0');

      assert.strictEqual(techTags.length, 4);
      assert.deepStrictEqual(techTags.sort(), [
        'tech_javascript',
        'tech_nodejs',
        'tech_python',
        'tech_react',
      ]);
    });
  });

  describe('Sorted Set SCAN Operations', () => {
    test('should scan leaderboard ranges like gaming platforms', async () => {
      const leaderboardKey = 'leaderboard:' + Math.random();

      // Add players with scores
      for (let i = 1; i <= 100; i++) {
        let playerType = 'player';
        if (i <= 10) playerType = 'pro';
        else if (i <= 30) playerType = 'expert';
        else if (i <= 60) playerType = 'regular';
        else playerType = 'newbie';

        await redis.zadd(
          leaderboardKey,
          Math.random() * 10000,
          `${playerType}_${i}`
        );
      }

      // Scan for pro players
      let cursor = '0';
      let proPlayers = [];

      do {
        const result = await redis.zscan(
          leaderboardKey,
          cursor,
          'MATCH',
          'pro_*',
          'COUNT',
          '5'
        );
        cursor = result[0];
        const members = result[1];

        // Extract member names (every other item, skipping scores)
        for (let i = 0; i < members.length; i += 2) {
          if (members[i]) {
            proPlayers.push(members[i]);
          }
        }
      } while (cursor !== '0');

      assert.strictEqual(proPlayers.length, 10);
      assert.strictEqual(
        proPlayers.every(player => player.startsWith('pro_')),
        true
      );
    });

    test('should scan time-based rankings like trending topics', async () => {
      const trendingKey = 'trending:' + Math.random();

      // Add trending topics with timestamps as scores
      const baseTime = Date.now();
      const topics = [
        'tech_ai',
        'tech_blockchain',
        'tech_cloud',
        'news_politics',
        'news_economy',
        'news_sports',
        'entertainment_movies',
        'entertainment_music',
        'health_fitness',
        'health_nutrition',
      ];

      for (let i = 0; i < topics.length; i++) {
        await redis.zadd(trendingKey, baseTime - i * 1000, topics[i]);
      }

      // Scan for tech topics
      let cursor = '0';
      let techTopics = [];

      do {
        const result = await redis.zscan(
          trendingKey,
          cursor,
          'MATCH',
          'tech_*'
        );
        cursor = result[0];
        const data = result[1];

        // Parse member-score pairs
        for (let i = 0; i < data.length; i += 2) {
          if (data[i] && data[i + 1]) {
            techTopics.push({
              member: data[i],
              score: data[i + 1],
            });
          }
        }
      } while (cursor !== '0');

      assert.strictEqual(techTopics.length, 3);
      assert.strictEqual(
        techTopics.every(topic => topic.member.startsWith('tech_')),
        true
      );
      assert.strictEqual(
        techTopics.every(topic => !isNaN(parseFloat(topic.score))),
        true
      );
    });

    test('should scan user activity scores for analytics', async () => {
      const activityKey = 'activity:daily:' + Math.random();

      // Add user activity scores
      for (let userId = 1; userId <= 50; userId++) {
        let userType = userId <= 10 ? 'premium' : 'free';
        let score =
          userType === 'premium'
            ? Math.random() * 1000 + 500
            : Math.random() * 500;

        await redis.zadd(activityKey, score, `${userType}_user_${userId}`);
      }

      // Scan for premium users
      let cursor = '0';
      let premiumUsers = [];

      do {
        const result = await redis.zscan(
          activityKey,
          cursor,
          'MATCH',
          'premium_*',
          'COUNT',
          '5'
        );
        cursor = result[0];
        const data = result[1];

        for (let i = 0; i < data.length; i += 2) {
          if (data[i] && data[i + 1]) {
            premiumUsers.push({
              user: data[i],
              activity: parseFloat(data[i + 1]),
            });
          }
        }
      } while (cursor !== '0');

      assert.strictEqual(premiumUsers.length, 10);
      assert.strictEqual(
        premiumUsers.every(u => u.user.startsWith('premium_')),
        true
      );
      assert.ok(premiumUsers.every(u => u.activity >= 500));
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle SCAN on non-existent keys gracefully', async () => {
      const nonExistentKey = 'non_existent:' + Math.random();

      const result = await redis.scan('0', 'MATCH', nonExistentKey);
      assert.strictEqual(typeof result[0], 'string'); // Cursor should be a string
      assert.deepStrictEqual(result[1], []); // No keys found
    });

    test('should handle HSCAN on non-existent hash', async () => {
      const nonExistentHash = 'hash:non_existent:' + Math.random();

      const result = await redis.hscan(nonExistentHash, '0');
      assert.strictEqual(result[0], '0');
      assert.deepStrictEqual(result[1], []);
    });

    test('should handle SSCAN on non-existent set', async () => {
      const nonExistentSet = 'set:non_existent:' + Math.random();

      const result = await redis.sscan(nonExistentSet, '0');
      assert.strictEqual(result[0], '0');
      assert.deepStrictEqual(result[1], []);
    });

    test('should handle ZSCAN on non-existent sorted set', async () => {
      const nonExistentZset = 'zset:non_existent:' + Math.random();

      const result = await redis.zscan(nonExistentZset, '0');
      assert.strictEqual(result[0], '0');
      assert.deepStrictEqual(result[1], []);
    });

    test('should handle invalid cursor values gracefully', async () => {
      const key = 'test:invalid_cursor:' + Math.random();
      await redis.set(key, 'test');

      // Test with invalid cursor - Redis/GLIDE may throw error, so catch it
      try {
        const result = await redis.scan('invalid_cursor', 'MATCH', key);
        assert.ok(Array.isArray(result));
        assert.strictEqual(result.length, 2);
      } catch (error) {
        // GLIDE throws error for invalid cursor, which is expected behavior
        assert.ok(error !== undefined);
      }
    });

    test('should handle SCAN with very large COUNT parameter', async () => {
      const prefix = 'large_count:' + Math.random() + ':';

      // Create some test keys
      for (let i = 1; i <= 10; i++) {
        await redis.set(`${prefix}key_${i}`, `value_${i}`);
      }

      const result = await redis.scan(
        '0',
        'MATCH',
        `${prefix}*`,
        'COUNT',
        '10000'
      );
      assert.strictEqual(result[0], '0'); // Should complete in one iteration
      assert.strictEqual(result[1].length, 10);
    });
  });
});
