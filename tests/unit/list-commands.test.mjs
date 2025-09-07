/**
 * List Commands Comprehensive Tests
 * Real-world patterns queues, task queues, activity logs, job processing
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

describe('List Commands - Real-World Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = getStandaloneConfig();
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
    await redis.quit();
  });

  describe('Task Queue Implementation', () => {
    test('should manage task queue with LPUSH/RPOP', async () => {
      const queueKey = 'queue:tasks:' + Math.random();

      // Add tasks to queue (FIFO - First In, First Out)
      const result1 = await redis.lpush(queueKey, 'task1');
      assert.strictEqual(result1, 1);

      const result2 = await redis.lpush(queueKey, 'task2', 'task3');
      assert.strictEqual(result2, 3);

      // Process tasks from queue
      const firstTask = await redis.rpop(queueKey);
      assert.strictEqual(firstTask, 'task1'); // First task added

      const secondTask = await redis.rpop(queueKey);
      assert.strictEqual(secondTask, 'task2');

      // Check remaining queue length
      const queueLength = await redis.llen(queueKey);
      assert.strictEqual(queueLength, 1);
    });

    test('should implement priority queue with LPUSH/LPOP', async () => {
      const priorityKey = 'queue:priority:' + Math.random();

      // Add high-priority tasks at head
      await redis.lpush(priorityKey, 'normal_task');
      await redis.lpush(priorityKey, 'high_priority_task');

      // Process highest priority first
      const highPriorityTask = await redis.lpop(priorityKey);
      assert.strictEqual(highPriorityTask, 'high_priority_task');

      const normalTask = await redis.lpop(priorityKey);
      assert.strictEqual(normalTask, 'normal_task');
    });

    test('should handle bulk task operations with LPUSH/RPUSH', async () => {
      const bulkKey = 'queue:bulk:' + Math.random();

      // Add multiple tasks at once
      const tasks = ['task1', 'task2', 'task3', 'task4'];
      const result = await redis.lpush(bulkKey, ...tasks);
      assert.strictEqual(result, 4);

      // Get all tasks
      const allTasks = await redis.lrange(bulkKey, 0, -1);
      assert.deepStrictEqual(allTasks, ['task4', 'task3', 'task2', 'task1']); // Reversed order due to LPUSH
    });
  });

  describe('Message Queue Pattern', () => {
    test('should implement producer-consumer pattern', async () => {
      const messageKey = 'messages:channel:' + Math.random();

      // Producer sends messages
      const messageData = {
        id: '123',
        type: 'email',
        recipient: 'user@example.com',
        timestamp: Date.now(),
      };

      await redis.rpush(messageKey, JSON.stringify(messageData));

      // Consumer receives message
      const rawMessage = await redis.lpop(messageKey);
      assert.ok(rawMessage);

      if (rawMessage) {
        const message = JSON.parse(rawMessage);
        assert.strictEqual(message.type, 'email');
        assert.strictEqual(message.recipient, 'user@example.com');
      }
    });

    test('should handle message inspection with LRANGE', async () => {
      const inspectKey = 'messages:inspect:' + Math.random();

      // Add several messages
      const messages = [
        JSON.stringify({ id: 1, type: 'notification' }),
        JSON.stringify({ id: 2, type: 'email' }),
        JSON.stringify({ id: 3, type: 'sms' }),
      ];

      await redis.rpush(inspectKey, ...messages);

      // Inspect queue without removing messages
      const firstThree = await redis.lrange(inspectKey, 0, 2);
      assert.strictEqual(firstThree.length, 3);

      const parsedFirst = JSON.parse(firstThree[0]);
      assert.strictEqual(parsedFirst.id, 1);

      // Queue should still have all messages
      const queueLength = await redis.llen(inspectKey);
      assert.strictEqual(queueLength, 3);
    });
  });

  describe('Activity Log Pattern', () => {
    test('should maintain user activity logs with LPUSH', async () => {
      const activityKey = 'activity:user123:' + Math.random();

      // Log user activities (most recent first)
      await redis.lpush(
        activityKey,
        JSON.stringify({ action: 'login', timestamp: Date.now() })
      );

      await redis.lpush(
        activityKey,
        JSON.stringify({ action: 'view_profile', timestamp: Date.now() + 1000 })
      );

      await redis.lpush(
        activityKey,
        JSON.stringify({
          action: 'update_settings',
          timestamp: Date.now() + 2000,
        })
      );

      // Get recent activities (last 5)
      const recentActivities = await redis.lrange(activityKey, 0, 4);
      assert.strictEqual(recentActivities.length, 3);

      const latestActivity = JSON.parse(recentActivities[0]);
      assert.strictEqual(latestActivity.action, 'update_settings'); // Most recent
    });

    test('should implement log rotation with LTRIM', async () => {
      const logKey = 'logs:application:' + Math.random();

      // Add many log entries
      const logEntries = [];
      for (let i = 0; i < 10; i++) {
        logEntries.push(
          JSON.stringify({
            level: 'info',
            message: `Log entry ${i}`,
            timestamp: Date.now() + i,
          })
        );
      }

      await redis.rpush(logKey, ...logEntries);

      // Keep only the last 5 entries
      await redis.ltrim(logKey, -5, -1);

      const remainingLogs = await redis.llen(logKey);
      assert.strictEqual(remainingLogs, 5);

      const logs = await redis.lrange(logKey, 0, -1);
      const firstLog = JSON.parse(logs[0]);
      assert.ok(firstLog.message.includes('Log entry 5')); // First of the kept entries
    });
  });

  describe('Job Processing Queue', () => {
    test('should handle job insertion and retrieval', async () => {
      const jobKey = 'jobs:processing:' + Math.random();

      // Create job data
      const job = {
        id: 'job_123',
        type: 'image_processing',
        data: { imageId: 'img_456', filters: ['resize', 'crop'] },
        priority: 'high',
        createdAt: Date.now(),
      };

      // Add job to queue
      await redis.lpush(jobKey, JSON.stringify(job));

      // Worker picks up job
      const rawJob = await redis.rpop(jobKey);
      assert.ok(rawJob);

      if (rawJob) {
        const processedJob = JSON.parse(rawJob);
        assert.strictEqual(processedJob.type, 'image_processing');
        assert.strictEqual(processedJob.data.imageId, 'img_456');
      }
    });

    test('should implement failed job retry queue', async () => {
      const mainQueueKey = 'jobs:main:' + Math.random();
      const retryQueueKey = 'jobs:retry:' + Math.random();

      const job = {
        id: 'job_456',
        type: 'email_sending',
        attempts: 0,
        maxAttempts: 3,
      };

      // Job fails, move to retry queue
      await redis.rpush(
        retryQueueKey,
        JSON.stringify({
          ...job,
          attempts: 1,
          lastError: 'SMTP connection failed',
        })
      );

      // Retry processor moves job back to main queue
      const retryJob = await redis.lpop(retryQueueKey);
      assert.ok(retryJob);

      if (retryJob) {
        const jobData = JSON.parse(retryJob);
        assert.strictEqual(jobData.attempts, 1);

        // Move back to main queue for retry
        await redis.lpush(mainQueueKey, JSON.stringify(jobData));
      }

      const mainQueueLength = await redis.llen(mainQueueKey);
      assert.strictEqual(mainQueueLength, 1);
    });
  });

  describe('Advanced List Operations', () => {
    test('should handle list element access by index', async () => {
      const indexKey = 'list:indexed:' + Math.random();

      await redis.rpush(indexKey, 'item0', 'item1', 'item2', 'item3');

      // Access specific elements
      const firstItem = await redis.lindex(indexKey, 0);
      assert.strictEqual(firstItem, 'item0');

      const lastItem = await redis.lindex(indexKey, -1);
      assert.strictEqual(lastItem, 'item3');

      const middleItem = await redis.lindex(indexKey, 2);
      assert.strictEqual(middleItem, 'item2');

      // Non-existent index
      const nonExistent = await redis.lindex(indexKey, 10);
      assert.strictEqual(nonExistent, null);
    });

    test('should modify list elements with LSET', async () => {
      const modifyKey = 'list:modify:' + Math.random();

      await redis.rpush(modifyKey, 'original1', 'original2', 'original3');

      // Update middle element
      await redis.lset(modifyKey, 1, 'updated2');

      const updatedList = await redis.lrange(modifyKey, 0, -1);
      assert.deepStrictEqual(updatedList, [
        'original1',
        'updated2',
        'original3',
      ]);

      // Update first element
      await redis.lset(modifyKey, 0, 'updated1');

      const finalList = await redis.lrange(modifyKey, 0, -1);
      assert.deepStrictEqual(finalList, ['updated1', 'updated2', 'original3']);
    });

    test('should remove elements with LREM', async () => {
      const removeKey = 'list:remove:' + Math.random();

      // Create list with duplicates
      await redis.rpush(
        removeKey,
        'item1',
        'duplicate',
        'item2',
        'duplicate',
        'item3',
        'duplicate'
      );

      // Remove first 2 occurrences of 'duplicate'
      const removed = await redis.lrem(removeKey, 2, 'duplicate');
      assert.strictEqual(removed, 2);

      const afterRemove = await redis.lrange(removeKey, 0, -1);
      assert.deepStrictEqual(afterRemove, [
        'item1',
        'item2',
        'item3',
        'duplicate',
      ]);

      // Remove all remaining occurrences
      const removedAll = await redis.lrem(removeKey, 0, 'duplicate');
      assert.strictEqual(removedAll, 1);

      const final = await redis.lrange(removeKey, 0, -1);
      assert.deepStrictEqual(final, ['item1', 'item2', 'item3']);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle operations on non-existent lists', async () => {
      const nonExistentKey = 'nonexistent:list:' + Math.random();

      // Operations on non-existent list
      const popResult = await redis.lpop(nonExistentKey);
      assert.strictEqual(popResult, null);

      const length = await redis.llen(nonExistentKey);
      assert.strictEqual(length, 0);

      const range = await redis.lrange(nonExistentKey, 0, -1);
      assert.deepStrictEqual(range, []);

      const index = await redis.lindex(nonExistentKey, 0);
      assert.strictEqual(index, null);
    });

    test('should handle type conflicts gracefully', async () => {
      const stringKey = 'string:conflict:' + Math.random();

      // Set a string value
      await redis.set(stringKey, 'not-a-list');

      // List operations should fail on string keys
      await assert.rejects(async () => {
        await redis.lpush(stringKey, 'value');
      });
      await assert.rejects(async () => {
        await redis.lrange(stringKey, 0, -1);
      });
    });

    test('should handle empty list cleanup', async () => {
      const cleanupKey = 'list:cleanup:' + Math.random();

      await redis.lpush(cleanupKey, 'only_item');

      // Remove the only item
      const item = await redis.lpop(cleanupKey);
      assert.strictEqual(item, 'only_item');

      // List should be empty but operations should still work
      const length = await redis.llen(cleanupKey);
      assert.strictEqual(length, 0);

      const range = await redis.lrange(cleanupKey, 0, -1);
      assert.deepStrictEqual(range, []);
    });

    test('should handle large list operations', async () => {
      const largeKey = 'list:large:' + Math.random();

      // Add many items
      const items = [];
      for (let i = 0; i < 1000; i++) {
        items.push(`item${i}`);
      }

      const result = await redis.rpush(largeKey, ...items);
      assert.strictEqual(result, 1000);

      // Get subset
      const subset = await redis.lrange(largeKey, 0, 9);
      assert.strictEqual(subset.length, 10);
      assert.strictEqual(subset[0], 'item0');
      assert.strictEqual(subset[9], 'item9');

      // Trim to smaller size
      await redis.ltrim(largeKey, 0, 99);
      const trimmedLength = await redis.llen(largeKey);
      assert.strictEqual(trimmedLength, 100);
    });
  });
});
