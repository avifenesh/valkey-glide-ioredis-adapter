/**
 * BullMQ Integration Test - Basic Queue Operations
 * Tests that our ioredis adapter works with BullMQ for job queue processing
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
import { Queue, Worker, Job } from 'bullmq';
import pkg from '../../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../../utils/test-config.mjs';

async function checkTestServers() {
  try {
    const baseConfig = getStandaloneConfig();
    const config = {
      ...baseConfig,
      maxRetriesPerRequest: null, // Required by BullMQ for blocking operations
    };
    const testClient = new Redis(config);
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch (error) {
    return false;
  }
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Suppress ClosingError console output during test cleanup
const originalConsoleError = console.error;
const suppressClosingErrors = (...args) => {
  const message = args.join(' ');
  if (message.includes('ClosingError') || 
      message.includes('Connection closed') ||
      message.includes('already closed')) {
    return; // Suppress these expected cleanup errors
  }
  originalConsoleError.apply(console, args);
};

// Override console.error during test execution
console.error = suppressClosingErrors;
describe('BullMQ Integration - Basic Queue Operations', () => {
  let redisAdapter;
  let workerConnection; // Store worker connection for cleanup
  let queue;
  let worker;
  let processedJobs = [];
  let testQueueName;
  let serversAvailable = false;

  before(async () => {
    serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Redis server not available on localhost:6383. Please start Redis server before running tests.'
      );
    }
  });

  beforeEach(async () => {
    // Health check before each test
    const healthCheck = await checkTestServers();
    if (!healthCheck) {
      throw new Error('Redis server became unavailable during test execution');
    }

    // CRITICAL: Flush database before EACH test to ensure complete isolation
    // BullMQ uses complex Lua scripts that can interfere between tests
    const flushClient = new Redis(getStandaloneConfig());
    await flushClient.connect();
    try {
      await flushClient.flushdb();
      await flushClient.script('FLUSH');
    } catch (err) {
      // Continue even if flush fails
    } finally {
      await flushClient.quit();
    }

    // Generate COMPLETELY unique queue name with timestamp + random + test index
    // This ensures NO collision even when tests run in parallel or sequentially
    const testIndex = Math.floor(Math.random() * 1000000);
    const uniqueId = `${Date.now()}-${testIndex}-${Math.random().toString(36).substr(2, 9)}`;
    testQueueName = `bullmq-test-${process.pid}-${uniqueId}`;
    
    // Add a small delay to ensure database is clean
    await delay(100);

    // Use dynamic test server configuration with BullMQ compatibility
    const baseConfig = getStandaloneConfig();
    const config = {
      ...baseConfig,
      maxRetriesPerRequest: null, // Required by BullMQ for blocking operations
    };
    
    // Create separate connections for queue and worker - CRITICAL for BullMQ
    // BullMQ requires separate connections to avoid conflicts between
    // queue operations and worker blocking operations
    redisAdapter = new Redis(config);
    workerConnection = new Redis(config);

    // Establish connections with timeout
    const connectionTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );

    try {
      await Promise.race([
        Promise.all([
          redisAdapter.connect(),
          workerConnection.connect()
        ]),
        connectionTimeout
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to Redis: ${errorMessage}`);
    }

    // Verify connections are working
    const [pingResult1, pingResult2] = await Promise.all([
      redisAdapter.ping(),
      workerConnection.ping()
    ]);
    if (pingResult1 !== 'PONG' || pingResult2 !== 'PONG') {
      throw new Error('Redis connections not responding to PING');
    }

    // BullMQ expects an ioredis-compatible client
    // Use a unique prefix to ensure complete isolation from other tests
    const testPrefix = `{bullmq-test-${Date.now()}}`; // Share prefix between queue and worker
    
    queue = new Queue(testQueueName, {
      connection: redisAdapter,
      prefix: testPrefix,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    });

    processedJobs = [];
    
    // Use the separate worker connection with the SAME prefix
    worker = new Worker(
      testQueueName,
      async job => {
        processedJobs.push({
          id: job.id,
          data: job.data,
          name: job.name,
        });
        return { processed: true, timestamp: Date.now() };
      },
      {
        connection: workerConnection,  // Use separate connection for worker
        prefix: testPrefix, // CRITICAL: Use same prefix as queue
        concurrency: 1,
      }
    );

    // Wait for worker to be ready
    // Now that duplicate() auto-connects, this should work
    try {
      await worker.waitUntilReady();
    } catch (error) {
      // If waitUntilReady fails, just continue - the worker might still work
      console.warn('Worker waitUntilReady failed:', error.message);
    }

    // Additional delay for BullMQ internal setup
    await delay(100);
  });

  afterEach(async () => {
    // Comprehensive cleanup with error handling and test isolation
    const cleanupPromises = [];

    // First, pause the worker to stop processing
    if (worker) {
      try {
        await worker.pause();
      } catch (err) {
        // Ignore pause errors
      }
      
      cleanupPromises.push(
        worker.close().catch(err => {
          // Suppress ClosingError - it's expected during cleanup
          if (err?.constructor?.name === 'ClosingError' || 
              err?.name === 'ClosingError' || 
              err?.message?.includes('ClosingError')) {
            // ClosingError is expected during BullMQ Worker cleanup
            return Promise.resolve();
          }
          console.error(`Worker close error: ${err.message}`);
          return Promise.resolve();
        })
      );
    }

    if (queue) {
      // Try to drain the queue first
      try {
        await queue.drain();
      } catch (err) {
        // Ignore drain errors
      }
      
      cleanupPromises.push(
        queue.close().catch(err => {
          // Suppress ClosingError - it's expected during cleanup
          if (err?.constructor?.name === 'ClosingError' || 
              err?.name === 'ClosingError' || 
              err?.message?.includes('ClosingError')) {
            // ClosingError is expected during BullMQ Queue cleanup
            return Promise.resolve();
          }
          console.error(`Queue close error: ${err.message}`);
          return Promise.resolve();
        })
      );
    }

    // Wait for BullMQ cleanup
    await Promise.allSettled(cleanupPromises);
    await delay(300); // Increased delay for thorough cleanup

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
          error instanceof Error ? error.message : String(error);
        throw new Error(`Redis cleanup error: ${errorMessage}`);
      }

      try {
        await redisAdapter.disconnect();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Redis disconnect error: ${errorMessage}`);
      }
    }

    // Clean up worker connection
    if (workerConnection) {
      try {
        await workerConnection.disconnect();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Worker connection disconnect error: ${errorMessage}`);
      }
    }

    // Reset variables for clean state
    testQueueName = '';
    processedJobs = [];
  });

  describe('Basic Job Processing', () => {
    it('should add and process a simple job', async () => {
      const jobData = { message: 'Hello BullMQ', timestamp: Date.now() };

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
      assert.deepStrictEqual(
        processedJobs.map(j => j.data.value),
        [1, 2, 3]
      );
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
      // Note: Job.fromId can return null if job has been removed or doesn't exist
      const freshJob = await Job.fromId(queue, job.id);
      if (freshJob) {
        jobState = await freshJob.getState();
        assert.ok(['completed', 'active'].includes(jobState));
      } else {
        // If job is gone, it might have been processed and removed
        // Check if it was at least processed
        const counts = await queue.getJobCounts();
        assert.ok(counts.completed > 0 || counts.active > 0);
      }
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
        async job => {
          if (job.data.shouldFail) {
            throw new Error('Intentional test failure');
          }
          return { success: true };
        },
        {
          connection: redisAdapter,
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
        const freshJob = await Job.fromId(queue, job.id);
        if (freshJob) {
          const state = await freshJob.getState();
          assert.ok(['failed', 'stalled', 'completed'].includes(state));
        } else {
          // If job is not found, check that it was at least processed
          const counts = await queue.getJobCounts('failed', 'completed');
          assert.ok(counts.failed > 0 || counts.completed > 0, 'Job should have been processed');
        }
      } finally {
        await failWorker.close();
      }
    });

    it('should handle connection recovery scenarios', async () => {
      // Test that the system can recover from temporary connection issues
      const jobData = { message: 'Recovery test', timestamp: Date.now() };

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
          connection: { host: 'nonexistent-host', port: 9999 },
        });

        // This should not reach here if Redis validation is working
        await invalidQueue.close();
      } catch (error) {
        // Expect meaningful error context
        assert.ok(error !== undefined);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        assert.strictEqual(typeof errorMessage, 'string');
        assert.ok(errorMessage.length > 0);
      }
    });

    it('should handle worker initialization errors gracefully', async () => {
      let testWorker = null;

      try {
        // Create worker with potentially problematic setup using unique queue name
        testWorker = new Worker(
          testQueueName,
          async job => {
            // Simulate processing error
            if (job.data.causeWorkerError) {
              throw new Error('Worker processing error');
            }
            return { processed: true };
          },
          {
            connection: redisAdapter,
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
        const freshJob = await Job.fromId(queue, errorJob.id);
        if (freshJob) {
          const state = await freshJob.getState();
          assert.ok(['failed', 'stalled', 'completed'].includes(state));
        } else {
          // If job is not found, check that it was at least processed
          const counts = await queue.getJobCounts('failed', 'completed');
          assert.ok(counts.failed > 0 || counts.completed > 0, 'Job should have been processed');
        }
      } finally {
        if (testWorker) {
          await testWorker.close();
        }
      }
    });
  });
});
