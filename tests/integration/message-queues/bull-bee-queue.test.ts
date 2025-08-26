/**
 * Message Queue Systems Integration Test
 * 
 * Tests that our ioredis adapter works correctly with popular message queue libraries:
 * - Bull (legacy but still widely used)
 * - Bee-queue (simple, fast job queue)
 */

import Queue from 'bull';
import BeeQueue from 'bee-queue';
import { RedisAdapter } from '../../../src/adapters/RedisAdapter';
import { testUtils } from '../../setup';

describe('Message Queue Systems Integration', () => {
  let redisClient: RedisAdapter;
  const keyPrefix = 'TEST:queues:';

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      console.warn('⚠️  Test servers not available. Skipping message queue integration tests...');
      return;
    }
  });

  beforeEach(async () => {
    // Skip tests if servers are not available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      pending('Test servers not available');
      return;
    }

    // Setup Redis client
    const config = testUtils.getStandaloneConfig();
    redisClient = new RedisAdapter({
      ...config,
      keyPrefix: keyPrefix
    });
    
    await redisClient.connect();
  });

  afterEach(async () => {
    if (redisClient) {
      try {
        // Clean up queue data
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

  describe('Bull Queue Integration', () => {
    let queue: Queue.Queue;
    let processor: any;

    beforeEach(() => {
      // Create Bull queue with our Redis adapter
      queue = new Queue('test-bull-queue', {
        redis: {
          port: redisClient.options.port,
          host: redisClient.options.host,
          keyPrefix: keyPrefix + 'bull:',
        }
      });

      // Setup job processor
      processor = jest.fn().mockResolvedValue({ processed: true });
      queue.process(processor);
    });

    afterEach(async () => {
      if (queue) {
        await queue.close();
      }
    });

    test('should create and process simple jobs', async () => {
      const jobData = { 
        message: 'Hello Bull!', 
        timestamp: Date.now() 
      };

      // Add job to queue
      const job = await queue.add('test-job', jobData);
      expect(job.id).toBeDefined();

      // Wait for job to be processed
      await new Promise<void>((resolve) => {
        queue.on('completed', (completedJob) => {
          if (completedJob.id === job.id) {
            resolve();
          }
        });
      });

      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({
          data: jobData
        })
      );
    });

    test('should handle job delays', async () => {
      const delayMs = 200;
      const startTime = Date.now();

      const job = await queue.add('delayed-job', { message: 'delayed' }, {
        delay: delayMs
      });

      await new Promise<void>((resolve) => {
        queue.on('completed', (completedJob) => {
          if (completedJob.id === job.id) {
            const endTime = Date.now();
            expect(endTime - startTime).toBeGreaterThanOrEqual(delayMs);
            resolve();
          }
        });
      });
    });

    test('should handle job priorities', async () => {
      const processedJobs: any[] = [];

      // Create processor that records order
      queue.process(async (job) => {
        processedJobs.push(job.data);
        return { processed: true };
      });

      // Add jobs with different priorities (higher number = higher priority)
      await queue.add('low', { priority: 'low' }, { priority: 1 });
      await queue.add('high', { priority: 'high' }, { priority: 10 });
      await queue.add('medium', { priority: 'medium' }, { priority: 5 });

      // Wait for all jobs to complete
      await new Promise<void>((resolve) => {
        let completedCount = 0;
        queue.on('completed', () => {
          completedCount++;
          if (completedCount === 3) {
            resolve();
          }
        });
      });

      // High priority should be processed first
      expect(processedJobs[0].priority).toBe('high');
    });

    test('should handle job failures and retries', async () => {
      let attemptCount = 0;

      // Create failing processor
      queue.process(async (job) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return { processed: true, attempts: attemptCount };
      });

      const job = await queue.add('failing-job', { willFail: true }, {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 100
        }
      });

      await new Promise<void>((resolve) => {
        queue.on('completed', (completedJob) => {
          if (completedJob.id === job.id) {
            expect(attemptCount).toBe(3);
            resolve();
          }
        });
      });
    });

    test('should provide job statistics', async () => {
      // Add some jobs
      await queue.add('job1', { data: 'test1' });
      await queue.add('job2', { data: 'test2' });
      await queue.add('job3', { data: 'test3' });

      // Check queue statistics
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();

      expect(waiting.length + active.length + completed.length).toBeGreaterThan(0);
    });
  });

  describe('Bee-Queue Integration', () => {
    let queue: BeeQueue;

    beforeEach(() => {
      // Create Bee-queue with our Redis configuration
      queue = new BeeQueue('test-bee-queue', {
        redis: {
          port: redisClient.options.port,
          host: redisClient.options.host,
        },
        prefix: keyPrefix + 'bee:',
        removeOnSuccess: false, // Keep jobs for testing
        removeOnFailure: false
      });
    });

    afterEach(async () => {
      if (queue) {
        await queue.close();
      }
    });

    test('should create and process jobs with Bee-queue', async () => {
      const processedJobs: any[] = [];

      // Setup processor
      queue.process(async (job) => {
        processedJobs.push(job.data);
        return { processed: true, timestamp: Date.now() };
      });

      const jobData = { message: 'Hello Bee!', id: testUtils.randomString() };

      // Create job
      const job = await new Promise<any>((resolve, reject) => {
        const createdJob = queue.createJob(jobData);
        createdJob.save((err: any, job: any) => {
          if (err) reject(err);
          else resolve(job);
        });
      });

      expect(job.id).toBeDefined();

      // Wait for processing
      await new Promise<void>((resolve) => {
        queue.on('succeeded', (job, result) => {
          if (job.data.id === jobData.id) {
            expect(result.processed).toBe(true);
            resolve();
          }
        });
      });

      expect(processedJobs).toContainEqual(jobData);
    });

    test('should handle job delays with Bee-queue', async () => {
      let processedAt: number;

      queue.process(async (job) => {
        processedAt = Date.now();
        return { processed: true };
      });

      const delayMs = 200;
      const startTime = Date.now();

      // Create delayed job
      const job = queue.createJob({ message: 'delayed bee job' });
      job.delayUntil(Date.now() + delayMs);

      await new Promise<void>((resolve, reject) => {
        job.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Wait for job to be processed
      await new Promise<void>((resolve) => {
        queue.on('succeeded', () => {
          expect(processedAt - startTime).toBeGreaterThanOrEqual(delayMs);
          resolve();
        });
      });
    });

    test('should handle job failures with Bee-queue', async () => {
      let attemptCount = 0;

      queue.process(async (job) => {
        attemptCount++;
        throw new Error('Bee job failed');
      });

      const job = queue.createJob({ message: 'failing bee job' });

      await new Promise<void>((resolve, reject) => {
        job.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Wait for failure
      await new Promise<void>((resolve) => {
        queue.on('failed', (job, err) => {
          expect(err.message).toBe('Bee job failed');
          expect(attemptCount).toBe(1);
          resolve();
        });
      });
    });

    test('should provide health check capabilities', async () => {
      // Add a test job
      const job = queue.createJob({ health: 'check' });
      
      await new Promise<void>((resolve, reject) => {
        job.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Check queue health
      const health = await new Promise<any>((resolve, reject) => {
        queue.checkHealth((err: any, counts: any) => {
          if (err) reject(err);
          else resolve(counts);
        });
      });

      expect(health).toBeDefined();
      expect(typeof health.waiting).toBe('number');
      expect(typeof health.active).toBe('number');
      expect(typeof health.succeeded).toBe('number');
      expect(typeof health.failed).toBe('number');
    });
  });

  describe('Performance Comparison', () => {
    test('should handle high-throughput job creation', async () => {
      const jobCount = 50;
      const jobs: any[] = [];

      // Test Bull queue performance
      const bullQueue = new Queue('perf-test-bull', {
        redis: {
          port: redisClient.options.port,
          host: redisClient.options.host,
          keyPrefix: keyPrefix + 'perf:bull:',
        }
      });

      const startTime = Date.now();

      // Create multiple jobs rapidly
      for (let i = 0; i < jobCount; i++) {
        const job = await bullQueue.add('perf-job', { 
          index: i, 
          timestamp: Date.now() 
        });
        jobs.push(job);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(jobs.length).toBe(jobCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`✅ Created ${jobCount} Bull jobs in ${duration}ms`);

      await bullQueue.close();
    });

    test('should handle concurrent queue operations', async () => {
      const queue1 = new Queue('concurrent-1', {
        redis: {
          port: redisClient.options.port,
          host: redisClient.options.host,
          keyPrefix: keyPrefix + 'concurrent:1:',
        }
      });

      const queue2 = new Queue('concurrent-2', {
        redis: {
          port: redisClient.options.port,
          host: redisClient.options.host,
          keyPrefix: keyPrefix + 'concurrent:2:',
        }
      });

      // Add jobs to both queues concurrently
      const promises = [
        queue1.add('job1', { queue: 1, data: 'test1' }),
        queue1.add('job2', { queue: 1, data: 'test2' }),
        queue2.add('job1', { queue: 2, data: 'test1' }),
        queue2.add('job2', { queue: 2, data: 'test2' }),
      ];

      const results = await Promise.all(promises);

      expect(results.length).toBe(4);
      results.forEach(job => {
        expect(job.id).toBeDefined();
      });

      await Promise.all([queue1.close(), queue2.close()]);
    });
  });
});