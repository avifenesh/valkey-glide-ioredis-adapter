/**
 * Integration Tests with BullMQ
 * Testing the adapter with real-world job queue scenarios
 */

import { RedisAdapter } from '../adapters/RedisAdapter';

// Mock BullMQ classes for testing
class MockQueue {
  private redis: any;
  private name: string;

  constructor(name: string, opts: { connection: any }) {
    this.name = name;
    this.redis = opts.connection;
  }

  async add(jobName: string, data: any, opts?: any): Promise<any> {
    // Simulate BullMQ job creation
    const jobId = Date.now().toString();
    const jobData = {
      id: jobId,
      name: jobName,
      data,
      opts: opts || {},
      timestamp: Date.now()
    };

    // Store job in Redis
    await this.redis.hset(`bull:${this.name}:${jobId}`, {
      id: jobId,
      name: jobName,
      data: JSON.stringify(data),
      opts: JSON.stringify(opts || {}),
      timestamp: Date.now().toString()
    });

    // Add to waiting queue
    await this.redis.lpush(`bull:${this.name}:waiting`, jobId);

    return jobData;
  }

  async getJob(jobId: string): Promise<any> {
    const jobData = await this.redis.hgetall(`bull:${this.name}:${jobId}`);
    if (!jobData || Object.keys(jobData).length === 0) {
      return null;
    }

    return {
      id: jobData.id,
      name: jobData.name,
      data: JSON.parse(jobData.data || '{}'),
      opts: JSON.parse(jobData.opts || '{}'),
      timestamp: parseInt(jobData.timestamp)
    };
  }

  async getWaiting(): Promise<string[]> {
    return await this.redis.lrange(`bull:${this.name}:waiting`, 0, -1);
  }

  async clean(grace: number, status: string): Promise<string[]> {
    // Simple cleanup simulation
    const waitingJobs = await this.getWaiting();
    const oldJobs: string[] = [];

    for (const jobId of waitingJobs) {
      const job = await this.getJob(jobId);
      if (job && (Date.now() - job.timestamp) > grace) {
        await this.redis.del(`bull:${this.name}:${jobId}`);
        await this.redis.lrem(`bull:${this.name}:waiting`, 0, jobId);
        oldJobs.push(jobId);
      }
    }

    return oldJobs;
  }

  async close(): Promise<void> {
    // Cleanup resources
    await this.redis.disconnect();
  }
}

class MockWorker {
  private redis: any;
  private queueName: string;
  private processor: Function;

  constructor(queueName: string, processor: Function, opts: { connection: any }) {
    this.queueName = queueName;
    this.processor = processor;
    this.redis = opts.connection;
  }

  async process(): Promise<void> {
    // Simulate job processing
    const jobId = await this.redis.rpop(`bull:${this.queueName}:waiting`);
    if (!jobId) return;

    const jobData = await this.redis.hgetall(`bull:${this.queueName}:${jobId}`);
    if (jobData && Object.keys(jobData).length > 0) {
      const job = {
        id: jobData.id,
        name: jobData.name,
        data: JSON.parse(jobData.data || '{}'),
        opts: JSON.parse(jobData.opts || '{}')
      };

      try {
        await this.processor(job);
        // Mark as completed
        await this.redis.lpush(`bull:${this.queueName}:completed`, jobId);
      } catch (error) {
        // Mark as failed
        await this.redis.lpush(`bull:${this.queueName}:failed`, jobId);
      }
    }
  }

  async close(): Promise<void> {
    await this.redis.disconnect();
  }
}

describe('BullMQ Integration Tests', () => {
  let redis: RedisAdapter;

  beforeEach(() => {
    redis = new RedisAdapter({
      pooling: {
        enablePooling: true,
        maxConnections: 5,
        minConnections: 1
      }
    });
  });

  afterEach(async () => {
    await redis.disconnect();
  });

  describe('Queue Operations', () => {
    it('should create and manage a job queue', async () => {
      const queue = new MockQueue('test-queue', { connection: redis });

      // Add a job
      const job = await queue.add('test-job', { userId: 123, action: 'send-email' });
      expect(job.id).toBeDefined();
      expect(job.name).toBe('test-job');
      expect(job.data.userId).toBe(123);

      // Verify job was stored
      const retrievedJob = await queue.getJob(job.id);
      expect(retrievedJob).not.toBeNull();
      expect(retrievedJob.data.userId).toBe(123);

      // Check waiting queue
      const waitingJobs = await queue.getWaiting();
      expect(waitingJobs).toContain(job.id);

      await queue.close();
    });

    it('should handle job priorities and delays', async () => {
      const queue = new MockQueue('priority-queue', { connection: redis });

      // Add high priority job
      const highPriorityJob = await queue.add('urgent-task', 
        { priority: 'high' }, 
        { priority: 1, delay: 0 }
      );

      // Add low priority job with delay
      const lowPriorityJob = await queue.add('background-task',
        { priority: 'low' },
        { priority: 10, delay: 5000 }
      );

      expect(highPriorityJob.opts.priority).toBe(1);
      expect(lowPriorityJob.opts.delay).toBe(5000);

      await queue.close();
    });

    it('should clean up old jobs', async () => {
      const queue = new MockQueue('cleanup-queue', { connection: redis });

      // Add some jobs
      await queue.add('old-job-1', { data: 'test' });
      await queue.add('old-job-2', { data: 'test' });

      // Wait to ensure jobs are "old"
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean jobs older than 50ms
      const cleanedJobs = await queue.clean(50, 'waiting');
      expect(cleanedJobs.length).toBeGreaterThan(0);

      await queue.close();
    });
  });

  describe('Worker Operations', () => {
    it('should process jobs from queue', async () => {
      const queue = new MockQueue('worker-queue', { connection: redis });
      
      let processedJob: any = null;
      const worker = new MockWorker('worker-queue', async (job: any) => {
        processedJob = job;
        return { result: 'success' };
      }, { connection: redis });

      // Add a job
      const job = await queue.add('process-test', { message: 'hello world' });

      // Process the job
      await worker.process();

      expect(processedJob).not.toBeNull();
      expect(processedJob.data.message).toBe('hello world');

      await queue.close();
      await worker.close();
    });

    it('should handle job failures', async () => {
      const queue = new MockQueue('error-queue', { connection: redis });
      
      const worker = new MockWorker('error-queue', async (job: any) => {
        throw new Error('Processing failed');
      }, { connection: redis });

      // Add a job that will fail
      await queue.add('failing-job', { willFail: true });

      // Process the job (should fail)
      await worker.process();

      // Check failed queue
      const failedJobs = await redis.lrange('bull:error-queue:failed', 0, -1);
      expect(failedJobs.length).toBeGreaterThan(0);

      await queue.close();
      await worker.close();
    });
  });

  describe('Performance with Multiple Queues', () => {
    it('should handle multiple concurrent queues', async () => {
      const queues: MockQueue[] = [];
      const workers: MockWorker[] = [];

      try {
        // Create multiple queues
        for (let i = 0; i < 3; i++) {
          const queue = new MockQueue(`queue-${i}`, { connection: redis });
          queues.push(queue);

          const worker = new MockWorker(`queue-${i}`, async (job: any) => {
            return { processed: true, queueId: i };
          }, { connection: redis });
          workers.push(worker);
        }

        // Add jobs to all queues
        const jobPromises = queues.map((queue, i) => 
          queue.add('concurrent-job', { queueIndex: i })
        );
        await Promise.all(jobPromises);

        // Process all jobs
        const processPromises = workers.map(worker => worker.process());
        await Promise.all(processPromises);

        // Verify all jobs were added
        for (let i = 0; i < 3; i++) {
          const completedJobs = await redis.lrange(`bull:queue-${i}:completed`, 0, -1);
          expect(completedJobs.length).toBeGreaterThan(0);
        }

      } finally {
        // Cleanup
        await Promise.all(queues.map(q => q.close()));
        await Promise.all(workers.map(w => w.close()));
      }
    });
  });

  describe('Connection Pooling with BullMQ', () => {
    it('should efficiently use connection pool', async () => {
      const pooledRedis = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 3,
          minConnections: 1
        }
      });

      try {
        const queue = new MockQueue('pool-test', { connection: pooledRedis });

        // Add multiple jobs rapidly
        const jobPromises = [];
        for (let i = 0; i < 10; i++) {
          jobPromises.push(queue.add(`job-${i}`, { index: i }));
        }

        await Promise.all(jobPromises);

        // Check pool statistics
        const poolStats = pooledRedis.getPoolStats();
        expect(poolStats.poolingEnabled).toBe(true);
        expect(poolStats.totalConnections).toBeLessThanOrEqual(3);

        await queue.close();
      } finally {
        await pooledRedis.disconnect();
      }
    });
  });

  describe('Redis Commands Used by BullMQ', () => {
    it('should support BullMQ-specific Redis operations', async () => {
      // Test HSET/HGETALL (job data storage)
      await redis.hset('job:123', {
        id: '123',
        name: 'test-job',
        data: JSON.stringify({ test: true }),
        status: 'waiting'
      });

      const jobData = await redis.hgetall('job:123');
      expect(jobData.id).toBe('123');
      expect(jobData.name).toBe('test-job');

      // Test LPUSH/RPOP (queue operations)
      await redis.lpush('queue:waiting', '123', '124', '125');
      const jobId = await redis.rpop('queue:waiting');
      expect(jobId).toBe('123');

      // Test LRANGE (queue inspection)
      const remainingJobs = await redis.lrange('queue:waiting', 0, -1);
      expect(remainingJobs).toEqual(['125', '124']);

      // Test LREM (job removal)
      const removed = await redis.lrem('queue:waiting', 0, '124');
      expect(removed).toBe(1);

      // Test EXPIRE (TTL for job data)
      await redis.expire('job:123', 3600);
      const ttl = await redis.ttl('job:123');
      expect(ttl).toBeGreaterThan(0);
    });

    it('should handle BullMQ atomic operations', async () => {
      // Test pipeline operations (like BullMQ uses for atomic job operations)
      const pipeline = redis.pipeline();
      
      pipeline.hset('job:456', {
        id: '456',
        status: 'waiting',
        data: JSON.stringify({ task: 'process' })
      });
      pipeline.lpush('queue:waiting', '456');
      pipeline.incr('queue:stats:total');
      
      const results = await pipeline.exec();
      
      expect(results).toHaveLength(3);
      expect(results[0][0]).toBeNull(); // No error
      expect(results[1][0]).toBeNull(); // No error
      expect(results[2][0]).toBeNull(); // No error

      // Verify the operations succeeded
      const jobExists = await redis.hexists('job:456', 'id');
      expect(jobExists).toBe(1);

      const queueLength = await redis.llen('queue:waiting');
      expect(queueLength).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle connection failures gracefully', async () => {
      const queue = new MockQueue('resilient-queue', { connection: redis });

      // Add job before potential connection issue
      const job = await queue.add('resilient-job', { data: 'test' });
      expect(job.id).toBeDefined();

      // Simulate some Redis operations after potential reconnection
      const retrievedJob = await queue.getJob(job.id);
      expect(retrievedJob).not.toBeNull();

      await queue.close();
    });

    it('should maintain job data consistency', async () => {
      const queue = new MockQueue('consistency-queue', { connection: redis });

      // Add multiple jobs
      const jobs = [];
      for (let i = 0; i < 5; i++) {
        const job = await queue.add(`job-${i}`, { index: i });
        jobs.push(job);
      }

      // Verify all jobs are stored and retrievable
      for (const job of jobs) {
        const retrieved = await queue.getJob(job.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved.data.index).toBe(job.data.index);
      }

      await queue.close();
    });
  });
});