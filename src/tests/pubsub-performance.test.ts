import { PubSubAdapter } from '../adapters/PubSubAdapter';
import { RedisAdapter } from '../adapters/RedisAdapter';

describe('Pub/Sub Performance Tests', () => {
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

  describe('Subscription Performance', () => {
    test('should handle large number of subscriptions efficiently', async () => {
      const startTime = Date.now();
      const channelCount = 50;
      
      const promises = [];
      for (let i = 0; i < channelCount; i++) {
        promises.push(subscriber.subscribe(`perf-channel-${i}`));
      }
      
      await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      expect(subscriber.getSubscriptionCount()).toBe(channelCount);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    }, 10000);

    test('should handle pattern subscriptions efficiently', async () => {
      const startTime = Date.now();
      const patternCount = 25;
      
      const promises = [];
      for (let i = 0; i < patternCount; i++) {
        promises.push(subscriber.psubscribe(`pattern-${i}:*`));
      }
      
      await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      expect(subscriber.getSubscribedPatterns()).toHaveLength(patternCount);
      expect(duration).toBeLessThan(2000);
    }, 10000);
  });

  describe('Message Throughput', () => {
    test('should handle high-frequency publishing', async () => {
      await subscriber.subscribe('throughput-test');
      
      let messageCount = 0;
      const targetMessages = 50;
      
      const messagePromise = new Promise<void>((resolve) => {
        subscriber.on('message', (channel) => {
          if (channel === 'throughput-test') {
            messageCount++;
            if (messageCount >= targetMessages) {
              resolve();
            }
          }
        });
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const startTime = Date.now();
      
      const publishPromises = [];
      for (let i = 0; i < targetMessages; i++) {
        publishPromises.push(publisher.publish('throughput-test', `message-${i}`));
      }
      
      await Promise.all(publishPromises);
      await messagePromise;
      
      const duration = Date.now() - startTime;
      
      expect(messageCount).toBe(targetMessages);
      expect(duration).toBeLessThan(1500);
    }, 10000);
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent operations efficiently', async () => {
      const operationCount = 30;
      const operations = [];
      
      for (let i = 0; i < operationCount; i++) {
        if (i % 3 === 0) {
          operations.push(subscriber.unsubscribe(`concurrent-${i}`));
        } else {
          operations.push(subscriber.subscribe(`concurrent-${i}`));
        }
      }
      
      const startTime = Date.now();
      await Promise.allSettled(operations);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000);
    }, 5000);
  });
});