import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Global declarations for Node.js built-in APIs
/* global setTimeout */
/**
 * Distributed Locking Pattern Tests
 * Real-world patterns algorithm, mutex, critical sections, resource coordination
 */

import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { testUtils } from "../setup/index.mjs";
describe('Distributed Locking Patterns', () => {
  let redis;

  beforeEach(async () => {
    const config = { ...testUtils.getStandaloneConfig(), lazyConnect: false };
    redis = new Redis(config);
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe('Basic Lock Operations', () => {
    it('should acquire and release simple lock', async () => {
      const lockKey = 'lock:' + Math.random();
      const lockValue = 'client_' + Math.random();

      // Acquire lock
      const acquired = await redis.setnx(lockKey, lockValue);
      assert.strictEqual(acquired, 1);

      // Set expiration to prevent deadlocks
      await redis.expire(lockKey, 30);

      // Verify lock exists
      const currentLock = await redis.get(lockKey);
      assert.strictEqual(currentLock, lockValue);

      // Release lock (atomic operation)
      const releaseScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const released = await redis.eval(releaseScript, 1, lockKey, lockValue);
      assert.strictEqual(released, 1);

      // Verify lock is gone
      const afterRelease = await redis.get(lockKey);
      assert.strictEqual(afterRelease, null);
    });

    it('should prevent duplicate lock acquisition', async () => {
      const lockKey = 'lock:' + Math.random();
      const client1Id = 'client1_' + Math.random();
      const client2Id = 'client2_' + Math.random();

      // Client 1 acquires lock
      const acquired1 = await redis.setnx(lockKey, client1Id);
      assert.strictEqual(acquired1, 1);
      await redis.expire(lockKey, 30);

      // Client 2 tries to acquire same lock
      const acquired2 = await redis.setnx(lockKey, client2Id);
      assert.strictEqual(acquired2, 0); // Should fail

      // Verify original lock holder
      const currentLock = await redis.get(lockKey);
      assert.strictEqual(currentLock, client1Id);

      // Clean up
      await redis.del(lockKey);
    });

    it('should handle lock expiration', async () => {
      const lockKey = 'lock:' + Math.random();
      const lockValue = 'expiring_client';

      // Acquire lock with short TTL
      await redis.setex(lockKey, 1, lockValue);

      // Verify lock exists
      const beforeExpiry = await redis.get(lockKey);
      assert.strictEqual(beforeExpiry, lockValue);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify lock expired
      const afterExpiry = await redis.get(lockKey);
      assert.strictEqual(afterExpiry, null);

      // Should be able to acquire expired lock
      const newAcquisition = await redis.setnx(lockKey, 'new_client');
      assert.strictEqual(newAcquisition, 1);

      await redis.del(lockKey);
    });
  });

  describe('Critical Section Protection', () => {
    it('should protect shared counter increment', async () => {
      const counterKey = 'counter:' + Math.random();
      const lockKey = `${counterKey}:queue`;

      // Initialize counter
      await redis.set(counterKey, '0');

      // Simulate critical section with lock
      const protectedIncrement = async (clientId) => {
        const lockAcquired = await redis.setnx(lockKey, clientId);

        if (lockAcquired) {
          try {
            await redis.expire(lockKey, 10);

            // Critical section - read, increment, write
            const current = await redis.get(counterKey);
            const newValue = parseInt(current || '0') + 1;

            // Simulate some processing time
            await new Promise(resolve => setTimeout(resolve, 10));

            await redis.set(counterKey, newValue.toString());

            return newValue;
          } finally {
            // Release lock
            const releaseScript = `
              if redis.call("GET", KEYS[1]) == ARGV[1] then
                return redis.call("DEL", KEYS[1])
              else
                return 0
              end
            `;
            await redis.eval(releaseScript, 1, lockKey, clientId);
          }
        }
        return null; // Could not acquire lock
      };

      const result = await protectedIncrement('client1');
      assert.strictEqual(result, 1);

      const finalValue = await redis.get(counterKey);
      assert.strictEqual(finalValue, '1');
    });

    it('should coordinate resource access between multiple clients', async () => {
      const resourceKey = 'resource:' + Math.random();
      const lockKey = `${resourceKey}:queue`;

      // Initialize shared resource
      const initialValue = 0;
      const initialModifier = 'init';
      await redis.set(
        resourceKey,
        JSON.stringify({
          value: initialValue,
          lastModifier: initialModifier,
          timestamp: Date.now(),
        })
      );

      const accessResource = async (
        clientId,
        operation,
        newValue
      ) => {
        // Try to acquire lock with timeout
        const lockValue = `${clientId}_${Date.now()}`;
        const lockAcquired = await redis.setnx(lockKey, lockValue);

        if (!lockAcquired) {
          return { success: false, reason: 'lock_unavailable' };
        }

        try {
          await redis.expire(lockKey, 5);

          // Access resource
          const currentData = await redis.get(resourceKey);
          const resource = JSON.parse(currentData || '{}');

          if (operation === 'read') {
            return { success: true, data: resource };
          } else {
            // Write operation
            resource.value = newValue;
            resource.lastModifier = clientId;
            resource.timestamp = Date.now();

            await redis.set(resourceKey, JSON.stringify(resource));
            return { success: true, data: resource };
          }
        } finally {
          // Always release lock
          const releaseScript = `
            if redis.call("GET", KEYS[1]) == ARGV[1] then
              return redis.call("DEL", KEYS[1])
            else
              return 0
            end
          `;
          await redis.eval(releaseScript, 1, lockKey, lockValue);
        }
      };

      // Client 1 writes
      const writeResult = await accessResource('client1', 'write', 42);
      assert.strictEqual(writeResult.success, true);
      assert.strictEqual(writeResult.data.value, 42);

      // Client 2 reads
      const readResult = await accessResource('client2', 'read');
      assert.strictEqual(readResult.success, true);
      assert.strictEqual(readResult.data.value, 42);
      assert.strictEqual(readResult.data.lastModifier, 'client1');
    });
  });

  describe('Job Processing with Locks', () => {
    it('should ensure single job processor', async () => {
      const jobId = 'job_' + Math.random();
      const processingLockKey = `job:lock:${jobId}`;

      const jobData = {
        id: jobId,
        type: 'image_processing',
        status: 'pending',
        data: { imageUrl: 'https://example.com/image.jpg' },
      };

      const processJob = async (workerId) => {
        const lockValue = `worker_${workerId}_${Date.now()}`;
        const lockAcquired = await redis.setnx(processingLockKey, lockValue);

        if (!lockAcquired) {
          return { success: false, reason: 'job_already_processing' };
        }

        try {
          // Set reasonable processing timeout
          await redis.expire(processingLockKey, 300); // 5 minutes

          // Simulate job processing
          jobData.status = 'processing';
          const jobKey = `job:${jobId}`;
          await redis.set(jobKey, JSON.stringify(jobData));

          // Simulate work
          await new Promise(resolve => setTimeout(resolve, 50));

          // Complete job
          jobData.status = 'completed';
          await redis.set(jobKey, JSON.stringify(jobData));

          return { success: true, jobData };
        } finally {
          // Release processing lock
          const releaseScript = `
            if redis.call("GET", KEYS[1]) == ARGV[1] then
              return redis.call("DEL", KEYS[1])
            else
              return 0
            end
          `;
          await redis.eval(releaseScript, 1, processingLockKey, lockValue);
        }
      };

      const result = await processJob('worker1');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.jobData.status, 'completed');

      // Verify lock is released
      const lockAfterProcess = await redis.get(processingLockKey);
      assert.strictEqual(lockAfterProcess, null);
    });

    it('should handle job queue with exclusive processing', async () => {
      const queueKey = 'job_queue:' + Math.random();
      const processingSetKey = `${queueKey}:queue`;

      // Add jobs to queue
      const jobs = ['job1', 'job2', 'job3'];
      await redis.rpush(queueKey, ...jobs);

      const processNextJob = async (workerId) => {
        // Atomic job dequeue with processing marker
        const dequeueScript = `
          local job = redis.call("LPOP", KEYS[1])
          if job then
            redis.call("SADD", KEYS[2], job)
            redis.call("EXPIRE", KEYS[2], 300)
            return job
          end
          return nil
        `;

        const job = await redis.eval(
          dequeueScript,
          2,
          queueKey,
          processingSetKey
        );

        if (job) {
          try {
            // Process job
            await new Promise(resolve => setTimeout(resolve, 20));

            // Mark
            await redis.srem(processingSetKey, job);

            return { success: true, job, workerId };
          } catch (error) {
            // On error, return job to queue
            await redis.lpush(queueKey, job);
            await redis.srem(processingSetKey, job);
            throw error;
          }
        }

        return { success: false, reason: 'no_jobs_available' };
      };

      const result1 = await processNextJob('worker1');
      assert.strictEqual(result1.success, true);
      assert.strictEqual(result1.job, 'job1');

      const result2 = await processNextJob('worker2');
      assert.strictEqual(result2.success, true);
      assert.strictEqual(result2.job, 'job2');

      // Check remaining queue
      const remaining = await redis.llen(queueKey);
      assert.strictEqual(remaining, 1);
    });
  });

  describe('Advanced Locking Patterns', () => {
    it('should implement reentrant lock', async () => {
      const lockKey = 'lock:' + Math.random();
      

      const acquireReentrantLock = async (
        clientId,
        lockKey
      ) => {
        const lockData = await redis.get(lockKey);

        if (!lockData) {
          // No lock exists, acquire it
          const lockInfo = { owner: clientId, count: 1 };
          const acquired = await redis.setnx(lockKey, JSON.stringify(lockInfo));
          if (acquired) {
            await redis.expire(lockKey, 30);
            return true;
          }
          return false;
        }

        // Lock exists, check if we own it
        const lockInfo = JSON.parse(lockData);
        if (lockInfo.owner === clientId) {
          // Reentrant acquisition
          lockInfo.count++;
          await redis.set(lockKey, JSON.stringify(lockInfo));
          await redis.expire(lockKey, 30); // Extend expiry
          return true;
        }

        return false; // Owned by different client
      };

      const releaseReentrantLock = async (
        clientId,
        lockKey
      ) => {
        const lockData = await redis.get(lockKey);
        if (!lockData) return false;

        const lockInfo = JSON.parse(lockData);
        if (lockInfo.owner !== clientId) return false;

        lockInfo.count--;
        if (lockInfo.count <= 0) {
          await redis.del(lockKey);
        } else {
          await redis.set(lockKey, JSON.stringify(lockInfo));
        }
        return true;
      };

      // Test basic lock functionality
      const acquired = await acquireReentrantLock('client1', lockKey);
      assert.strictEqual(acquired, true);

      // Test lock release
      const released = await releaseReentrantLock('client1', lockKey);
      assert.strictEqual(released, true);
    });

    it('should implement fair queuing for lock requests', async () => {
      const lockKey = 'lock:' + Math.random();
      const queueKey = `${lockKey}:queue`;

      const requestLock = async (clientId) => {
        // Add client to queue
        await redis.rpush(queueKey, clientId);

        // Try to acquire lock if we're first in queue
        while (true) {
          const firstInQueue = await redis.lindex(queueKey, 0);

          if (firstInQueue === clientId) {
            const acquired = await redis.setnx(lockKey, clientId);
            if (acquired) {
              await redis.expire(lockKey, 30);
              await redis.lpop(queueKey); // Remove from queue
              return true;
            }
          }

          // Wait a bit and check again
          await new Promise(resolve => setTimeout(resolve, 10));

          // Timeout check (prevent infinite loop in tests)
          const queueLength = await redis.llen(queueKey);
          if (queueLength === 0) break;
        }

        return false;
      };

      const releaseLock = async (clientId) => {
        const releaseScript = `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
          else
            return 0
          end
        `;

        return await redis.eval(releaseScript, 1, lockKey, clientId);
      };

      // Client requests lock
      const client1 = 'client1';
      const acquired = await requestLock(client1);
      assert.strictEqual(acquired, true);

      // Verify lock is held
      const lockHolder = await redis.get(lockKey);
      assert.strictEqual(lockHolder, client1);

      // Release lock
      const released = await releaseLock(client1);
      assert.strictEqual(released, 1);
    });

    it('should implement distributed semaphore', async () => {
      const semaphoreKey = 'semaphore:' + Math.random();
      const maxPermits = 3;

      const acquirePermit = async (clientId) => {
        const permitKey = `${semaphoreKey}:permits`;
        const holderKey = `${semaphoreKey}:holders`;

        const acquireScript = `
          local current = redis.call("GET", KEYS[1])
          if not current then
            current = 0
          else
            current = tonumber(current)
          end
          
          if current < ` + maxPermits + ` then
            redis.call("INCR", KEYS[1])
            redis.call("SADD", KEYS[2], ARGV[1])
            return 1
          else
            return 0
          end
        `;

        const acquired = await redis.eval(
          acquireScript,
          2,
          permitKey,
          holderKey,
          clientId
        );
        return acquired === 1;
      };

      const releasePermit = async (clientId) => {
        const permitKey = `${semaphoreKey}:permits`;
        const holderKey = `${semaphoreKey}:holders`;

        const releaseScript = `
          local removed = redis.call("SREM", KEYS[2], ARGV[1])
          if removed == 1 then
            redis.call("DECR", KEYS[1])
            return 1
          else
            return 0
          end
        `;

        const released = await redis.eval(
          releaseScript,
          2,
          permitKey,
          holderKey,
          clientId
        );
        return released === 1;
      };

      // Acquire permits up to limit
      const clients = ['client1', 'client2', 'client3', 'client4'];
      const acquisitionResults = [];

      for (const client of clients) {
        const acquired = await acquirePermit(client);
        acquisitionResults.push(acquired);
      }

      // First 3 should succeed, 4th should fail
      assert.deepStrictEqual(acquisitionResults, [true, true, true, false]);

      // Check current permit count
      const permitCount = await redis.get(`${semaphoreKey}:permits`);
      assert.strictEqual(parseInt(permitCount || '0'), 3);

      // Release one permit
      const released = await releasePermit('client1');
      assert.strictEqual(released, true);

      // Now 4th client should be able to acquire
      const fourthAcquire = await acquirePermit('client4');
      assert.strictEqual(fourthAcquire, true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle lock timeout and recovery', async () => {
      const lockKey = 'lock:' + Math.random();
      const clientId = 'timeout_client';

      // Acquire lock with short timeout
      await redis.setex(lockKey, 1, clientId);

      // Verify lock exists
      const beforeTimeout = await redis.get(lockKey);
      assert.strictEqual(beforeTimeout, clientId);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Lock should be expired
      const afterTimeout = await redis.get(lockKey);
      assert.strictEqual(afterTimeout, null);

      // New client can acquire
      const newClient = 'recovery_client';
      const newAcquisition = await redis.setnx(lockKey, newClient);
      assert.strictEqual(newAcquisition, 1);

      await redis.del(lockKey);
    });

    it('should handle failed lock release gracefully', async () => {
      const lockKey = 'lock:' + Math.random();
      const rightClient = 'right_client';
      const wrongClient = 'wrong_client';

      // Client 1 acquires lock
      await redis.setnx(lockKey, rightClient);

      // Client 2 tries to release lock they don't own
      const releaseScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const wrongRelease = await redis.eval(
        releaseScript,
        1,
        lockKey,
        wrongClient
      );
      assert.strictEqual(wrongRelease, 0); // Should fail

      // Lock should still exist
      const stillLocked = await redis.get(lockKey);
      assert.strictEqual(stillLocked, rightClient);

      // Right client can release
      const rightRelease = await redis.eval(
        releaseScript,
        1,
        lockKey,
        rightClient
      );
      assert.strictEqual(rightRelease, 1);

      // Lock should be gone
      const afterRelease = await redis.get(lockKey);
      assert.strictEqual(afterRelease, null);
    });

    it('should handle concurrent lock acquisition attempts', async () => {
      const lockKey = 'lock:' + Math.random();

      const attemptLock = async (clientId) => {
        try {
          const acquired = await redis.setnx(lockKey, clientId);
          if (acquired) {
            await redis.expire(lockKey, 30);
            return { success: true, clientId };
          }
          return { success: false, clientId };
        } catch (error) {
          return { success: false, clientId, error: error.message };
        }
      };

      // Simulate concurrent attempts
      const clients = ['client_a', 'client_b', 'client_c'];
      const attempts = clients.map(client => attemptLock(client));

      const results = await Promise.all(attempts);

      // Only one should succeed
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      assert.strictEqual(successful.length, 1);
      assert.strictEqual(failed.length, 2);

      // Clean up
      await redis.del(lockKey);
    });
  });
});
