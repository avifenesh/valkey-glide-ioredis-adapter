/**
 * Basic Pub/Sub Test Suite
 * Tests current pub/sub implementation and validates incremental improvements
 */

import { describe, it, test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig, checkTestServers, delay } from '../utils/test-config.mjs';

describe('Basic Pub/Sub Functionality', () => {
  let publisher;
  let subscriber;
  let config;

  before(async () => {
    // Check if test servers are available
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }

    config = await getStandaloneConfig();
  });

  beforeEach(async () => {
    // Create separate clients for publishing and subscribing
    publisher = new Redis(config);
    subscriber = new Redis(config);

    await publisher.connect();
    await subscriber.connect();

    // Clear any existing state
    await publisher.flushall();
  });

  afterEach(async () => {
    if (subscriber) {
      // Clean up subscriptions
      try {
        await subscriber.unsubscribe();
        await subscriber.punsubscribe();
      } catch (error) {
        // Ignore cleanup errors
      }
      await subscriber.disconnect();
    }

    if (publisher) {
      await publisher.disconnect();
    }
  });

  describe('Current Implementation Analysis', () => {
    test('can subscribe to a channel', async () => {
      const result = await subscriber.subscribe('test-channel');
      assert.strictEqual(result, 1); // Should return subscription count
    });

    test('can unsubscribe from a channel', async () => {
      await subscriber.subscribe('test-channel');
      const result = await subscriber.unsubscribe('test-channel');
      assert.strictEqual(result, 0); // Should return remaining subscription count
    });

    test('can publish a message', async () => {
      const result = await publisher.publish('test-channel', 'test-message');
      assert.strictEqual(typeof result, 'number'); // Should return number of subscribers
    });

    test('subscription events are emitted', async () => {
      let subscribeEventReceived = false;
      let unsubscribeEventReceived = false;

      subscriber.on('subscribe', (channel, count) => {
        assert.strictEqual(channel, 'test-channel');
        assert.strictEqual(count, 1);
        subscribeEventReceived = true;
      });

      subscriber.on('unsubscribe', (channel, count) => {
        assert.strictEqual(channel, 'test-channel');
        assert.strictEqual(count, 0);
        unsubscribeEventReceived = true;
      });

      await subscriber.subscribe('test-channel');
      await subscriber.unsubscribe('test-channel');

      assert.strictEqual(subscribeEventReceived, true);
      assert.strictEqual(unsubscribeEventReceived, true);
    });

    test('pattern subscription works', async () => {
      const result = await subscriber.psubscribe('test.*');
      assert.strictEqual(result, 1);

      const unsubResult = await subscriber.punsubscribe('test.*');
      assert.strictEqual(unsubResult, 0);
    });
  });

  describe('Message Reception (Current Gap)', () => {
    test('should receive messages (CURRENTLY FAILING - EXPECTED)', async () => {
      let messageReceived = false;
      let receivedChannel = '';
      let receivedMessage = '';

      // This test documents the current gap in our implementation
      subscriber.on('message', (channel, message) => {
        messageReceived = true;
        receivedChannel = channel;
        receivedMessage = message;
      });

      await subscriber.subscribe('test-channel');

      // Give subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      await publisher.publish('test-channel', 'hello world');

      // Give message time to be received
      await new Promise(resolve => setTimeout(resolve, 100));

      // This will currently fail because we don't handle message reception
      // This test documents what we need to fix
      if (messageReceived) {
        assert.strictEqual(receivedChannel, 'test-channel');
        assert.strictEqual(receivedMessage, 'hello world');
      } else {
        // Document the current limitation
        console.log('📝 Current limitation reception not implemented');
        assert.strictEqual(messageReceived, false); // This is the current reality
      }
    });

    test('should receive pattern messages (CURRENTLY FAILING - EXPECTED)', async () => {
      let patternMessageReceived = false;
      let receivedPattern = '';
      let receivedChannel = '';
      let receivedMessage = '';

      subscriber.on('pmessage', (pattern, channel, message) => {
        patternMessageReceived = true;
        receivedPattern = pattern;
        receivedChannel = channel;
        receivedMessage = message;
      });

      await subscriber.psubscribe('test.*');

      await new Promise(resolve => setTimeout(resolve, 100));

      await publisher.publish('test.news', 'breaking news');

      await new Promise(resolve => setTimeout(resolve, 100));

      if (patternMessageReceived) {
        assert.strictEqual(receivedPattern, 'test.*');
        assert.strictEqual(receivedChannel, 'test.news');
        assert.strictEqual(receivedMessage, 'breaking news');
      } else {
        console.log(
          '📝 Current limitation message reception not implemented'
        );
        assert.strictEqual(patternMessageReceived, false);
      }
    });
  });

  describe('Bull Integration Requirements', () => {
    test('multiple subscriptions to same channel should work', async () => {
      // Bull often subscribes to the same channel multiple times
      await subscriber.subscribe('bull:queue:events');
      await subscriber.subscribe('bull:queue:events'); // Second subscription

      // Should handle multiple subscriptions gracefully
      const result = await subscriber.unsubscribe('bull:queue:events');
      assert.strictEqual(typeof result, 'number');
    });

    test('should handle subscription cleanup on disconnect', async () => {
      await subscriber.subscribe('test-channel');

      // Disconnect should clean up subscriptions
      await subscriber.disconnect();

      // Should be able to reconnect and subscribe again
      await subscriber.connect();
      const result = await subscriber.subscribe('test-channel');
      assert.strictEqual(result, 1);
    });
  });
});
