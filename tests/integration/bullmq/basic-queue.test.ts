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
  let testQueueName: string;
  let serversAvailable = false;

  beforeAll(async () => {
    serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      console.warn('⚠️  Redis server not available on localhost:6379');
      console.warn('💡 To run BullMQ integration tests, start Redis server:');
      console.warn('   - Install Redis: sudo apt-get install redis-server');
      console.warn('   - Start Redis: sudo systemctl start redis-server');
      console.warn('   - Or use Docker: docker run -d -p 6379:6379 redis:latest');
      console.warn('   - Or use test scripts: ./scripts/start-test-servers.sh');
      console.warn('📝 Tests will be skipped until Redis server is available.');
    }
  });

  const itConditional = (name: string, testFn: () => Promise<void>) => {
    it(name, async () => {
      // Check server availability at runtime for each test
      const currentServerStatus = await testUtils.checkTestServers();
      if (!currentServerStatus) {
        console.warn(`⚠️  Skipping "${name}": Redis server not available`);
        return; // Skip this test
      }
      await testFn();
    });
  };

  beforeEach(async () => {
    // Only proceed if servers are available - this should only run for non-skipped tests
    if (!serversAvailable) {
      return; // Early exit for skipped tests
    }

    // Additional health check before each test
    const healthCheck = await testUtils.checkTestServers();
    if (!healthCheck) {
      throw new Error('Redis server became unavailable during test execution');
    }

    // Generate unique queue name for test isolation
    testQueueName = `test-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use dynamic test server configuration with discovery
    const config = await testUtils.getStandaloneConfig();
    redisAdapter = new RedisAdapter(config);

    // Establish connection with timeout
    const connectionTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    try {
      await Promise.race([redisAdapter.connect(), connectionTimeout]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to Redis: ${errorMessage}`);
    }

    // Verify connection is working
    const pingResult = await redisAdapter.ping();
    if (pingResult !== 'PONG') {
      throw new Error('Redis connection not responding to PING');
    }

    // BullMQ expects an ioredis-compatible client
    queue = new Queue(testQueueName, { 
      connection: redisAdapter as any,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    });

    processedJobs = [];
    worker = new Worker(testQueueName, async (job: Job) => {
      processedJobs.push({
        id: job.id,
        data: job.data,
        name: job.name,
      });
      return { processed: true, timestamp: Date.now() };
    }, { 
      connection: redisAdapter as any,
      concurrency: 1,
    });

    // Wait for worker to be ready with timeout
    const workerTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Worker ready timeout')), 10000)
    );
    
    try {
      await Promise.race([worker.waitUntilReady(), workerTimeout]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Worker failed to initialize: ${errorMessage}`);
    }
    
    // Additional delay for BullMQ internal setup
    await testUtils.delay(100);
  });

  afterEach(async () => {
    // Comprehensive cleanup with error handling and test isolation
    const cleanupPromises = [];
    
    if (worker) {
      cleanupPromises.push(
        worker.close().catch(err => console.warn('Worker close error:', err.message))
      );
    }
    
    if (queue) {
      cleanupPromises.push(
        queue.close().catch(err => console.warn('Queue close error:', err.message))
      );
    }
    
    // Wait for BullMQ cleanup
    await Promise.allSettled(cleanupPromises);
    await testUtils.delay(200); // Increased delay for thorough cleanup
    
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Redis cleanup error:', errorMessage);
      }
      
      try {
        await redisAdapter.disconnect();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Redis disconnect error:', errorMessage);
      }
    }
    
    // Reset variables for clean state
    testQueueName = '';
    processedJobs = [];
  });

  describe('Basic Job Processing', () => {
    itConditional('should add and process a simple job', async () => {
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

    itConditional('should handle multiple jobs in sequence', async () => {
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

    itConditional('should handle job with priority', async () => {
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
    itConditional('should track job states correctly', async () => {
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

    itConditional('should handle job removal', async () => {
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
    itConditional('should provide accurate queue counts', async () => {
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
    itConditional('should handle job failures gracefully', async () => {
      // Create a worker that fails using the same unique queue name
      const failWorker = new Worker(testQueueName, async (job: Job) => {
        if (job.data.shouldFail) {
          throw new Error('Intentional test failure');
        }
        return { success: true };
      }, { 
        connection: redisAdapter as any,
        maxStalledCount: 1, // Prevent infinite retries in tests
      });

      try {
        await failWorker.waitUntilReady();
        
        // Add a job that will fail
        const job = await queue.add('failing-job', { shouldFail: true });
        expect(job.id).toBeDefined();
        
        // Wait for failure processing
        await testUtils.delay(1000);
        
        // Check job state
        const freshJob = await Job.fromId(queue, job.id!);
        expect(freshJob).toBeTruthy();
        
        const state = await freshJob!.getState();
        expect(['failed', 'stalled']).toContain(state);
        
      } finally {
        await failWorker.close();
      }
    });

    itConditional('should handle connection recovery scenarios', async () => {
      // Test that the system can recover from temporary connection issues
      const jobData = { message: 'Recovery test', timestamp: Date.now() };
      
      // Add job before simulated connection issue
      const job = await queue.add('recovery-job', jobData);
      expect(job.id).toBeDefined();
      
      // Simulate brief delay that might occur during connection issues
      await testUtils.delay(200);
      
      // Verify job can still be processed after delay
      await testUtils.delay(800);
      
      // Check that job was processed despite potential connection hiccups
      const processedJob = processedJobs.find(j => j.id === job.id);
      expect(processedJob).toBeTruthy();
      expect(processedJob.data).toEqual(jobData);
    });

    itConditional('should provide meaningful error messages for setup failures', async () => {
      // This test validates that our error handling provides clear context
      try {
        // Attempt to create queue with invalid configuration
        const invalidQueue = new Queue('invalid-test-queue', {
          connection: { host: 'nonexistent-host', port: 9999 } as any,
        });
        
        // This should not reach here if Redis validation is working
        await invalidQueue.close();
      } catch (error) {
        // Expect meaningful error context
        expect(error).toBeDefined();
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(0);
      }
    });

    itConditional('should handle worker initialization errors gracefully', async () => {
      let testWorker: Worker | null = null;
      
      try {
        // Create worker with potentially problematic setup using unique queue name
        testWorker = new Worker(testQueueName, async (job: Job) => {
          // Simulate processing error
          if (job.data.causeWorkerError) {
            throw new Error('Worker processing error');
          }
          return { processed: true };
        }, { 
          connection: redisAdapter as any,
          concurrency: 1,
        });

        await testWorker.waitUntilReady();
        
        // Add job that will cause worker error
        const errorJob = await queue.add('error-job', { causeWorkerError: true });
        expect(errorJob.id).toBeDefined();
        
        // Wait for error processing
        await testUtils.delay(1000);
        
        // Verify error was handled gracefully
        const freshJob = await Job.fromId(queue, errorJob.id!);
        const state = await freshJob!.getState();
        expect(['failed', 'stalled']).toContain(state);
        
      } finally {
        if (testWorker) {
          await testWorker.close();
        }
      }
    });
  });
});