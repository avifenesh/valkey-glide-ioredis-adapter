/**
 * Cluster Basic Tests - Adapted from ioredis cluster tests
 * Tests basic cluster functionality with our Cluster
 */

import { describe, it, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import pkg from '../../../dist/index.js';
const { Cluster } = pkg;
import { getClusterConfig } from '../../utils/test-config.mjs';
const nodes = getClusterConfig();

describe('Cluster - Basic Tests', () => {
  describe('Basic Operations', () => {
    it('should create cluster adapter with single node', async () => {
      const cluster = new Cluster([nodes[0]], {
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.status, 'disconnected');
    });

    it('should create cluster adapter with multiple nodes', async () => {
      const cluster = new Cluster(nodes, { lazyConnect: true });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.status, 'disconnected');
    });

    it('should support createClient factory method', async () => {
      const cluster = Cluster.createClient('client', {
        nodes,
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.clientType, 'client');
    });

    it('should support createClient with bclient type', async () => {
      const cluster = Cluster.createClient('bclient', {
        nodes,
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.clientType, 'bclient');
      assert.strictEqual(cluster.enableBlockingOps, true);
    });

    it('should support createClient with subscriber type', async () => {
      const cluster = Cluster.createClient('subscriber', {
        nodes,
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.clientType, 'subscriber');
    });
  });

  describe('Configuration Options', () => {
    it('should accept cluster-specific options', async () => {
      const cluster = new Cluster(nodes, {
        enableReadFromReplicas: true,
        scaleReads: 'all',
        maxRedirections: 32,
        retryDelayOnFailover: 200,
        enableOfflineQueue: false,
        readOnly: true,
        lazyConnect: true,
      });

      assert.ok(cluster instanceof Cluster);
      assert.strictEqual(cluster.clusterOptions.enableReadFromReplicas, true);
      assert.strictEqual(cluster.clusterOptions.scaleReads, 'all');
      assert.strictEqual(cluster.clusterOptions.maxRedirections, 32);
      assert.strictEqual(cluster.clusterOptions.retryDelayOnFailover, 200);
      assert.strictEqual(cluster.clusterOptions.enableOfflineQueue, false);
      assert.strictEqual(cluster.clusterOptions.readOnly, true);
      await cluster.disconnect().catch(() => {});
    });

    it('should use default cluster options', async () => {
      const cluster = new Cluster(nodes, {
        lazyConnect: true,
      });

      assert.ok(cluster.clusterOptions.enableReadFromReplicas === undefined);
      assert.ok(cluster.clusterOptions.scaleReads === undefined);
      assert.ok(cluster.clusterOptions.maxRedirections === undefined);
      assert.ok(cluster.clusterOptions.retryDelayOnFailover === undefined);
      assert.ok(cluster.clusterOptions.enableOfflineQueue === undefined);
      assert.ok(cluster.clusterOptions.readOnly === undefined);
    });
  });

  describe('Duplicate Method', () => {
    it('should create duplicate cluster adapter', async () => {
      const original = new Cluster(nodes, {
        enableReadFromReplicas: true,
        lazyConnect: true,
      });

      const duplicate = original.duplicate();

      assert.ok(duplicate instanceof Cluster);
      assert.notStrictEqual(duplicate, original);
      assert.strictEqual(duplicate.clusterOptions.enableReadFromReplicas, true);
      await original.disconnect().catch(() => {});
      await duplicate.disconnect().catch(() => {});
    });

    it('should preserve blocking operations in duplicate', async () => {
      const original = new Cluster(nodes, {
        lazyConnect: true,
      });
      original.enableBlockingOps = true;

      const duplicate = original.duplicate();

      assert.strictEqual(duplicate.enableBlockingOps, true);
      await original.disconnect().catch(() => {});
      await duplicate.disconnect().catch(() => {});
    });
  });

  describe('Pipeline and Multi', () => {
    it('should create pipeline', async () => {
      const cluster = new Cluster(nodes, {
        lazyConnect: true,
      });

      const pipeline = cluster.pipeline();
      assert.ok(pipeline);
      await cluster.disconnect().catch(() => {});
    });

    it('should create multi transaction', async () => {
      const cluster = new Cluster(nodes, {
        lazyConnect: true,
      });

      const multi = cluster.multi();
      assert.ok(multi);
      await cluster.disconnect().catch(() => {});
    });
  });

  describe('Command Delegation', () => {
    let cluster;

    beforeEach(() => {
      cluster = new Cluster(nodes, {
        lazyConnect: true,
      });
    });

    afterEach(async () => {
      await cluster.disconnect().catch(() => {});
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
    it('should forward pub/sub events', async () => {
      const cluster = new Cluster(nodes, {
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

      const eventPromise = new Promise(resolve => {
        expectedEvents.forEach(event => {
          cluster.on(event, () => {
            eventCount++;
            if (eventCount === expectedEvents.length) {
              resolve();
            }
          });
        });
      });

      // Simulate events from pubsub commands
      process.nextTick(() => {
        expectedEvents.forEach(event => {
          cluster.emit(event, 'test-channel', 'test-message');
        });
      });

      await eventPromise;
      await cluster.disconnect().catch(() => {});
    });
  });

  describe('Connection Management', () => {
    it('should have connection methods', async () => {
      const cluster = new Cluster(nodes, {
        lazyConnect: true,
      });

      assert.ok(cluster.connect instanceof Function);
      assert.ok(cluster.disconnect instanceof Function);
      assert.ok(cluster.quit instanceof Function);
      assert.ok(cluster.ping instanceof Function);
      assert.ok(cluster.info instanceof Function);
      await cluster.disconnect().catch(() => {});
    });

    it('should have sendCommand method', async () => {
      const cluster = new Cluster(nodes, {
        lazyConnect: true,
      });

      assert.ok(cluster.sendCommand instanceof Function);
      assert.ok(cluster.call instanceof Function);
      await cluster.disconnect().catch(() => {});
    });
  });

  describe('Bull Compatibility', () => {
    it('should work with Bull createClient pattern', async () => {
      const createClient = type => {
        return Cluster.createClient(type, {
          nodes,
          lazyConnect: true,
        });
      };

      const client = createClient('client');
      const subscriber = createClient('subscriber');
      const bclient = createClient('bclient');

      assert.ok(client instanceof Cluster);
      assert.ok(subscriber instanceof Cluster);
      assert.ok(bclient instanceof Cluster);

      assert.strictEqual(client.clientType, 'client');
      assert.strictEqual(subscriber.clientType, 'subscriber');
      assert.strictEqual(bclient.clientType, 'bclient');
      assert.strictEqual(bclient.enableBlockingOps, true);
      await client.disconnect().catch(() => {});
      await subscriber.disconnect().catch(() => {});
      await bclient.disconnect().catch(() => {});
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
      const errorPromise = new Promise(resolve => {
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
    if (process.env.CI) {
      return; // Skip scaling tests in CI
    }
    it('should support master read scaling', async () => {
      const cluster = new Cluster(nodes[0], {
        scaleReads: 'master',
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.scaleReads, 'master');
      await cluster.disconnect().catch(() => {});
    });

    it('should support slave read scaling', async () => {
      const cluster = new Cluster([nodes[0]], {
        scaleReads: 'slave',
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.scaleReads, 'slave');
      await cluster.disconnect().catch(() => {});
    });

    it('should support all nodes read scaling', async () => {
      const cluster = new Cluster(nodes[0], {
        scaleReads: 'all',
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.scaleReads, 'all');
      await cluster.disconnect().catch(() => {});
    });
  });

  describe('Replica Configuration', () => {
    it('should support reading from replicas', async () => {
      const cluster = new Cluster(nodes[0], {
        enableReadFromReplicas: true,
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.enableReadFromReplicas, true);
      await cluster.disconnect().catch(() => {});
    });

    it('should support read-only mode', async () => {
      const cluster = new Cluster(nodes[0], {
        readOnly: true,
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.readOnly, true);
      await cluster.disconnect().catch(() => {});
    });
  });

  describe('Cluster Resilience', () => {
    it('should configure max redirections', async () => {
      const cluster = new Cluster(nodes[0], {
        maxRedirections: 32,
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.maxRedirections, 32);
      await cluster.disconnect().catch(() => {});
    });

    it('should configure retry delay on failover', async () => {
      const cluster = new Cluster(nodes[0], {
        retryDelayOnFailover: 500,
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.retryDelayOnFailover, 500);
      await cluster.disconnect().catch(() => {});
    });

    it('should support offline queue configuration', async () => {
      const cluster = new Cluster(nodes[0], {
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      assert.strictEqual(cluster.clusterOptions.enableOfflineQueue, false);
      await cluster.disconnect().catch(() => {});
    });
  });
});
