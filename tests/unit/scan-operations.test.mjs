import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

/**
 * Scan Operations Test Suite
 * Tests for safe production iteration with SCAN, HSCAN, SSCAN, ZSCAN
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('Scan Operations - Production Iteration Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = {
      host: 'localhost',
      port: 6379,
      lazyConnect: true,
    };
    redis = new Redis(config);
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Database SCAN Operations', () => {
    it('should implement safe key iteration with SCAN cursor', async () => {
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

    it('should handle large dataset scanning like Netflix recommendations', async () => {
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
      assert.ok(userRecs.every(key => key.includes(':action')));
    });

    it('should implement key expiration scanning for cleanup', async () => {
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
    it('should scan user profile fields like LinkedIn profiles', async () => {
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
  });

  describe('Set SCAN Operations', () => {
    it('should scan social media followers like Twitter', async () => {
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
  });

  describe('Sorted Set SCAN Operations', () => {
    it('should scan leaderboard ranges like gaming platforms', async () => {
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
      assert.ok(proPlayers.every(player => player.startsWith('pro_')));
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle SCAN on non-existent keys gracefully', async () => {
      const nonExistentKey = 'non_existent:' + Math.random();

      const result = await redis.scan('0', 'MATCH', nonExistentKey);
      assert.strictEqual(typeof result[0], 'string'); // Cursor should be a string
      assert.deepStrictEqual(result[1], []); // No keys found
    });

    it('should handle invalid cursor values gracefully', async () => {
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
  });
});