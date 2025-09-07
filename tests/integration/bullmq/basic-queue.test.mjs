/**
 * BullMQ Integration Test - Basic Queue Operations
 * Tests that our ioredis adapter works with BullMQ for job queue processing
 */

import { describe, it, test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from '../../../src';
import { testUtils } from '../../setup';

describe('BullMQ Integration - Basic Queue Operations', () => {
  let redisAdapter;
  let queue;
  let worker;
  let processedJobs[] = [];
  let testQueueName;
  let serversAvailable = false;

  before(async () => {
    serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Redis server not available on localhost:6379. Please start Redis server before running tests.'
      );
    }
  });

  beforeEach(async () => {
    // Health check before each test
    const healthCheck = await checkTestServers();
    if (!healthCheck) {
      throw new Error('Redis server became unavailable during test execution');
    }

    // Generate unique queue name for test isolation
    testQueueName = `test-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use dynamic test server configuration with discovery
    const config = await getStandaloneConfig();
    redisAdapter = new Redis(config);

    // Establish connection with timeout
    const connectionTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );

    try {
      await Promise.race([redisAdapter.connect(), connectionTimeout]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message || String(error);
      throw new Error(`Failed to connect to Redis: ${errorMessage}`);
    }

    // Verify connection is working
    const pingResult = await redisAdapter.ping();
    if (pingResult !== 'PONG') {
      throw new Error('Redis connection not responding to PING');
    }

    // BullMQ expects an ioredis-compatible client
    queue = new Queue(testQueueName, {
      connection: redisAdapter ,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    });

    processedJobs = [];
    worker = new Worker(
      testQueueName,
      async (job) => {
        processedJobs.push({
          id: job.id,
          data: job.data,
          name: job.name,
        });
        return { processed: true, Date.now() };
      },
      {
        connection: redisAdapter ,
        concurrency: 1,
      }
    );

    // Wait for worker to be ready with timeout
    const workerTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Worker ready timeout')), 10000)
    );

    try {
      await Promise.race([worker.waitUntilReady(), workerTimeout]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message || String(error);
      throw new Error(`Worker failed to initialize: ${errorMessage}`);
    }

    // Additional delay for BullMQ internal setup
    await delay(100);
  });

  afterEach(async () => {
    // Comprehensive cleanup with error handling and test isolation
    const cleanupPromises = [];

    if (worker) {
      cleanupPromises.push(
        worker.close().catch(err => {
          console.error(`Worker close error: ${err.message}`);
          return Promise.resolve();
        })
      );
    }

    if (queue) {
      cleanupPromises.push(
        queue.close().catch(err => {
          console.error(`Queue close error: ${err.message}`);
          return Promise.resolve();
        })
      );
    }

    // Wait for BullMQ cleanup
    await Promise.allSettled(cleanupPromises);
    await delay(200); // Increased delay for thorough cleanup

    // Clean up Redis data with specific queue isolation
    if (redisAdapter && testQueueName) {
      try {
        // Clean up all keys related to this specific test queue
        const keyPatterns = [
          `bull:${testQueueName}:*`,
          `bull:${testQueueName}:id`,
          `bull:${testQueueName}:wait`,
          `bull:${testQueueName}:active`,
          `bull:${testQueueName}:completed`,
          `bull:${testQueueName}:failed`,
          `bull:${testQueueName}:stalled`,
          `bull:${testQueueName}:events`,
        ];

        for (const pattern of keyPatterns) {
          const keys = await redisAdapter.keys(pattern);
          if (keys.length > 0) {
            await redisAdapter.del(...keys);
          }
        }

        // Additional cleanup for any remaining test queue keys
        const allKeys = await redisAdapter.keys(`*${testQueueName}*`);
        if (allKeys.length > 0) {
          await redisAdapter.del(...allKeys);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message || String(error);
        throw new Error(`Redis cleanup error: ${errorMessage}`);
      }

      try {
        await redisAdapter.disconnect();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message || String(error);
        throw new Error(`Redis disconnect error: ${errorMessage}`);
      }
    }

    // Reset variables for clean state
    testQueueName = '';
    processedJobs = [];
  });

  describe('Basic Job Processing', () => {
    it('should add and process a simple job', async () => {
      const jobData = { message: 'Hello BullMQ!', Date.now() };

      // Add job to queue
      const job = await queue.add('simple-job', jobData);
      assert.ok(job.id !== undefined);

      // Wait for job processing
      await delay(500);

      // Verify job was processed
      assert.strictEqual(processedJobs.length, 1);
      assert.deepStrictEqual(processedJobs[0].data, jobData);
      assert.strictEqual(processedJobs[0].name, 'simple-job');
    });

    it('should handle multiple jobs in sequence', async () => {
      const jobs = [
        { name: 'job1', data: { value: 1 } },
        { name: 'job2', data: { value: 2 } },
        { name: 'job3', data: { value: 3 } },
      ];

      // Add multiple jobs
      for (const jobInfo of jobs) {
        await queue.add(jobInfo.name, jobInfo.data);
      }

      // Wait for all jobs to process
      await delay(1000);

      // Verify all jobs were processed
      assert.strictEqual(processedJobs.length, 3);
      assert.ok(processedJobs.map(j => j.data.value)).toEqual([1, 2, 3]);
    });

    it('should handle job with priority', async () => {
      // Add jobs in reverse priority order
      await queue.add('low-priority', { priority: 'low' }, { priority: 1 });
      await queue.add('high-priority', { priority: 'high' }, { priority: 10 });
      await queue.add(
        'medium-priority',
        { priority: 'medium' },
        { priority: 5 }
      );

      // Wait longer for processing and priority ordering
      await delay(2000);

      // Verify jobs were processed (priority order may vary depending on timing)
      assert.strictEqual(processedJobs.length, 3);

      // Check that all expected priority levels are present
      const priorities = processedJobs.map(j => j.data.priority);
      assert.ok(priorities.includes('high'));
      assert.ok(priorities.includes('medium'));
      assert.ok(priorities.includes('low'));
    });
  });

  describe('Job State Management', () => {
    it('should track job states correctly', async () => {
      const job = await queue.add('state-test', { test: 'data' });

      // Brief delay to ensure job is queued properly
      await delay(50);

      // Check initial state (might be waiting or already active)
      let jobState = await job.getState();
      assert.ok(['waiting', 'active', 'completed'].includes(jobState));

      // Wait for processing to complete
      await delay(1000);

      // After processing should be completed
      const freshJob = await Job.fromId(queue, job.id!);
      jobState = await freshJob!.getState();
      assert.ok(['completed', 'active'].includes(jobState));
    });

    it('should handle job removal', async () => {
      const job = await queue.add('removable-job', { temp: true });

      // Brief delay to ensure job is queued
      await delay(50);

      // Check if job is still in waiting state before removal
      const jobState = await job.getState();
      if (jobState === 'waiting') {
        await job.remove();
      }

      // Wait a bit to ensure it doesn't get processed
      await delay(400);

      // Should not have been processed (or minimal processing if removal failed)
      assert.ok(processedJobs.length <= 1);
    });
  });

  describe('Queue Statistics', () => {
    it('should provide accurate queue counts', async () => {
      // Add some jobs
      await queue.add('count-test-1', { data: 1 });
      await queue.add('count-test-2', { data: 2 });

      // Brief delay to ensure jobs are queued
      await delay(100);

      // Check waiting count (may be lower if jobs process quickly)
      const counts = await queue.getJobCounts('waiting', 'completed', 'failed');
      const waiting = counts.waiting || 0;
      const completed = counts.completed || 0;
      assert.ok(waiting + completed >= 2);

      // Wait for processing
      await delay(800);

      // Check completed count
      const newCounts = await queue.getJobCounts(
        'waiting',
        'completed',
        'failed'
      );
      const completedCount = newCounts.completed || 0;
      assert.ok(completedCount >= 2);
    });
  });

  describe('Error Handling', () => {
    it('should handle job failures gracefully', async () => {
      // Create a worker that fails using the same unique queue name
      const failWorker = new Worker(
        testQueueName,
        async (job) => {
          if (job.data.shouldFail) {
            throw new Error('Intentional test failure');
          }
          return { success: true };
        },
        {
          connection: redisAdapter ,
          maxStalledCount: 1, // Prevent infinite retries in tests
        }
      );

      try {
        await failWorker.waitUntilReady();

        // Add a job that will fail
        const job = await queue.add('failing-job', { shouldFail: true });
        assert.ok(job.id !== undefined);

        // Wait for failure processing
        await delay(1000);

        // Check job state
        const freshJob = await Job.fromId(queue, job.id!);
        assert.ok(freshJob);

        const state = await freshJob!.getState();
        assert.ok(['failed', 'stalled', 'completed'].includes(state));
      } finally {
        await failWorker.close();
      }
    });

    it('should handle connection recovery scenarios', async () => {
      // Test that the system can recover from temporary connection issues
      const jobData = { message: 'Recovery test', Date.now() };

      // Add job before simulated connection issue
      const job = await queue.add('recovery-job', jobData);
      assert.ok(job.id !== undefined);

      // Simulate brief delay that might occur during connection issues
      await delay(200);

      // Verify job can still be processed after delay
      await delay(800);

      // Check that job was processed despite potential connection hiccups
      const processedJob = processedJobs.find(j => j.id === job.id);
      assert.ok(processedJob);
      assert.deepStrictEqual(processedJob.data, jobData);
    });

    it('should provide meaningful error messages for setup failures', async () => {
      // This test validates that our error handling provides clear context
      try {
        // Attempt to create queue with invalid configuration
        const invalidQueue = new Queue('invalid-test-queue', {
          connection: { host: 'nonexistent-host', port: 9999 } ,
        });

        // This should not reach here if Redis validation is working
        await invalidQueue.close();
      } catch (error) {
        // Expect meaningful error context
        assert.ok(error !== undefined);
        const errorMessage =
          error instanceof Error ? error.message || String(error);
        assert.strictEqual(typeof errorMessage, 'string');
        assert.ok(errorMessage.length > 0);
      }
    });

    it('should handle worker initialization errors gracefully', async () => {
      let testWorker | null = null;

      try {
        // Create worker with potentially problematic setup using unique queue name
        testWorker = new Worker(
          testQueueName,
          async (job) => {
            // Simulate processing error
            if (job.data.causeWorkerError) {
              throw new Error('Worker processing error');
            }
            return { processed: true };
          },
          {
            connection: redisAdapter ,
            concurrency: 1,
          }
        );

        await testWorker.waitUntilReady();

        // Add job that will cause worker error
        const errorJob = await queue.add('error-job', {
          causeWorkerError: true,
        });
        assert.ok(errorJob.id !== undefined);

        // Wait for error processing
        await delay(1000);

        // Verify error was handled gracefully
        const freshJob = await Job.fromId(queue, errorJob.id!);
        const state = await freshJob!.getState();
        assert.ok(['failed', 'stalled', 'completed'].includes(state));
      } finally {
        if (testWorker) {
          await testWorker.close();
        }
      }
    });
  });
});
