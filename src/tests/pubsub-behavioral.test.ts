import { PubSubAdapter } from '../adapters/PubSubAdapter';
import { RedisAdapter } from '../adapters/RedisAdapter';

describe('Pub/Sub ioredis Behavioral Compatibility', () => {
  let subscriber: PubSubAdapter;
  let publisher: RedisAdapter;

  beforeEach(() => {
    subscriber = new PubSubAdapter({ host: 'localhost', port: 6379 });
    publisher = new RedisAdapter({ host: 'localhost', port: 6379 });
  });

  afterEach(async () => {
    await subscriber?.disconnect();
    await publisher?.disconnect();
  });

  describe('Event Emission Behavior', () => {
    test('should emit subscribe events in order with correct counts', (done) => {
      const events: string[] = [];
      
      subscriber.on('subscribe', (channel, count) => {
        events.push(`subscribe:${channel}:${count}`);
        
        if (events.length === 2) {
          expect(events).toEqual(['subscribe:channel1:1', 'subscribe:channel2:2']);
          done();
        }
      });
      
      subscriber.subscribe('channel1', 'channel2');
    });

    test('should emit psubscribe events for patterns', (done) => {
      subscriber.on('psubscribe', (pattern, count) => {
        expect(pattern).toBe('test:*');
        expect(count).toBe(1);
        done();
      });
      
      subscriber.psubscribe('test:*');
    });

    test('should track mixed subscription counts correctly', (done) => {
      const events: Array<{ type: string; name: string; count: number }> = [];
      
      subscriber.on('subscribe', (channel, count) => {
        events.push({ type: 'subscribe', name: channel, count });
        checkComplete();
      });
      
      subscriber.on('psubscribe', (pattern, count) => {
        events.push({ type: 'psubscribe', name: pattern, count });
        checkComplete();
      });
      
      function checkComplete() {
        if (events.length === 3) {
          expect(events).toEqual([
            { type: 'subscribe', name: 'exact1', count: 1 },
            { type: 'psubscribe', name: 'pattern:*', count: 2 },
            { type: 'subscribe', name: 'exact2', count: 3 }
          ]);
          done();
        }
      }
      
      subscriber.subscribe('exact1');
      subscriber.psubscribe('pattern:*');
      subscriber.subscribe('exact2');
    });
  });

  describe('Message Reception', () => {
    test('should receive exact channel messages', (done) => {
      subscriber.on('message', (channel, message) => {
        expect(channel).toBe('test-channel');
        expect(message).toBe('test-message');
        done();
      });
      
      subscriber.subscribe('test-channel', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        await publisher.publish('test-channel', 'test-message');
      });
    });

    test('should receive pattern messages via pmessage', (done) => {
      subscriber.on('pmessage', (pattern, channel, message) => {
        expect(pattern).toBe('news:*');
        expect(channel).toBe('news:sports');
        expect(message).toBe('goal scored');
        done();
      });
      
      subscriber.psubscribe('news:*', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        await publisher.publish('news:sports', 'goal scored');
      });
    });

    test('should emit messageBuffer events when listeners present', (done) => {
      subscriber.on('messageBuffer', (channel, message) => {
        expect(Buffer.isBuffer(channel)).toBe(true);
        expect(Buffer.isBuffer(message)).toBe(true);
        expect(channel.toString()).toBe('buffer-test');
        expect(message.toString()).toBe('buffer-message');
        done();
      });
      
      subscriber.subscribe('buffer-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        await publisher.publish('buffer-test', 'buffer-message');
      });
    });
  });

  describe('Unsubscription Behavior', () => {
    test('should emit unsubscribe events with correct counts', (done) => {
      let subscribeCount = 0;
      
      subscriber.on('subscribe', (channel, count) => {
        subscribeCount++;
        if (subscribeCount === 2) {
          subscriber.unsubscribe('channel1');
        }
      });
      
      subscriber.on('unsubscribe', (channel, count) => {
        expect(channel).toBe('channel1');
        expect(count).toBe(1);
        done();
      });
      
      subscriber.subscribe('channel1', 'channel2');
    });

    test('should handle unsubscribe all functionality', (done) => {
      let subscribeEvents = 0;
      let unsubscribeEvents = 0;
      
      subscriber.on('subscribe', () => {
        subscribeEvents++;
        if (subscribeEvents === 3) {
          subscriber.unsubscribe();
        }
      });
      
      subscriber.on('unsubscribe', (channel, count) => {
        unsubscribeEvents++;
        if (unsubscribeEvents === 3) {
          expect(count).toBe(0);
          done();
        }
      });
      
      subscriber.subscribe('ch1', 'ch2', 'ch3');
    });
  });

  describe('Subscriber Mode Behavior', () => {
    test('should prevent regular commands in subscriber mode', async () => {
      await subscriber.subscribe('test-channel');
      
      expect(() => {
        subscriber.checkSubscriberMode();
      }).toThrow('ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context');
    });

    test('should allow commands when no active subscriptions', () => {
      expect(() => {
        subscriber.checkSubscriberMode();
      }).not.toThrow();
    });
  });

  describe('Callback Support', () => {
    test('should execute callbacks for successful operations', (done) => {
      subscriber.subscribe('test-callback', (err, count) => {
        expect(err).toBeNull();
        expect(count).toBe(1);
        done();
      });
    });

    test('should support mixed callback and promise usage', async () => {
      const count1 = await subscriber.subscribe('promise-test');
      expect(count1).toBe(1);
      
      const count2 = await new Promise<number>((resolve, reject) => {
        subscriber.subscribe('callback-test', (err, count) => {
          if (err) reject(err);
          else resolve(count!);
        });
      });
      
      expect(count2).toBe(2);
    });
  });

  describe('Concurrency Handling', () => {
    test('should handle rapid subscription changes', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(subscriber.subscribe(`rapid-${i}`));
      }
      
      const results = await Promise.all(promises);
      
      expect(results[0]).toBe(1);
      expect(results[9]).toBe(10);
      expect(subscriber.getSubscriptionCount()).toBe(10);
    });

    test('should handle mixed operations correctly', async () => {
      await subscriber.subscribe('ch1', 'ch2', 'ch3');
      
      const operations = [
        subscriber.subscribe('ch4'),
        subscriber.unsubscribe('ch1'),
        subscriber.psubscribe('pattern:*'),
        subscriber.subscribe('ch5'),
        subscriber.unsubscribe('ch2')
      ];
      
      await Promise.all(operations);
      
      const channels = subscriber.getSubscribedChannels();
      const patterns = subscriber.getSubscribedPatterns();
      
      expect(channels.sort()).toEqual(['ch3', 'ch4', 'ch5']);
      expect(patterns).toEqual(['pattern:*']);
      expect(subscriber.getSubscriptionCount()).toBe(4);
    });
  });
});