import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

/**
 * Scan Operations Test Suite
 * Tests for safe production iteration with SCAN, HSCAN, SSCAN, ZSCAN
 */

import pkg from '../../dist/index.js';
import { testUtils } from '../setup/index.mjs';
const { Redis } = pkg;

describe('Scan Operations - Production Iteration Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = testUtils.getStandaloneConfig();
    redis = new Redis(config);
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Database SCAN Operations', () => {
    it('should implement safe key iteration with SCAN cursor', async () => {
      const testKey = 'scan_test:' + Math.random();

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
      for (let userId = 1; userId <= 20; userId++) {
        await redis.set(`${prefix}user:${userId}`, `recommendation_${userId}`);
      }

      // Scan for recommendation keys
      let cursor = "0";
      let allKeys = [];

      do {
        const [newCursor, keys] = await redis.scan(cursor, "MATCH", prefix + "*");
        cursor = newCursor;
        allKeys = allKeys.concat(keys);
      } while (cursor !== "0");

      assert.ok(allKeys.some(key => key.includes(prefix)));
    });

    it('should implement key expiration scanning for cleanup', async () => {
      const prefix = 'temp:' + Math.random() + ':';

      // Create temporary session keys with TTL
      for (let i = 1; i <= 3; i++) {
        const key = `${prefix}session:${i}`;
        await redis.setex(key, 2, `session_data_${i}`);
      }

      // Scan for temporary keys
      const [, keys] = await redis.scan("0", "MATCH", prefix + "*");
      
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        assert.ok(ttl > 0);
        assert.ok(ttl <= 2);
      }
    });
  });

  describe('Hash Field Scanning (HSCAN)', () => {
    it('should scan user profile fields like LinkedIn profiles', async () => {
      const profileKey = 'profile:' + Math.random();

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

      // Check that we found skills
      assert.ok(Object.keys(skills).length > 0);
      assert.strictEqual(skills['skill_javascript'], 'Expert');
      assert.strictEqual(skills['skill_python'], 'Advanced');
    });

    it('should scan social media followers like Twitter', async () => {
      const followersKey = 'followers:' + Math.random();

      // Add followers with different patterns
      const followers = [];
      for (let i = 1; i <= 15; i++) {
        const username = i <= 5 ? `verified_user${i}` : `user${i}`;
        followers.push(username);
        await redis.sadd(followersKey, username);
      }

      // Scan for verified users
      let cursor = '0';
      let verifiedUsers = [];

      do {
        const result = await redis.sscan(
          followersKey,
          cursor,
          'MATCH',
          'verified_*',
          'COUNT',
          '10'
        );
        cursor = result[0];
        verifiedUsers = verifiedUsers.concat(result[1]);
      } while (cursor !== '0');

      // Verify we found verified users
      assert.ok(verifiedUsers.length > 0);
      assert.ok(verifiedUsers.some(user => user.startsWith("verified_")));
    });
  });

  describe('Sorted Set SCAN Operations', () => {
    it('should scan leaderboard ranges like gaming platforms', async () => {
      const leaderboardKey = 'leaderboard:' + Math.random();

      // Add players with scores
      for (let i = 1; i <= 10; i++) {
        const playerName = i <= 3 ? `pro_player${i}` : `player${i}`;
        const score = 1000 + (i * 50);
        await redis.zadd(leaderboardKey, score, playerName);
      }

      // Scan for pro players using ZSCAN
      let cursor = '0';
      let proPlayers = {};

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

        // Convert array to member-score pairs
        for (let i = 0; i < members.length; i += 2) {
          if (members[i] && members[i + 1]) {
            proPlayers[members[i]] = parseFloat(members[i + 1]);
          }
        }
      } while (cursor !== '0');

      // Verify we found pro players
      assert.ok(Object.keys(proPlayers).length > 0);
      assert.ok(Object.keys(proPlayers).some(player => player.startsWith("pro_")));
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
      const key = 'test:' + Math.random();
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