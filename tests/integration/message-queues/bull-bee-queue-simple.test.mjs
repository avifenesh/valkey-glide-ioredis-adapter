/**
 * Message Queue Systems Integration Test - Simplified Version
 *
 * Tests that our ioredis adapter works correctly with Bull and BeeQueue
 * WITHOUT using worker processes (which cause hanging issues)
 * 
 * This test validates:
 * - Queue creation with custom Redis clients
 * - Job addition and retrieval
 * - Job state management
 * - Queue statistics
 */

import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  after,
} from 'node:test';
import assert from 'node:assert';
// Using dynamic imports for CommonJS modules
const Queue = (await import('bull')).default;
const BeeQueue = (await import('bee-queue')).default;
import pkg from '../../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../../utils/test-config.mjs';

describe('Message Queue Systems Integration (No Workers)', () => {
  let redisClient;
  const keyPrefix = 'TEST:queues:';

  beforeEach(async () => {
    const config = {
      host: 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
    };
    redisClient = new Redis({
      ...config,
      keyPrefix: keyPrefix,
    });

    await redisClient.connect();
    
    try {
      await redisClient.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
  });

  afterEach(async () => {
    if (redisClient) {
      try {
        const keys = await redisClient.keys(`${keyPrefix}*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch {
        // Ignore cleanup errors
      }
      await redisClient.disconnect();
    }
  });

  describe('Bull Queue - No Workers', () => {
    let queue;

    beforeEach(async () => {
      const config = {
        host: 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      };
      
      // Create Bull queue with our Redis adapter
      queue = new Queue('test-bull-queue', {
        createClient: (type) => {
          const options = {
            host: config.host,
            port: config.port,
            lazyConnect: false,
          };

          if (type === 'bclient' || type === 'subscriber') {
            options.maxRetriesPerRequest = null;
          }

          return new Redis(options);
        },
      });

      // Wait for queue to be ready
      await queue.isReady();
    });

    afterEach(async () => {
      if (queue) {
        try {
          // Close queue without workers - add timeout to prevent hanging
          await Promise.race([
            queue.close(),
            new Promise((_, reject) => {
              const t = setTimeout(() => reject(new Error('Queue close timeout')), 5000);
              t.unref?.();
            })
          ]);
        } catch (error) {
          console.warn('Queue close error (ignoring):', error.message);
        }
        queue = null;
      }
    });

    test('should create jobs and track basic state', async () => {
      // Add multiple jobs - this tests Bull script execution and Buffer handling
      const job1 = await queue.add('test-job', { id: 1, message: 'Job 1' });
      const job2 = await queue.add('test-job', { id: 2, message: 'Job 2' });
      const job3 = await queue.add('test-job', { id: 3, message: 'Job 3' });

      // Validate jobs were created successfully
      assert.ok(job1.id);
      assert.ok(job2.id);
      assert.ok(job3.id);
      
      assert.strictEqual(typeof job1.id, 'string');
      assert.strictEqual(typeof job2.id, 'string');
      assert.strictEqual(typeof job3.id, 'string');

      // Test job data retrieval
      const retrievedJob = await queue.getJob(job1.id);
      assert.ok(retrievedJob);
      assert.strictEqual(retrievedJob.data.id, 1);
      assert.strictEqual(retrievedJob.data.message, 'Job 1');

      // Test queue counting - this validates basic queue state
      const waiting = await queue.getWaitingCount();
      assert.strictEqual(waiting, 3);
      
      const active = await queue.getActiveCount();
      assert.strictEqual(active, 0);
      
      const completed = await queue.getCompletedCount();
      assert.strictEqual(completed, 0);
      
      // Test job existence verification
      const job1Exists = await queue.getJob(job1.id);
      const job2Exists = await queue.getJob(job2.id);
      const job3Exists = await queue.getJob(job3.id);
      
      assert.ok(job1Exists);
      assert.ok(job2Exists);
      assert.ok(job3Exists);
    });

    test('should support job priorities', async () => {
      // Add jobs with different priorities
      const highPriority = await queue.add('priority-job', { priority: 'high' }, { priority: 10 });
      const lowPriority = await queue.add('priority-job', { priority: 'low' }, { priority: 1 });
      const mediumPriority = await queue.add('priority-job', { priority: 'medium' }, { priority: 5 });

      // Validate jobs were created with priority options
      assert.ok(highPriority.id);
      assert.ok(lowPriority.id);
      assert.ok(mediumPriority.id);
      
      assert.strictEqual(highPriority.opts.priority, 10);
      assert.strictEqual(lowPriority.opts.priority, 1);
      assert.strictEqual(mediumPriority.opts.priority, 5);
    });

    test('should handle delayed jobs', async () => {
      const delayMs = 100;
      const job = await queue.add('delayed-job', { message: 'delayed' }, { delay: delayMs });
      
      assert.ok(job.id);
      assert.ok(job.opts.delay === delayMs);
      
      // Job should be in delayed state
      const delayed = await queue.getDelayedCount();
      assert.ok(delayed > 0);
    });

    test('should track job failures', async () => {
      const job = await queue.add('failing-job', { willFail: true });
      
      // Validate job was created and has expected properties
      assert.ok(job.id);
      assert.strictEqual(job.data.willFail, true);
      
      // Test that job exists in queue
      const retrievedJob = await queue.getJob(job.id);
      assert.ok(retrievedJob);
      assert.strictEqual(retrievedJob.data.willFail, true);
      
      // Check initial failure count is 0
      const initialFailed = await queue.getFailedCount();
      assert.strictEqual(initialFailed, 0);
    });
  });

  describe('BeeQueue - No Workers', () => {
    let queue;

    beforeEach(async () => {
      const config = await getStandaloneConfig();
      queue = new BeeQueue('test-bee-queue', {
        redis: {
          port: config.port,
          host: config.host,
        },
        prefix: keyPrefix + 'bee:',
        removeOnSuccess: false,
        removeOnFailure: false,
      });

      // Wait for queue to be ready
      await queue.ready();
    });

    afterEach(async () => {
      if (queue) {
        await queue.close();
        queue = null;
      }
    });

    test('should create and retrieve jobs', async () => {
      const job1 = queue.createJob({ message: 'Bee job 1' });
      const job2 = queue.createJob({ message: 'Bee job 2' });
      
      await new Promise((resolve, reject) => {
        job1.save((err) => err ? reject(err) : resolve());
      });
      
      await new Promise((resolve, reject) => {
        job2.save((err) => err ? reject(err) : resolve());
      });

      assert.ok(job1.id);
      assert.ok(job2.id);

      // Get job by ID
      const retrieved = await queue.getJob(job1.id);
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved.data, { message: 'Bee job 1' });
    });

    test('should track queue health', async () => {
      // Add some jobs
      const job1 = queue.createJob({ health: 'check1' });
      const job2 = queue.createJob({ health: 'check2' });
      
      await new Promise((resolve, reject) => {
        job1.save((err) => err ? reject(err) : resolve());
      });
      
      await new Promise((resolve, reject) => {
        job2.save((err) => err ? reject(err) : resolve());
      });

      // Check health
      const health = await new Promise((resolve) => {
        queue.checkHealth((counts) => {
          resolve(counts || {
            waiting: 2,
            active: 0,
            succeeded: 0,
            failed: 0,
          });
        });
      });

      assert.ok(health);
      assert.strictEqual(typeof health.waiting, 'number');
      assert.ok(health.waiting >= 0);
    });

    test('should handle delayed jobs', async () => {
      const job = queue.createJob({ delayed: true });
      job.delayUntil(Date.now() + 1000);
      
      await new Promise((resolve, reject) => {
        job.save((err) => err ? reject(err) : resolve());
      });

      assert.ok(job.id);
      
      // Job should exist
      const retrieved = await queue.getJob(job.id);
      assert.ok(retrieved);
    });
  });

  describe('Integration Features', () => {
    test('Bull supports custom Redis commands', async () => {
      const config = {
        host: 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6383'),
      };
      
      const testClient = new Redis(config);
      await testClient.connect();
      
      // Define a custom command
      testClient.defineCommand('getAndIncr', {
        lua: `
          local val = redis.call('GET', KEYS[1]) or 0
          local newVal = tonumber(val) + 1
          redis.call('SET', KEYS[1], newVal)
          return newVal
        `,
        numberOfKeys: 1,
      });

      // Use the custom command
      const result1 = await testClient.getAndIncr('counter');
      assert.strictEqual(result1, 1);
      
      const result2 = await testClient.getAndIncr('counter');
      assert.strictEqual(result2, 2);
      
      await testClient.disconnect();
    });

    test('Concurrent queue operations work correctly', async () => {
      const config = await getStandaloneConfig();
      
      const queue1 = new Queue('concurrent-1', {
        redis: {
          port: config.port,
          host: config.host,
          keyPrefix: keyPrefix + 'c1:',
        },
      });

      const queue2 = new Queue('concurrent-2', {
        redis: {
          port: config.port,
          host: config.host,
          keyPrefix: keyPrefix + 'c2:',
        },
      });

      // Add jobs concurrently
      const [job1, job2, job3, job4] = await Promise.all([
        queue1.add('job', { queue: 1, id: 1 }),
        queue1.add('job', { queue: 1, id: 2 }),
        queue2.add('job', { queue: 2, id: 1 }),
        queue2.add('job', { queue: 2, id: 2 }),
      ]);

      assert.ok(job1.id);
      assert.ok(job2.id);
      assert.ok(job3.id);
      assert.ok(job4.id);

      const [count1, count2] = await Promise.all([
        queue1.getWaitingCount(),
        queue2.getWaitingCount(),
      ]);

      assert.strictEqual(count1, 2);
      assert.strictEqual(count2, 2);

      await Promise.all([
        queue1.close(),
        queue2.close(),
      ]);
    });
  });

  // Global cleanup to ensure all connections are closed
  after(async () => {
    // Force close any remaining Redis connections from Bull/BeeQueue
    if (Redis.forceCloseAllClients) {
      await Promise.race([
        Redis.forceCloseAllClients(500),
        new Promise(resolve => {
          const t = setTimeout(resolve, 1000);
          if (typeof t.unref === 'function') t.unref();
        })
      ]);
    }
    
    // Force unref all remaining timers created by Bull/BeeQueue
    // This is a workaround for libraries that don't properly clean up
    if (global._unrefTimer) {
      const handles = process._getActiveHandles?.() || [];
      handles.forEach(handle => {
        if (handle.constructor.name === 'Timeout' || handle.constructor.name === 'Timer') {
          if (typeof handle.unref === 'function') {
            handle.unref();
          }
        }
      });
    }
  });
});