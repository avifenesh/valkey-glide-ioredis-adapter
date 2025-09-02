/**
 * ZSet Commands Comprehensive Tests
 * Real-world patterns, rankings, time-series data, priority queues
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;;
import { getStandaloneConfig } from '../utils/test-config.mjs';;

describe('ZSet Commands - Real-World Patterns', () => {
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

  describe('Gaming Leaderboard Pattern', () => {
    it('should handle game score updates with ZADD', async () => {
      const key = 'test:' + Math.random();

      // Add initial players
      const result1 = await redis.zadd(key, 1000, 'player1');
      assert.strictEqual(result1, 1);

      const result2 = await redis.zadd(key, 750, 'player2', 1200, 'player3');
      assert.strictEqual(result2, 2);

      // Update existing player score
      const result3 = await redis.zadd(key, 1100, 'player1');
      assert.strictEqual(result3, 0); // No new members added

      // Verify final scores
      const players = await redis.zrange(key, 0, -1);
      assert.deepStrictEqual(players, ['player2', 'player1', 'player3']);

      // Check individual scores
      const player1Score = await redis.zscore(key, 'player1');
      assert.strictEqual(player1Score, '1100');
    });

    it('should increment player scores with ZINCRBY', async () => {
      const key = 'test:' + Math.random();

      await redis.zadd(key, 1000, 'player1');

      // Player scores 50 points
      const newScore = await redis.zincrby(key, 50, 'player1');
      assert.strictEqual(newScore, '1050');

      // New player gets their first score
      const firstScore = await redis.zincrby(key, 100, 'newPlayer');
      assert.strictEqual(firstScore, '100');
    });

    it('should get top players with ZREVRANGE', async () => {
      const key = 'test:' + Math.random();

      // Setup leaderboard
      await redis.zadd(
        key,
        1000,
        'alice',
        850,
        'bob',
        1200,
        'charlie',
        950,
        'diana',
        1100,
        'eve'
      );

      // Get top 3 players (names only for now)
      const top3Names = await redis.zrevrange(key, 0, 2);
      assert.deepStrictEqual(top3Names, ['charlie', 'eve', 'alice']);

      // Verify their scores individually
      const charlieScore = await redis.zscore(key, 'charlie');
      const eveScore = await redis.zscore(key, 'eve');
      const aliceScore = await redis.zscore(key, 'alice');

      assert.strictEqual(charlieScore, '1200');
      assert.strictEqual(eveScore, '1100');
      assert.strictEqual(aliceScore, '1000');
    });

    it('should find player rank with ZREVRANK and ZSCORE', async () => {
      const key = 'test:' + Math.random();

      await redis.zadd(
        key,
        1000,
        'alice',
        850,
        'bob',
        1200,
        'charlie',
        950,
        'diana'
      );

      const rank = await redis.zrevrank(key, 'alice');
      assert.strictEqual(rank, 1); // 2nd place (0-indexed, after charlie 1200, before diana 950)

      const score = await redis.zscore(key, 'alice');
      assert.strictEqual(score, '1000');

      const noRank = await redis.zrevrank(key, 'nonexistent');
      assert.strictEqual(noRank, null);
    });

    it('should handle score range queries with ZRANGEBYSCORE', async () => {
      const key = 'test:' + Math.random();

      await redis.zadd(
        key,
        500,
        'bronze1',
        600,
        'bronze2',
        800,
        'silver1',
        900,
        'silver2',
        1100,
        'gold1',
        1200,
        'gold2'
      );

      // Get silver tier players (750-999 points)
      const silverPlayers = await redis.zrangebyscore(key, 750, 999);
      assert.deepStrictEqual(silverPlayers, ['silver1', 'silver2']);

      // Get gold+ players (1000+)
      const goldPlayers = await redis.zrangebyscore(key, 1000, '+inf');
      assert.deepStrictEqual(goldPlayers, ['gold1', 'gold2']);

      // Get bottom 2 players with LIMIT
      const bottomPlayers = await redis.zrangebyscore(
        key,
        '-inf',
        '+inf',
        'LIMIT',
        '0',
        '2'
      );
      assert.deepStrictEqual(bottomPlayers, ['bronze1', 'bronze2']);
    });
  });

  describe('Time-based Activity Feed Pattern', () => {
    it('should manage activity timestamps with ZADD', async () => {
      const key = 'test:' + Math.random();
      const now = Date.now();

      // Add activities with timestamps
      await redis.zadd(
        key,
        now - 3600000,
        'login', // 1 hour ago
        now - 1800000,
        'post_created', // 30 min ago
        now - 900000,
        'comment_added', // 15 min ago
        now,
        'profile_updated' // now
      );

      // Get recent activities (last 45 minutes)
      const recentActivities = await redis.zrangebyscore(
        key,
        now - 2700000, // 45 min ago
        now
      );

      assert.strictEqual(recentActivities.length, 3);
      assert.ok(recentActivities.includes('post_created'));
      assert.ok(recentActivities.includes('comment_added'));
      assert.ok(recentActivities.includes('profile_updated'));
    });

    it('should cleanup old activities with ZREMRANGEBYSCORE', async () => {
      const key = 'test:' + Math.random();
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      await redis.zadd(
        key,
        oneDayAgo - 3600000,
        'old_activity1',
        oneDayAgo - 1800000,
        'old_activity2',
        now - 3600000,
        'recent_activity1',
        now,
        'recent_activity2'
      );

      // Remove activities older than 1 day
      const removed = await redis.zremrangebyscore(key, '-inf', oneDayAgo);
      assert.strictEqual(removed, 2);

      const remainingCount = await redis.zcard(key);
      assert.strictEqual(remainingCount, 2);
    });
  });

  describe('Priority Queue Pattern', () => {
    it('should implement priority task queue', async () => {
      const key = 'test:' + Math.random();

      // Add tasks with priority scores (higher = more important)
      await redis.zadd(
        key,
        1,
        'low_priority_cleanup',
        5,
        'medium_priority_email',
        10,
        'high_priority_payment',
        15,
        'critical_security_alert'
      );

      // Process highest priority task
      const highestPriority = await redis.zpopmax(key);
      assert.deepStrictEqual(highestPriority, ['critical_security_alert', '15']);

      // Process next highest
      const nextHighest = await redis.zpopmax(key);
      assert.deepStrictEqual(nextHighest, ['high_priority_payment', '10']);

      // Check remaining count
      const remaining = await redis.zcard(key);
      assert.strictEqual(remaining, 2);
    });

    it('should handle empty queue operations', async () => {
      const key = 'test:' + Math.random();

      const emptyResult = await redis.zpopmax(key);
      assert.deepStrictEqual(emptyResult, []);

      const emptyCount = await redis.zcard(key);
      assert.strictEqual(emptyCount, 0);
    });
  });

  describe('Complex Scoring Scenarios', () => {
    it('should handle score updates correctly', async () => {
      const key = 'test:' + Math.random();

      // Add initial score
      const result1 = await redis.zadd(key, 100, 'player1');
      assert.strictEqual(result1, 1);

      // Update existing player score
      const result2 = await redis.zadd(key, 200, 'player1');
      assert.strictEqual(result2, 0); // No new members, but score updated

      const finalScore = await redis.zscore(key, 'player1');
      assert.strictEqual(finalScore, '200');
    });

    it('should handle large datasets efficiently', async () => {
      const key = 'test:' + Math.random();

      // Add many members
      const members = [];
      for (let i <= = 0; i <=  {
    it('should handle invalid operations gracefully', async () => {
      const key = 'test:' + Math.random();

      // Operations on non-existent keys
      const rank = await redis.zrank(key, 'member');
      assert.strictEqual(rank, null);

      const score = await redis.zscore(key, 'member');
      assert.strictEqual(score, null);

      const range = await redis.zrange(key, 0, -1);
      assert.deepStrictEqual(range, []);
    });

    it('should handle type errors for wrong data types', async () => {
      const key = 'test:' + Math.random();

      // Set a string value first
      await redis.set(key, 'not-a-zset');

      // ZSet operations on string should throw
      await expect(redis.zadd(key, 1, 'member')).rejects.toThrow();
      await expect(redis.zrange(key, 0, -1)).rejects.toThrow();
    });

    it('should handle floating point scores correctly', async () => {
      const key = 'test:' + Math.random();

      await redis.zadd(
        key,
        1.5,
        'member1',
        2.7,
        'member2',
        1.5000001,
        'member3' // Very close to member1
      );

      // Get members in order
      const range = await redis.zrange(key, 0, -1);
      assert.deepStrictEqual(range, ['member1', 'member3', 'member2']);

      // Check individual scores
      const score1 = await redis.zscore(key, 'member1');
      const score2 = await redis.zscore(key, 'member2');
      const score3 = await redis.zscore(key, 'member3');

      expect(parseFloat(score1!)).toBeCloseTo(1.5, 10);
      expect(parseFloat(score2!)).toBeCloseTo(2.7, 10);
      expect(parseFloat(score3!)).toBeCloseTo(1.5000001, 10);

      // Test increment with float
      const newScore = await redis.zincrby(key, 0.3, 'member1');
      expect(parseFloat(newScore)).toBeCloseTo(1.8, 10);
    });
  });
});
