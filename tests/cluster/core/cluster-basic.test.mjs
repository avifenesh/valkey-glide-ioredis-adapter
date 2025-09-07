/**
 * Cluster Basic Tests - Adapted from ioredis cluster tests
 * Tests basic cluster functionality with our Cluster
 */

import { describe, it, test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../../dist/index.js';
const { Cluster } = pkg;

// Mock Redis cluster for testing
class MockRedisCluster {
  private servers = new Map();

  createServer(port, handler: (argv[]) => any) {
    // This would be implemented with actual Redis cluster mock
    // For now, we'll create a placeholder
    this.servers.set(port, { port, handler });
  }

  cleanup() {
    this.servers.clear();
  }
}

describe('Cluster - Basic Tests', () => {
  let mockCluster;

  beforeEach(() => {
    mockCluster = new MockRedisCluster();
  });

  afterEach(() => {
    mockCluster.cleanup();
  });

  describe('Basic Operations', () => {
    it('should create cluster adapter with single node', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.status, 'disconnected');
    });

    it('should create cluster adapter with multiple nodes', async () => {
      const cluster = new Cluster(
        [
          { host: '127.0.0.1', port: 7000 },
          { host: '127.0.0.1', port: 7001 },
          { host: '127.0.0.1', port: 7002 },
        ],
        { lazyConnect: true }
      );

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.status, 'disconnected');
    });

    it('should support createClient factory method', async () => {
      const cluster = Cluster.createClient('client', {
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster .clientType, 'client');
    });

    it('should support createClient with bclient type', async () => {
      const cluster = Cluster.createClient('bclient', {
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster .clientType, 'bclient');
      assert.ok((cluster ).enableBlockingOps).strictEqual(true);
    });

    it('should support createClient with subscriber type', async () => {
      const cluster = Cluster.createClient('subscriber', {
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster .clientType, 'subscriber');
    });
  });

  describe('Configuration Options', () => {
    it('should accept cluster-specific options', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        enableReadFromReplicas: true,
        scaleReads: 'all',
        maxRedirections: 32,
        retryDelayOnFailover: 200,
        enableOfflineQueue: false,
        readOnly: true,
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.ok((cluster ).clusterOptions.enableReadFromReplicas).strictEqual(true);
      assert.ok((cluster ).clusterOptions.scaleReads).toBe('all');
      assert.ok((cluster ).clusterOptions.maxRedirections).toBe(32);
      assert.ok((cluster ).clusterOptions.retryDelayOnFailover).toBe(200);
      assert.ok((cluster ).clusterOptions.enableOfflineQueue).strictEqual(false);
      assert.ok((cluster ).clusterOptions.readOnly).strictEqual(true);
    });

    it('should use default cluster options', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      assert.ok(
        (cluster ).clusterOptions.enableReadFromReplicas
      ).toBeUndefined();
      assert.ok((cluster ).clusterOptions.scaleReads).toBeUndefined();
      assert.ok((cluster ).clusterOptions.maxRedirections).toBeUndefined();
      assert.ok(
        (cluster ).clusterOptions.retryDelayOnFailover
      ).toBeUndefined();
      assert.ok(
        (cluster ).clusterOptions.enableOfflineQueue
      ).toBeUndefined();
      assert.ok((cluster ).clusterOptions.readOnly).toBeUndefined();
    });
  });

  describe('Duplicate Method', () => {
    it('should create duplicate cluster adapter', async () => {
      const original = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        enableReadFromReplicas: true,
        lazyConnect: true,
      });

      const duplicate = original.duplicate();

      assert.ok(duplicate instanceof Cluster);
      assert.notStrictEqual(duplicate, original);
      assert.ok((duplicate ).clusterOptions.enableReadFromReplicas).toBe(
        true
      );
    });

    it('should preserve blocking operations in duplicate', async () => {
      const original = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });
      (original ).enableBlockingOps = true;

      const duplicate = original.duplicate();

      assert.ok((duplicate ).enableBlockingOps).strictEqual(true);
    });
  });

  describe('Pipeline and Multi', () => {
    it('should create pipeline', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      const pipeline = cluster.pipeline();
      assert.ok(pipeline);
    });

    it('should create multi transaction', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      const multi = cluster.multi();
      assert.ok(multi);
    });
  });

  describe('Command Delegation', () => {
    let cluster;

    beforeEach(() => {
      cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });
    });

    it('should have string command methods', async () => {
      assert.ok(cluster.set instanceof Function);
      assert.ok(cluster.get instanceof Function);
      assert.ok(cluster.mget instanceof Function);
      assert.ok(cluster.mset instanceof Function);
      assert.ok(cluster.incr instanceof Function);
      assert.ok(cluster.decr instanceof Function);
    });

    it('should have hash command methods', async () => {
      assert.ok(cluster.hset instanceof Function);
      assert.ok(cluster.hget instanceof Function);
      assert.ok(cluster.hmset instanceof Function);
      assert.ok(cluster.hmget instanceof Function);
      assert.ok(cluster.hgetall instanceof Function);
      assert.ok(cluster.hdel instanceof Function);
    });

    it('should have list command methods', async () => {
      assert.ok(cluster.lpush instanceof Function);
      assert.ok(cluster.rpush instanceof Function);
      assert.ok(cluster.lpop instanceof Function);
      assert.ok(cluster.rpop instanceof Function);
      assert.ok(cluster.lrange instanceof Function);
      assert.ok(cluster.llen instanceof Function);
    });

    it('should have sorted set command methods', async () => {
      assert.ok(cluster.zadd instanceof Function);
      assert.ok(cluster.zrem instanceof Function);
      assert.ok(cluster.zcard instanceof Function);
      assert.ok(cluster.zscore instanceof Function);
      assert.ok(cluster.zrange instanceof Function);
      assert.ok(cluster.zrevrange instanceof Function);
    });

    it('should have pub/sub command methods', async () => {
      assert.ok(cluster.publish instanceof Function);
      assert.ok(cluster.subscribe instanceof Function);
      assert.ok(cluster.unsubscribe instanceof Function);
      assert.ok(cluster.psubscribe instanceof Function);
      assert.ok(cluster.punsubscribe instanceof Function);
    });

    it('should have transaction command methods', async () => {
      assert.ok(cluster.script instanceof Function);
      assert.ok(cluster.watch instanceof Function);
      assert.ok(cluster.unwatch instanceof Function);
      assert.ok(cluster.eval instanceof Function);
      assert.ok(cluster.evalsha instanceof Function);
      assert.ok(cluster.defineCommand instanceof Function);
    });

    it('should have blocking command methods', async () => {
      assert.ok(cluster.blpop instanceof Function);
      assert.ok(cluster.brpop instanceof Function);
      assert.ok(cluster.brpoplpush instanceof Function);
      assert.ok(cluster.bzpopmin instanceof Function);
      assert.ok(cluster.bzpopmax instanceof Function);
    });

    it('should have stream command methods', async () => {
      assert.ok(cluster.xadd instanceof Function);
      assert.ok(cluster.xread instanceof Function);
      assert.ok(cluster.xack instanceof Function);
      assert.ok(cluster.xgroup instanceof Function);
      assert.ok(cluster.xpending instanceof Function);
      assert.ok(cluster.xclaim instanceof Function);
    });
  });

  describe('Event Handling', () => {
    it('should forward pub/sub events', done => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      let eventCount = 0;
      const expectedEvents = [
        'message',
        'pmessage',
        'subscribe',
        'unsubscribe',
        'psubscribe',
        'punsubscribe',
      ];

      expectedEvents.forEach(event => {
        cluster.on(event, () => {
          eventCount++;
          if (eventCount === expectedEvents.length) {
            done();
          }
        });
      });

      // Simulate events from pubsub commands
      setTimeout(() => {
        expectedEvents.forEach(event => {
          cluster.emit(event, 'test-channel', 'test-message');
        });
      }, 10);
    });
  });

  describe('Connection Management', () => {
    it('should have connection methods', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      assert.ok(cluster.connect instanceof Function);
      assert.ok(cluster.disconnect instanceof Function);
      assert.ok(cluster.quit instanceof Function);
      assert.ok(cluster.ping instanceof Function);
      assert.ok(cluster.info instanceof Function);
    });

    it('should have sendCommand method', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        lazyConnect: true,
      });

      assert.ok(cluster.sendCommand instanceof Function);
      assert.ok(cluster.call instanceof Function);
    });
  });

  describe('Bull Compatibility', () => {
    it('should work with Bull createClient pattern', async () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return Cluster.createClient(type, {
          nodes: [
            { host: '127.0.0.1', port: 7000 },
            { host: '127.0.0.1', port: 7001 },
            { host: '127.0.0.1', port: 7002 },
          ],
          lazyConnect: true,
        });
      };

      const client = createClient('client');
      const subscriber = createClient('subscriber');
      const bclient = createClient('bclient');

      assert.ok(client instanceof Cluster);
      assert.ok(subscriber instanceof Cluster);
      assert.ok(bclient instanceof Cluster);

      assert.strictEqual(client .clientType, 'client');
      assert.strictEqual(subscriber .clientType, 'subscriber');
      assert.strictEqual(bclient .clientType, 'bclient');
      assert.ok((bclient ).enableBlockingOps).strictEqual(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const cluster = new Cluster(
        [{ host: 'localhost', port: 9999 }], // Non-existent port
        {
          lazyConnect: true,
          connectTimeout: 2000, // 2 second timeout
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 1,
        }
      );

      let errorEmitted = false;
      let connectionErrorThrown = false;
      let errorPromiseResolved = false;

      // Set up error event listener
      const errorPromise = new Promise<void>(resolve => {
        cluster.on('error', err => {
          errorEmitted = true;
          assert.ok(err instanceof Error);
          if (!errorPromiseResolved) {
            errorPromiseResolved = true;
            resolve();
          }
        });
      });

      // With lazyConnect: true, connection only happens on first command
      // So we need to trigger an actual operation to test connection errors
      try {
        await cluster.connect();
        // Try an operation to trigger actual connection
        await cluster.ping();
      } catch (error) {
        connectionErrorThrown = true;
        assert.ok(error instanceof Error);
      }

      // Wait a short time for error event
      if (!errorEmitted) {
        await Promise.race([
          errorPromise,
          new Promise(resolve => setTimeout(resolve, 1000)), // 1 second max wait
        ]);
      }

      // Clean up the cluster connection
      try {
        await cluster.disconnect();
      } catch (e) {
        // Ignore disconnect errors for invalid connections
      }

      // Either error was thrown OR event was emitted (both are acceptable)
      assert.strictEqual(connectionErrorThrown || errorEmitted, true);
    });
  });
});

// Additional test for cluster-specific scenarios
describe('Cluster - Cluster Specific Features', () => {
  describe('Read Scaling', () => {
    it('should support master read scaling', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        scaleReads: 'master',
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.scaleReads).toBe('master');
    });

    it('should support slave read scaling', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        scaleReads: 'slave',
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.scaleReads).toBe('slave');
    });

    it('should support all nodes read scaling', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        scaleReads: 'all',
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.scaleReads).toBe('all');
    });
  });

  describe('Replica Configuration', () => {
    it('should support reading from replicas', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        enableReadFromReplicas: true,
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.enableReadFromReplicas).strictEqual(true);
    });

    it('should support read-only mode', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        readOnly: true,
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.readOnly).strictEqual(true);
    });
  });

  describe('Cluster Resilience', () => {
    it('should configure max redirections', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        maxRedirections: 32,
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.maxRedirections).toBe(32);
    });

    it('should configure retry delay on failover', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        retryDelayOnFailover: 500,
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.retryDelayOnFailover).toBe(500);
    });

    it('should support offline queue configuration', async () => {
      const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], {
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      assert.ok((cluster ).clusterOptions.enableOfflineQueue).strictEqual(false);
    });
  });
});
