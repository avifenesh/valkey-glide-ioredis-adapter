import { PubSubAdapter } from '../adapters/PubSubAdapter';

describe('PubSubAdapter', () => {
  let adapter: PubSubAdapter;

  beforeEach(() => {
    adapter = new PubSubAdapter({
      host: 'localhost',
      port: 6379
    });
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect();
    }
  });

  describe('Basic Subscription Operations', () => {
    test('should create adapter instance', () => {
      expect(adapter).toBeInstanceOf(PubSubAdapter);
    });

    test('should emit subscribe event when subscribing to channel', (done) => {
      adapter.on('subscribe', (channel, count) => {
        expect(channel).toBe('test-channel');
        expect(count).toBe(1);
        done();
      });

      adapter.subscribe('test-channel');
    });

    test('should emit unsubscribe event when unsubscribing from channel', (done) => {
      let subscribeCount = 0;
      
      adapter.on('subscribe', (channel, count) => {
        subscribeCount++;
        if (subscribeCount === 1) {
          // After subscribing, now unsubscribe
          adapter.unsubscribe('test-channel');
        }
      });

      adapter.on('unsubscribe', (channel, count) => {
        expect(channel).toBe('test-channel');
        expect(count).toBe(0);
        done();
      });

      adapter.subscribe('test-channel');
    });

    test('should track subscription count correctly', (done) => {
      let eventCount = 0;
      const expectedEvents = [
        { type: 'subscribe', channel: 'channel1', count: 1 },
        { type: 'subscribe', channel: 'channel2', count: 2 },
        { type: 'unsubscribe', channel: 'channel1', count: 1 }
      ];

      adapter.on('subscribe', (channel, count) => {
        const expected = expectedEvents[eventCount];
        expect(expected.type).toBe('subscribe');
        expect(channel).toBe(expected.channel);
        expect(count).toBe(expected.count);
        eventCount++;

        if (eventCount === 2) {
          // After subscribing to both, unsubscribe from first
          adapter.unsubscribe('channel1');
        }
      });

      adapter.on('unsubscribe', (channel, count) => {
        const expected = expectedEvents[eventCount];
        expect(expected.type).toBe('unsubscribe');
        expect(channel).toBe(expected.channel);
        expect(count).toBe(expected.count);
        done();
      });

      adapter.subscribe('channel1');
      adapter.subscribe('channel2');
    });

    test('should handle pattern subscriptions', (done) => {
      adapter.on('psubscribe', (pattern, count) => {
        expect(pattern).toBe('test:*');
        expect(count).toBe(1);
        done();
      });

      adapter.psubscribe('test:*');
    });

    test('should handle multiple subscriptions in one call', (done) => {
      let eventCount = 0;
      const expectedChannels = ['channel1', 'channel2', 'channel3'];

      adapter.on('subscribe', (channel, count) => {
        expect(expectedChannels[eventCount]).toBe(channel);
        expect(count).toBe(eventCount + 1);
        eventCount++;

        if (eventCount === 3) {
          done();
        }
      });

      adapter.subscribe('channel1', 'channel2', 'channel3');
    });

    test('should provide subscription information methods', async () => {
      await adapter.subscribe('test1', 'test2');
      await adapter.psubscribe('pattern:*');

      expect(adapter.getSubscriptionCount()).toBe(3);
      expect(adapter.getSubscribedChannels()).toEqual(['test1', 'test2']);
      expect(adapter.getSubscribedPatterns()).toEqual(['pattern:*']);
    });
  });

  describe('Error Handling', () => {
    test('should throw error when subscribing without channels', async () => {
      await expect(adapter.subscribe()).rejects.toThrow('SUBSCRIBE requires at least one channel');
    });

    test('should throw error when psubscribing without patterns', async () => {
      await expect(adapter.psubscribe()).rejects.toThrow('PSUBSCRIBE requires at least one pattern');
    });

    test('should emit error events for connection issues', (done) => {
      adapter.on('error', (error) => {
        expect(error).toBeInstanceOf(Error);
        done();
      });

      // Simulate connection error by trying to connect to invalid host
      const badAdapter = new PubSubAdapter({
        host: 'invalid-host',
        port: 9999
      });

      badAdapter.subscribe('test-channel');
    });
  });

  describe('Callbacks', () => {
    test('should execute callback on successful subscription', (done) => {
      adapter.subscribe('test-channel', (err, count) => {
        expect(err).toBeNull();
        expect(count).toBe(1);
        done();
      });
    });

    test('should execute callback on successful unsubscription', (done) => {
      adapter.subscribe('test-channel', () => {
        adapter.unsubscribe('test-channel', (err, count) => {
          expect(err).toBeNull();
          expect(count).toBe(0);
          done();
        });
      });
    });

    test('should execute callback on pattern subscription', (done) => {
      adapter.psubscribe('test:*', (err, count) => {
        expect(err).toBeNull();
        expect(count).toBe(1);
        done();
      });
    });
  });

  describe('Subscriber Mode Behavior', () => {
    test('should prevent regular commands in subscriber mode', async () => {
      await adapter.subscribe('test-channel');

      expect(() => {
        adapter.checkSubscriberMode();
      }).toThrow('ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context');
    });

    test('should allow regular commands when no subscriptions', () => {
      expect(() => {
        adapter.checkSubscriberMode();
      }).not.toThrow();
    });
  });

  describe('PUBLISH Command', () => {
    test('should publish message to channel', async () => {
      const result = await adapter.publish('test-channel', 'test message');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    test('should throw error for invalid arguments', async () => {
      await expect(adapter.publish(123 as any, 'message')).rejects.toThrow(
        'PUBLISH requires channel and message as strings'
      );
      
      await expect(adapter.publish('channel', 123 as any)).rejects.toThrow(
        'PUBLISH requires channel and message as strings'
      );
    });

    test('should handle empty message', async () => {
      const result = await adapter.publish('test-channel', '');
      expect(typeof result).toBe('number');
    });

    test('should handle special characters in message', async () => {
      const specialMessage = 'Hello 世界! @#$%^&*(){}[]';
      const result = await adapter.publish('test-channel', specialMessage);
      expect(typeof result).toBe('number');
    });
  });

  describe('Message Flow Integration', () => {
    test('should receive published messages', (done) => {
      let messageReceived = false;
      
      adapter.on('message', (channel, message) => {
        if (channel === 'integration-test' && message === 'test-message') {
          messageReceived = true;
          done();
        }
      });

      adapter.subscribe('integration-test', async () => {
        // Small delay to ensure subscription is active
        setTimeout(() => {
          adapter.publish('integration-test', 'test-message');
        }, 50);
      });
    });

    test('should receive pattern-matched messages', (done) => {
      adapter.on('pmessage', (pattern, channel, message) => {
        if (pattern === 'events:*' && channel === 'events:test' && message === 'pattern-message') {
          done();
        }
      });

      adapter.psubscribe('events:*', async () => {
        setTimeout(() => {
          adapter.publish('events:test', 'pattern-message');
        }, 50);
      });
    });
  });

  describe('Unsubscribe All Behavior', () => {
    test('should unsubscribe from all channels when called without arguments', (done) => {
      let subscribeEvents = 0;
      let unsubscribeEvents = 0;

      adapter.on('subscribe', () => {
        subscribeEvents++;
        if (subscribeEvents === 2) {
          // After subscribing to both channels, unsubscribe from all
          adapter.unsubscribe();
        }
      });

      adapter.on('unsubscribe', (channel, count) => {
        unsubscribeEvents++;
        if (unsubscribeEvents === 2) {
          expect(count).toBe(0); // Final count should be 0
          done();
        }
      });

      adapter.subscribe('channel1');
      adapter.subscribe('channel2');
    });

    test('should unsubscribe from all patterns when punsubscribe called without arguments', (done) => {
      let subscribeEvents = 0;
      let unsubscribeEvents = 0;

      adapter.on('psubscribe', () => {
        subscribeEvents++;
        if (subscribeEvents === 2) {
          // After subscribing to both patterns, unsubscribe from all
          adapter.punsubscribe();
        }
      });

      adapter.on('punsubscribe', (pattern, count) => {
        unsubscribeEvents++;
        if (unsubscribeEvents === 2) {
          expect(count).toBe(0); // Final count should be 0
          done();
        }
      });

      adapter.psubscribe('pattern1:*');
      adapter.psubscribe('pattern2:*');
    });
  });
});