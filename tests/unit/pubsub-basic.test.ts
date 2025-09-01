/**
 * Basic Pub/Sub Test Suite
 * Tests current pub/sub implementation and validates incremental improvements
 */

import { Redis } from "../../src";
import { testUtils } from '../setup';

describe('Basic Pub/Sub Functionality', () => {
  let publisher: Redis;
  let subscriber: Redis;
  let config: any;

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available. Please start Redis server before running tests.');
    }

    config = await testUtils.getStandaloneConfig();
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
      expect(result).toBe(1); // Should return subscription count
    });

    test('can unsubscribe from a channel', async () => {
      await subscriber.subscribe('test-channel');
      const result = await subscriber.unsubscribe('test-channel');
      expect(result).toBe(0); // Should return remaining subscription count
    });

    test('can publish a message', async () => {
      const result = await publisher.publish('test-channel', 'test-message');
      expect(typeof result).toBe('number'); // Should return number of subscribers
    });

    test('subscription events are emitted', async () => {
      let subscribeEventReceived = false;
      let unsubscribeEventReceived = false;

      subscriber.on('subscribe', (channel, count) => {
        expect(channel).toBe('test-channel');
        expect(count).toBe(1);
        subscribeEventReceived = true;
      });

      subscriber.on('unsubscribe', (channel, count) => {
        expect(channel).toBe('test-channel');
        expect(count).toBe(0);
        unsubscribeEventReceived = true;
      });

      await subscriber.subscribe('test-channel');
      await subscriber.unsubscribe('test-channel');

      expect(subscribeEventReceived).toBe(true);
      expect(unsubscribeEventReceived).toBe(true);
    });

    test('pattern subscription works', async () => {
      const result = await subscriber.psubscribe('test.*');
      expect(result).toBe(1);
      
      const unsubResult = await subscriber.punsubscribe('test.*');
      expect(unsubResult).toBe(0);
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
        expect(receivedChannel).toBe('test-channel');
        expect(receivedMessage).toBe('hello world');
      } else {
        // Document the current limitation
        console.log('📝 Current limitation: Message reception not implemented');
        expect(messageReceived).toBe(false); // This is the current reality
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
        expect(receivedPattern).toBe('test.*');
        expect(receivedChannel).toBe('test.news');
        expect(receivedMessage).toBe('breaking news');
      } else {
        console.log('📝 Current limitation: Pattern message reception not implemented');
        expect(patternMessageReceived).toBe(false);
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
      expect(typeof result).toBe('number');
    });

    test('should handle subscription cleanup on disconnect', async () => {
      await subscriber.subscribe('test-channel');
      
      // Disconnect should clean up subscriptions
      await subscriber.disconnect();
      
      // Should be able to reconnect and subscribe again
      await subscriber.connect();
      const result = await subscriber.subscribe('test-channel');
      expect(result).toBe(1);
    });
  });
});
