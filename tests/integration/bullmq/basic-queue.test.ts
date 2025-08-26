/**
 * BullMQ Integration Test - Basic Queue Operations
 * Tests that our ioredis adapter works with BullMQ for job queue processing
 */

import { Queue, Worker, Job } from 'bullmq';
import { RedisAdapter } from '../../../src/adapters/RedisAdapter';
import { testUtils } from '../../setup';

describe('BullMQ Integration - Basic Queue Operations', () => {
  let redisAdapter: RedisAdapter;
  let queue: Queue;
  let worker: Worker;
  let processedJobs: any[] = [];

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      console.warn('⚠️  Test servers not available. Skipping BullMQ integration tests...');
      return;
    }
  });

  beforeEach(async () => {
    // Skip tests if servers are not available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      console.warn('⚠️  Test servers not available. Skipping test...');
      return;
    }

    // Use test server configuration
    const config = testUtils.getStandaloneConfig();
    redisAdapter = new RedisAdapter(config);

    // BullMQ expects an ioredis-compatible client, so we pass our adapter directly
    // Create queue and worker with our adapter as the connection
    queue = new Queue('test-queue', { 
      connection: redisAdapter as any, // Cast to any since BullMQ expects ioredis interface
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    });

    processedJobs = [];
    worker = new Worker('test-queue', async (job: Job) => {
      processedJobs.push({
        id: job.id,
        data: job.data,
        name: job.name,
      });
      return { processed: true, timestamp: Date.now() };
    }, { 
      connection: redisAdapter as any, // Cast to any since BullMQ expects ioredis interface
      concurrency: 1,
    });

    // Wait for worker to be ready
    await worker.waitUntilReady();
    await testUtils.delay(100); // Small delay for initialization
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.close();
    }
    if (redisAdapter) {
      await redisAdapter.disconnect();
    }
    
    // Clean up test data
    if (redisAdapter) {
      try {
        await redisAdapter.del('bull:test-queue:*');
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Basic Job Processing', () => {
    test('should add and process a simple job', async () => {
      const jobData = { message: 'Hello BullMQ!', timestamp: Date.now() };
      
      // Add job to queue
      const job = await queue.add('simple-job', jobData);
      expect(job.id).toBeDefined();
      
      // Wait for job processing
      await testUtils.delay(500);
      
      // Verify job was processed
      expect(processedJobs).toHaveLength(1);
      expect(processedJobs[0].data).toEqual(jobData);
      expect(processedJobs[0].name).toBe('simple-job');
    });

    test('should handle multiple jobs in sequence', async () => {
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
      await testUtils.delay(1000);

      // Verify all jobs were processed
      expect(processedJobs).toHaveLength(3);
      expect(processedJobs.map(j => j.data.value)).toEqual([1, 2, 3]);
    });

    test('should handle job with priority', async () => {
      // Add jobs in reverse priority order
      await queue.add('low-priority', { priority: 'low' }, { priority: 1 });
      await queue.add('high-priority', { priority: 'high' }, { priority: 10 });
      await queue.add('medium-priority', { priority: 'medium' }, { priority: 5 });

      // Wait for processing
      await testUtils.delay(800);

      // Verify jobs were processed in priority order (high to low)
      expect(processedJobs).toHaveLength(3);
      expect(processedJobs[0].data.priority).toBe('high');
      expect(processedJobs[1].data.priority).toBe('medium');
      expect(processedJobs[2].data.priority).toBe('low');
    });
  });

  describe('Job State Management', () => {
    test('should track job states correctly', async () => {
      const job = await queue.add('state-test', { test: 'data' });
      
      // Initially should be waiting
      let jobState = await job.getState();
      expect(jobState).toBe('waiting');

      // Wait for processing
      await testUtils.delay(500);

      // After processing should be completed
      const freshJob = await Job.fromId(queue, job.id!);
      jobState = await freshJob!.getState();
      expect(jobState).toBe('completed');
    });

    test('should handle job removal', async () => {
      const job = await queue.add('removable-job', { temp: true });
      
      // Remove the job before processing
      await job.remove();
      
      // Wait a bit to ensure it doesn't get processed
      await testUtils.delay(300);
      
      // Should not have been processed
      expect(processedJobs).toHaveLength(0);
    });
  });

  describe('Queue Statistics', () => {
    test('should provide accurate queue counts', async () => {
      // Add some jobs
      await queue.add('count-test-1', { data: 1 });
      await queue.add('count-test-2', { data: 2 });
      
      // Check waiting count
      const counts = await queue.getJobCounts('waiting', 'completed', 'failed');
      expect(counts.waiting).toBeGreaterThanOrEqual(2);
      
      // Wait for processing
      await testUtils.delay(600);
      
      // Check completed count
      const newCounts = await queue.getJobCounts('waiting', 'completed', 'failed');
      expect(newCounts.completed).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle job failures gracefully', async () => {
      // Create a worker that fails
      const failWorker = new Worker('test-queue', async (job: Job) => {
        if (job.data.shouldFail) {
          throw new Error('Intentional test failure');
        }
        return { success: true };
      }, { 
        connection: redisAdapter as any
      });

      try {
        // Add a job that will fail
        const job = await queue.add('failing-job', { shouldFail: true });
        
        // Wait for failure
        await testUtils.delay(500);
        
        // Check job state
        const freshJob = await Job.fromId(queue, job.id!);
        const state = await freshJob!.getState();
        expect(state).toBe('failed');
        
      } finally {
        await failWorker.close();
      }
    });
  });
});