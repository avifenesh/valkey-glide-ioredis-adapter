/**
 * Set Commands Comprehensive Tests
 * Real-world patterns networks, tagging, analytics, permissions, A/B testing
 * Based on Twitter, Instagram, Discord, LinkedIn production usage patterns
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

describe('Set Commands - Social Network & Analytics Patterns', () => {
  let client;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    client = new Redis(config);

    await client.connect();

    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  afterEach(async () => {
    await client.quit();
  });

  describe('Twitter-Style Follower/Following System', () => {
    test('should manage follower relationships with SADD/SREM', async () => {
      const userId = 'user_' + Math.random();
      const followersKey = `followers:${userId}`;
      const followingKey = `following:${userId}`;

      // User gets new followers
      const result1 = await client.sadd(
        followersKey,
        'follower1',
        'follower2',
        'follower3'
      );
      assert.strictEqual(result1, 3);

      // User follows others
      const result2 = await client.sadd(
        followingKey,
        'following1',
        'following2'
      );
      assert.strictEqual(result2, 2);

      // Check follower count
      const followerCount = await client.scard(followersKey);
      assert.strictEqual(followerCount, 3);

      // Check if specific user is following
      const isFollowing = await client.sismember(followingKey, 'following1');
      assert.strictEqual(isFollowing, 1);

      // Unfollow someone
      const removed = await client.srem(followingKey, 'following2');
      assert.strictEqual(removed, 1);

      const finalFollowingCount = await client.scard(followingKey);
      assert.strictEqual(finalFollowingCount, 1);
    });

    test('should find mutual followers using SINTER', async () => {
      const user1 = 'user1_' + Math.random();
      const user2 = 'user2_' + Math.random();
      const followers1Key = `followers:${user1}`;
      const followers2Key = `followers:${user2}`;

      // Set up follower lists
      await client.sadd(followers1Key, 'alice', 'bob', 'charlie', 'david');
      await client.sadd(followers2Key, 'bob', 'charlie', 'eve', 'frank');

      // Find mutual followers
      const mutualFollowers = await client.sinter(followers1Key, followers2Key);
      assert.deepStrictEqual(mutualFollowers.sort(), ['bob', 'charlie']);

      // Store mutual followers for caching
      const mutualKey = `mutual:${user1}:${user2}`;
      const stored = await client.sinterstore(
        mutualKey,
        followers1Key,
        followers2Key
      );
      assert.strictEqual(stored, 2);

      const cachedMutual = await client.smembers(mutualKey);
      assert.deepStrictEqual(cachedMutual.sort(), ['bob', 'charlie']);
    });

    test('should suggest friends using SDIFF for "people you may know"', async () => {
      const userId = 'user_' + Math.random();
      const friendId = 'friend_' + Math.random();
      const userFollowingKey = `following:${userId}`;
      const friendFollowingKey = `following:${friendId}`;

      // User follows some people
      await client.sadd(userFollowingKey, 'alice', 'bob', 'charlie');

      // Friend follows overlapping + different people
      await client.sadd(
        friendFollowingKey,
        'alice',
        'bob',
        'david',
        'eve',
        'frank'
      );

      // Find people friend follows that user doesn't (suggestions)
      const suggestions = await client.sdiff(
        friendFollowingKey,
        userFollowingKey
      );
      assert.deepStrictEqual(suggestions.sort(), ['david', 'eve', 'frank']);

      // Store suggestions for later processing
      const suggestionsKey = `suggestions:${userId}:${friendId}`;
      const suggestionCount = await client.sdiffstore(
        suggestionsKey,
        friendFollowingKey,
        userFollowingKey
      );
      assert.strictEqual(suggestionCount, 3);
    });

    test('should aggregate social reach using SUNION', async () => {
      const campaignId = 'campaign_' + Math.random();
      const influencer1Followers = `followers:influencer1_${campaignId}`;
      const influencer2Followers = `followers:influencer2_${campaignId}`;
      const influencer3Followers = `followers:influencer3_${campaignId}`;

      // Set up influencer follower bases
      await client.sadd(
        influencer1Followers,
        'user1',
        'user2',
        'user3',
        'user4'
      );
      await client.sadd(
        influencer2Followers,
        'user3',
        'user4',
        'user5',
        'user6'
      );
      await client.sadd(
        influencer3Followers,
        'user5',
        'user6',
        'user7',
        'user8'
      );

      // Calculate total unique reach
      const totalReach = await client.sunion(
        influencer1Followers,
        influencer2Followers,
        influencer3Followers
      );
      assert.strictEqual(totalReach.length, 8); // All unique users

      // Store campaign reach for analytics
      const reachKey = `campaign_reach:${campaignId}`;
      const reachCount = await client.sunionstore(
        reachKey,
        influencer1Followers,
        influencer2Followers,
        influencer3Followers
      );
      assert.strictEqual(reachCount, 8);
    });
  });

  describe('Instagram-Style Content Tagging System', () => {
    test('should manage post tags and find trending topics', async () => {
      const sessionId = Math.random();

      // Posts with their tags
      const postTags = [
        {
          post: `post1_${sessionId}`,
          tags: ['photography', 'nature', 'landscape'],
        },
        {
          post: `post2_${sessionId}`,
          tags: ['photography', 'portrait', 'art'],
        },
        {
          post: `post3_${sessionId}`,
          tags: ['nature', 'wildlife', 'photography'],
        },
        { post: `post4_${sessionId}`, tags: ['art', 'digital', 'design'] },
      ];

      // Store tags for each post
      for (const { post, tags } of postTags) {
        await client.sadd(`post_tags:${post}`, ...tags);
      }

      // Find posts tagged with 'photography'
      const photographyPosts = [];
      for (const { post, tags } of postTags) {
        if (tags.includes('photography')) {
          photographyPosts.push(post);
        }
      }

      // Verify by checking membership
      for (const postData of postTags) {
        const hasPhotography = await client.sismember(
          `post_tags:${postData.post}`,
          'photography'
        );
        const expected = postData.tags.includes('photography') ? 1 : 0;
        assert.strictEqual(hasPhotography, expected);
      }

      // Find posts with both 'photography' and 'nature'
      const photoNaturePosts = await client.sinter(
        `post_tags:post1_${sessionId}`,
        `post_tags:post3_${sessionId}`
      );
      assert.deepStrictEqual(photoNaturePosts.sort(), [
        'nature',
        'photography',
      ]);
    });

    test('should implement hashtag recommendation system', async () => {
      const userId = 'user_' + Math.random();
      const userTagsKey = `user_tags:${userId}`;
      const trendingTagsKey = `trending_tags:${Date.now()}`;

      // User's historically used tags
      await client.sadd(userTagsKey, 'photography', 'travel', 'food', 'nature');

      // Currently trending tags
      await client.sadd(
        trendingTagsKey,
        'photography',
        'sunset',
        'ocean',
        'adventure',
        'foodie'
      );

      // Find trending tags user hasn't used much (recommendations)
      const recommendations = await client.sdiff(trendingTagsKey, userTagsKey);
      assert.ok(recommendations.includes('sunset'));
      assert.ok(recommendations.includes('ocean'));
      assert.ok(recommendations.includes('adventure'));

      // Find user's tags that are also trending (engagement boost)
      const trendingUserTags = await client.sinter(
        userTagsKey,
        trendingTagsKey
      );
      assert.ok(trendingUserTags.includes('photography'));
    });
  });

  describe('Discord-Style Permission & Role System', () => {
    test('should manage user roles and permissions', async () => {
      const serverId = 'server_' + Math.random();
      const userId = 'user_' + Math.random();
      const userRolesKey = `user_roles:${serverId}:${userId}`;

      // Assign roles to user
      const rolesAdded = await client.sadd(
        userRolesKey,
        'member',
        'moderator',
        'verified'
      );
      assert.strictEqual(rolesAdded, 3);

      // Check if user has specific role
      const isModerator = await client.sismember(userRolesKey, 'moderator');
      assert.strictEqual(isModerator, 1);

      const isAdmin = await client.sismember(userRolesKey, 'admin');
      assert.strictEqual(isAdmin, 0);

      // Remove a role
      const rolesRemoved = await client.srem(userRolesKey, 'verified');
      assert.strictEqual(rolesRemoved, 1);

      // Get all user roles
      const allRoles = await client.smembers(userRolesKey);
      assert.deepStrictEqual(allRoles.sort(), ['member', 'moderator']);
    });

    test('should implement channel access control', async () => {
      const channelId = 'channel_' + Math.random();
      const allowedRolesKey = `channel_access:${channelId}`;
      const userId = 'user_' + Math.random();
      const userRolesKey = `user_roles:${userId}`;

      // Set channel access requirements
      await client.sadd(allowedRolesKey, 'admin', 'moderator', 'vip');

      // User has some roles
      await client.sadd(userRolesKey, 'member', 'verified');

      // Check if user can access channel
      const hasAccess = await client.sinter(userRolesKey, allowedRolesKey);
      assert.strictEqual(hasAccess.length, 0); // No access

      // Give user moderator role
      await client.sadd(userRolesKey, 'moderator');

      // Check access again
      const hasAccessNow = await client.sinter(userRolesKey, allowedRolesKey);
      assert.ok(hasAccessNow.includes('moderator'));
      assert.strictEqual(hasAccessNow.length, 1);
    });
  });

  describe('LinkedIn-Style Professional Network', () => {
    test('should manage professional connections and recommendations', async () => {
      const userId = 'professional_' + Math.random();
      const connectionsKey = `connections:${userId}`;
      const skillsKey = `skills:${userId}`;

      // User's professional connections
      await client.sadd(
        connectionsKey,
        'colleague1',
        'colleague2',
        'client1',
        'mentor1'
      );

      // User's skills
      await client.sadd(skillsKey, 'javascript', 'redis', 'nodejs', 'react');

      // Find connection's skills for recommendations
      const colleague1Skills = `skills:colleague1_${Math.random()}`;
      await client.sadd(
        colleague1Skills,
        'redis',
        'python',
        'kubernetes',
        'docker'
      );

      // Find skill overlap for collaboration opportunities
      const sharedSkills = await client.sinter(skillsKey, colleague1Skills);
      assert.ok(sharedSkills.includes('redis'));

      // Find skills to learn from connections
      const skillsToLearn = await client.sdiff(colleague1Skills, skillsKey);
      assert.ok(skillsToLearn.includes('python'));
      assert.ok(skillsToLearn.includes('kubernetes'));
    });

    test('should implement company employee network', async () => {
      const companyId = 'company_' + Math.random();
      const engineersKey = `employees:${companyId}:engineering`;
      const marketingKey = `employees:${companyId}:marketing`;
      const managementKey = `employees:${companyId}:management`;

      // Department employees
      await client.sadd(engineersKey, 'alice', 'bob', 'charlie');
      await client.sadd(marketingKey, 'david', 'eve', 'frank');
      await client.sadd(managementKey, 'alice', 'david'); // Cross-functional

      // Find cross-functional employees
      const crossFunctional = await client.sinter(engineersKey, managementKey);
      assert.ok(crossFunctional.includes('alice'));

      // All company employees
      const allEmployees = await client.sunion(
        engineersKey,
        marketingKey,
        managementKey
      );
      assert.strictEqual(allEmployees.length, 6); // All individual employees

      // Non-management engineers
      const nonMgmtEngineers = await client.sdiff(engineersKey, managementKey);
      assert.deepStrictEqual(nonMgmtEngineers.sort(), ['bob', 'charlie']);
    });
  });

  describe('Real-Time Analytics & A/B Testing', () => {
    test('should track unique visitors and sessions', async () => {
      const date = new Date().toISOString().split('T')[0];
      const uniqueVisitorsKey = `visitors:${date}`;
      const mobileVisitorsKey = `visitors:mobile:${date}`;
      const desktopVisitorsKey = `visitors:desktop:${date}`;

      // Track unique visitors by device
      await client.sadd(
        uniqueVisitorsKey,
        'user1',
        'user2',
        'user3',
        'user4',
        'user5'
      );
      await client.sadd(mobileVisitorsKey, 'user1', 'user3', 'user5');
      await client.sadd(desktopVisitorsKey, 'user2', 'user4', 'user5'); // user5 uses both

      // Get analytics
      const totalUnique = await client.scard(uniqueVisitorsKey);
      assert.strictEqual(totalUnique, 5);

      const mobileCount = await client.scard(mobileVisitorsKey);
      assert.strictEqual(mobileCount, 3);

      // Find users who use both mobile and desktop
      const crossPlatformUsers = await client.sinter(
        mobileVisitorsKey,
        desktopVisitorsKey
      );
      assert.ok(crossPlatformUsers.includes('user5'));

      // Find mobile-only users
      const mobileOnly = await client.sdiff(
        mobileVisitorsKey,
        desktopVisitorsKey
      );
      assert.deepStrictEqual(mobileOnly.sort(), ['user1', 'user3']);
    });

    test('should implement A/B testing cohorts', async () => {
      const experimentId = 'experiment_' + Date.now() + '_' + Math.random();
      const controlGroupKey = `experiment:${experimentId}:control`;
      const variantAKey = `experiment:${experimentId}:variant_a`;
      const variantBKey = `experiment:${experimentId}:variant_b`;

      // Assign users to test groups
      await client.sadd(controlGroupKey, 'user1', 'user2', 'user3');
      await client.sadd(variantAKey, 'user4', 'user5', 'user6');
      await client.sadd(variantBKey, 'user7', 'user8', 'user9');

      // Track conversions
      const controlConvertsKey = `experiment:${experimentId}:control:converts`;
      const variantAConvertsKey = `experiment:${experimentId}:variant_a:converts`;

      await client.sadd(controlConvertsKey, 'user1'); // 1/3 = 33%
      await client.sadd(variantAConvertsKey, 'user4', 'user5'); // 2/3 = 67%

      // Calculate conversion rates
      const controlSize = await client.scard(controlGroupKey);
      const controlConverts = await client.scard(controlConvertsKey);
      const controlRate = controlConverts / controlSize;

      const variantASize = await client.scard(variantAKey);
      const variantAConverts = await client.scard(variantAConvertsKey);
      const variantARate = variantAConverts / variantASize;

      assert.ok(Math.abs(controlRate - 0.33) < Math.pow(10, -2));
      assert.ok(Math.abs(variantARate - 0.67) < Math.pow(10, -2));

      // Find users who converted in variant A
      const variantAConverters = await client.sinter(
        variantAKey,
        variantAConvertsKey
      );
      assert.deepStrictEqual(variantAConverters.sort(), ['user4', 'user5']);
    });

    test('should track feature usage patterns', async () => {
      const featureId = 'feature_' + Math.random();
      const betaUsersKey = `beta_users:${featureId}`;
      const activeUsersKey = `active_users:${featureId}`;
      const feedbackUsersKey = `feedback_users:${featureId}`;

      // Beta user cohort
      await client.sadd(
        betaUsersKey,
        'beta1',
        'beta2',
        'beta3',
        'beta4',
        'beta5'
      );

      // Active users of the feature
      await client.sadd(
        activeUsersKey,
        'beta1',
        'beta3',
        'beta5',
        'user1',
        'user2'
      );

      // Users who provided feedback
      await client.sadd(feedbackUsersKey, 'beta1', 'beta2', 'user1');

      // Beta users actively using the feature
      const activeBetaUsers = await client.sinter(betaUsersKey, activeUsersKey);
      assert.deepStrictEqual(activeBetaUsers.sort(), [
        'beta1',
        'beta3',
        'beta5',
      ]);

      // Non-beta users using the feature (general rollout)
      const generalUsers = await client.sdiff(activeUsersKey, betaUsersKey);
      assert.deepStrictEqual(generalUsers.sort(), ['user1', 'user2']);

      // Beta users who haven't provided feedback yet
      const betaNoFeedback = await client.sdiff(betaUsersKey, feedbackUsersKey);
      assert.deepStrictEqual(betaNoFeedback.sort(), [
        'beta3',
        'beta4',
        'beta5',
      ]);
    });
  });

  describe('E-commerce & Content Filtering', () => {
    test('should implement product recommendation engine', async () => {
      const userId = 'customer_' + Math.random();
      const userInterestsKey = `interests:${userId}`;
      const userPurchasesKey = `purchases:${userId}`;

      // User's interests and purchase history
      await client.sadd(
        userInterestsKey,
        'electronics',
        'gaming',
        'books',
        'music'
      );
      await client.sadd(userPurchasesKey, 'laptop', 'headphones', 'novel');

      // Product categories
      const electronicsKey = `category:electronics:${Math.random()}`;
      const gamingKey = `category:gaming:${Math.random()}`;

      await client.sadd(
        electronicsKey,
        'smartphone',
        'tablet',
        'headphones',
        'laptop'
      );
      await client.sadd(
        gamingKey,
        'console',
        'controller',
        'game1',
        'headphones'
      );

      // Find products user might like but hasn't bought
      const electronicsNotPurchased = await client.sdiff(
        electronicsKey,
        userPurchasesKey
      );
      assert.ok(electronicsNotPurchased.includes('smartphone'));
      assert.ok(electronicsNotPurchased.includes('tablet'));

      // Cross-category recommendations (products in multiple interested categories)
      const crossCategoryProducts = await client.sinter(
        electronicsKey,
        gamingKey
      );
      assert.ok(crossCategoryProducts.includes('headphones'));
    });

    test('should implement content moderation system', async () => {
      const postId = 'post_' + Math.random();
      const reportedByKey = `reported:${postId}`;
      const moderatorsKey = `moderators:${Math.random()}`;
      const reviewedByKey = `reviewed:${postId}`;

      // Users who reported the content
      await client.sadd(reportedByKey, 'user1', 'user2', 'user3');

      // Available moderators
      await client.sadd(moderatorsKey, 'mod1', 'mod2', 'mod3');

      // Moderators who reviewed
      await client.sadd(reviewedByKey, 'mod1', 'mod2');

      // Check report count
      const reportCount = await client.scard(reportedByKey);
      assert.strictEqual(reportCount, 3);

      // Find moderators who haven't reviewed yet
      const pendingModerators = await client.sdiff(
        moderatorsKey,
        reviewedByKey
      );
      assert.ok(pendingModerators.includes('mod3'));

      // Check if enough moderators reviewed (consensus)
      const reviewCount = await client.scard(reviewedByKey);
      const consensusReached = reviewCount >= 2;
      assert.strictEqual(consensusReached, true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle operations on non-existent sets', async () => {
      const nonExistentKey = 'nonexistent:set:' + Math.random();

      // Operations on non-existent set
      const members = await client.smembers(nonExistentKey);
      assert.deepStrictEqual(members, []);

      const cardinality = await client.scard(nonExistentKey);
      assert.strictEqual(cardinality, 0);

      const isMember = await client.sismember(nonExistentKey, 'member');
      assert.strictEqual(isMember, 0);

      const popped = await client.spop(nonExistentKey);
      assert.strictEqual(popped, null);

      const random = await client.srandmember(nonExistentKey);
      assert.strictEqual(random, null);
    });

    test('should handle type conflicts gracefully', async () => {
      const stringKey = 'string:conflict:' + Math.random();

      // Set first
      await client.set(stringKey, 'not-a-set');

      // Set operations should fail
      await assert.rejects(async () => {
        await client.sadd(stringKey, 'member');
      });
      await assert.rejects(async () => {
        await client.smembers(stringKey);
      });
    });

    test('should handle large sets efficiently', async () => {
      const largeSetKey = 'large:set:' + Math.random();

      // Add many members
      const members = Array.from({ length: 1000 }, (_, i) => `member${i}`);
      const added = await client.sadd(largeSetKey, ...members);
      assert.strictEqual(added, 1000);

      // Verify count
      const count = await client.scard(largeSetKey);
      assert.strictEqual(count, 1000);

      // Random sampling
      const samples = await client.srandmember(largeSetKey, 10);
      assert.strictEqual(samples.length, 10);

      // Pop some members
      const popped = await client.spop(largeSetKey, 5);
      assert.strictEqual(popped.length, 5);

      const remainingCount = await client.scard(largeSetKey);
      assert.strictEqual(remainingCount, 995);
    });

    test('should handle set operations with mixed data types', async () => {
      const mixedSetKey = 'mixed:set:' + Math.random();

      // Add different types of data
      await client.sadd(mixedSetKey, '123', 'string', 'user:456', 'tag:789');

      const allMembers = await client.smembers(mixedSetKey);
      assert.strictEqual(allMembers.length, 4);

      // Check membership
      assert.strictEqual(await client.sismember(mixedSetKey, '123'), 1);
      assert.strictEqual(await client.sismember(mixedSetKey, 'string'), 1);
      assert.strictEqual(await client.sismember(mixedSetKey, 'user:456'), 1);

      // Remove specific types
      const removed = await client.srem(mixedSetKey, 'user:456', 'tag:789');
      assert.strictEqual(removed, 2);

      const remaining = await client.smembers(mixedSetKey);
      assert.deepStrictEqual(remaining.sort(), ['123', 'string']);
    });
  });
});
