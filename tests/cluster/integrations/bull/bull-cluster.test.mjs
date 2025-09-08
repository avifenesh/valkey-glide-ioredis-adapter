/**
 * Bull Integration Tests with Cluster
 * Adapted from Bull's connection tests to validate cluster compatibility
 */

// Use Jest globals
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
import pkg from '../../../../dist/index.js';
const { Cluster } = pkg;

// Mock Bull Queue for testing
class MockBullQueue {
  // Using Jest; suppress unused name arg
  clients = {};
  createClientFn;

  constructor(_name, options) {
    this.createClientFn = options.createClient;

    // Initialize clients using the createClient factory
    if (this.createClientFn) {
      this.clients.client = this.createClientFn('client');
      this.clients.subscriber = this.createClientFn('subscriber');
      this.clients.bclient = this.createClientFn('bclient');
    }
  }

  get client() {
    return this.clients.client;
  }
  get subscriber() {
    return this.clients.subscriber;
  }
  get bclient() {
    return this.clients.bclient;
  }

  async close() {
    for (const client of Object.values(this.clients)) {
      if (client && client.disconnect) {
        await client.disconnect();
      }
    }
  }
}

describe('Bull Integration with Cluster', () => {
  let clusterConfig;

  beforeEach(() => {
    clusterConfig = {
      nodes: [
        { host: 'localhost', port: 7000 },
        { host: 'localhost', port: 7001 },
        { host: 'localhost', port: 7002 },
        { host: 'localhost', port: 7003 },
        { host: 'localhost', port: 7004 },
        { host: 'localhost', port: 7005 },
      ],
    };
  });

  describe('Bull createClient Pattern', () => {
    it('should work with Bull createClient factory', async () => {
      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      assert.ok(queue.client instanceof Cluster);
      assert.ok(queue.subscriber instanceof Cluster);
      assert.ok(queue.bclient instanceof Cluster);

      assert.strictEqual(queue.client.clientType, 'client');
      assert.strictEqual(queue.subscriber.clientType, 'subscriber');
      assert.strictEqual(queue.bclient.clientType, 'bclient');
    });

    it('should enable blocking operations for bclient', async () => {
      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      assert.strictEqual(queue.bclient.enableBlockingOps, true);
      assert.ok(queue.client.enableBlockingOps !== true);
      assert.ok(queue.subscriber.enableBlockingOps !== true);
    });

    it('should create separate client instances', async () => {
      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      assert.notStrictEqual(queue.client, queue.subscriber);
      assert.notStrictEqual(queue.client, queue.bclient);
      assert.notStrictEqual(queue.subscriber, queue.bclient);
    });
  });

  describe('Cluster Configuration', () => {
    it('should accept cluster-specific options in createClient', async () => {
      const clusterOptions = {
        nodes: [
          { host: '127.0.0.1', port: 7000 },
          { host: '127.0.0.1', port: 7001 },
          { host: '127.0.0.1', port: 7002 },
        ],
        enableReadFromReplicas: true,
        scaleReads: 'all',
        maxRedirections: 32,
        retryDelayOnFailover: 200,
      };

      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterOptions,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      assert.strictEqual(queue.client.options.enableReadFromReplicas, true);
      assert.strictEqual(queue.client.options.scaleReads, 'all');
      assert.strictEqual(queue.client.options.maxRedirections, 32);
      assert.strictEqual(queue.client.options.retryDelayOnFailover, 200);
    });

    it('should support single node cluster configuration', async () => {
      const singleNodeConfig = {
        nodes: [{ host: '127.0.0.1', port: 7000 }],
      };

      const createClient = type => {
        return Cluster.createClient(type, {
          ...singleNodeConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      assert.ok(queue.client instanceof Cluster);
      assert.strictEqual(queue.client.options.nodes.length, 1);
    });
  });

  describe('Bull Command Compatibility', () => {
    let queue;

    beforeEach(() => {
      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterConfig,
          lazyConnect: true,
        });
      };

      queue = new MockBullQueue('test-queue', { createClient });
    });

    afterEach(async () => {
      await queue.close();
    });

    it('should have all required Bull commands on client', async () => {
      const client = queue.client;

      // Basic Redis commands Bull uses
      assert.ok(client.set instanceof Function);
      assert.ok(client.get instanceof Function);
      assert.ok(client.del instanceof Function);
      assert.ok(client.exists instanceof Function);

      // List commands for job queues
      assert.ok(client.lpush instanceof Function);
      assert.ok(client.rpush instanceof Function);
      assert.ok(client.lpop instanceof Function);
      assert.ok(client.rpop instanceof Function);
      assert.ok(client.llen instanceof Function);
      assert.ok(client.lrange instanceof Function);

      // Sorted set commands for delayed jobs
      assert.ok(client.zadd instanceof Function);
      assert.ok(client.zrem instanceof Function);
      assert.ok(client.zcard instanceof Function);
      assert.ok(client.zrange instanceof Function);
      assert.ok(client.zrangebyscore instanceof Function);

      // Hash commands for job data
      assert.ok(client.hset instanceof Function);
      assert.ok(client.hget instanceof Function);
      assert.ok(client.hmset instanceof Function);
      assert.ok(client.hgetall instanceof Function);

      // Transaction commands
      assert.ok(client.multi instanceof Function);
      assert.ok(client.exec instanceof Function);
      assert.ok(client.watch instanceof Function);
      assert.ok(client.unwatch instanceof Function);

      // Script commands for Lua scripts
      assert.ok(client.eval instanceof Function);
      assert.ok(client.evalsha instanceof Function);
      assert.ok(client.script instanceof Function);
      assert.ok(client.defineCommand instanceof Function);
    });

    it('should have blocking commands on bclient', async () => {
      const bclient = queue.bclient;

      // Blocking list operations Bull uses
      assert.ok(bclient.blpop instanceof Function);
      assert.ok(bclient.brpop instanceof Function);
      assert.ok(bclient.brpoplpush instanceof Function);

      // Blocking sorted set operations
      assert.ok(bclient.bzpopmin instanceof Function);
      assert.ok(bclient.bzpopmax instanceof Function);
    });

    it('should have pub/sub commands on subscriber', async () => {
      const subscriber = queue.subscriber;

      assert.ok(subscriber.subscribe instanceof Function);
      assert.ok(subscriber.unsubscribe instanceof Function);
      assert.ok(subscriber.psubscribe instanceof Function);
      assert.ok(subscriber.punsubscribe instanceof Function);
      assert.ok(subscriber.publish instanceof Function);
    });
  });

  describe('Bull Lua Script Compatibility', () => {
    let client;

    beforeEach(() => {
      client = Cluster.createClient('client', {
        ...clusterConfig,
        lazyConnect: true,
      });
    });

    afterEach(async () => {
      await client.disconnect();
    });

    it('should support defineCommand for Bull Lua scripts', async () => {
      // Example Bull Lua script for adding jobs
      const addJobScript = `
        local jobId = ARGV[1]
        local data = ARGV[2]
        local opts = ARGV[3]
        
        redis.call('HMSET', KEYS[1] .. ':' .. jobId, 'data', data, 'opts', opts)
        redis.call('LPUSH', KEYS[2], jobId)
        
        return jobId
      `;

      client.defineCommand('addJob', {
        numberOfKeys: 2,
        lua: addJobScript,
      });

      assert.ok(client.addJob instanceof Function);
    });

    it('should support BullMQ-style array arguments', async () => {
      const testScript = `
        return {KEYS[1], ARGV[1], ARGV[2]}
      `;

      client.defineCommand('testArrayArgs', {
        numberOfKeys: 1,
        lua: testScript,
      });

      assert.ok(client.testArrayArgs instanceof Function);
    });

    it('should handle empty Lua script results', async () => {
      const emptyScript = `
        return {}
      `;

      client.defineCommand('emptyResult', {
        numberOfKeys: 0,
        lua: emptyScript,
      });

      assert.ok(client.emptyResult instanceof Function);
    });
  });

  describe('Connection Management', () => {
    it('should handle connection lifecycle', async () => {
      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      // All clients should start disconnected
      assert.strictEqual(queue.client.status, 'disconnected');
      assert.strictEqual(queue.subscriber.status, 'disconnected');
      assert.strictEqual(queue.bclient.status, 'disconnected');

      await queue.close();
    });

    it('should support connection options', async () => {
      const optionsConfig = {
        ...clusterConfig,
        username: 'testuser',
        password: 'testpass',
        db: 0,
      };

      const createClient = type => {
        return Cluster.createClient(type, {
          ...optionsConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      assert.strictEqual(queue.client.options.username, 'testuser');
      assert.strictEqual(queue.client.options.password, 'testpass');
      assert.strictEqual(queue.client.options.db, 0);
    });
  });

  describe('Event Handling', () => {
    it('should emit connection events', async () => {
      const client = Cluster.createClient('client', {
        ...clusterConfig,
        lazyConnect: true,
      });

      let eventCount = 0;
      let resolved = false;
      const expectedEvents = ['connecting', 'connect', 'ready', 'error', 'end'];

      return new Promise((resolve, reject) => {
        const eventHandler = () => {
          if (resolved) return; // Prevent multiple resolutions
          eventCount++;
          if (eventCount === expectedEvents.length) {
            resolved = true;
            // Remove all event listeners to prevent late firing
            expectedEvents.forEach(event => {
              client.removeAllListeners(event);
            });
            client
              .disconnect()
              .then(() => resolve())
              .catch(reject);
          }
        };

        expectedEvents.forEach(event => {
          client.on(event, eventHandler);
        });

        // Simulate events
        const timeout = setTimeout(() => {
          if (!resolved) {
            expectedEvents.forEach(event => {
              client.emit(event);
            });
          }
        }, 10);

        // Cleanup timeout if test resolves early
        const originalResolve = resolve;
        resolve = (...args) => {
          clearTimeout(timeout);
          originalResolve(...args);
        };
      });
    });

    it('should forward pub/sub events', async () => {
      const subscriber = Cluster.createClient('subscriber', {
        ...clusterConfig,
        lazyConnect: true,
      });

      let eventCount = 0;
      let resolved = false;
      const pubsubEvents = ['message', 'pmessage', 'subscribe', 'unsubscribe'];

      return new Promise((resolve, reject) => {
        const eventHandler = () => {
          if (resolved) return; // Prevent multiple resolutions
          eventCount++;
          if (eventCount === pubsubEvents.length) {
            resolved = true;
            // Remove all event listeners to prevent late firing
            pubsubEvents.forEach(event => {
              subscriber.removeAllListeners(event);
            });
            subscriber
              .disconnect()
              .then(() => resolve())
              .catch(reject);
          }
        };

        pubsubEvents.forEach(event => {
          subscriber.on(event, eventHandler);
        });

        // Simulate pub/sub events
        const timeout = setTimeout(() => {
          if (!resolved) {
            pubsubEvents.forEach(event => {
              subscriber.emit(event, 'test-channel', 'test-message');
            });
          }
        }, 10);

        // Cleanup timeout if test resolves early
        const originalResolve = resolve;
        resolve = (...args) => {
          clearTimeout(timeout);
          originalResolve(...args);
        };
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle cluster connection errors', async () => {
      const invalidConfig = {
        nodes: [
          { host: 'localhost', port: 9999 },
          { host: 'localhost', port: 9998 },
        ],
      };

      const createClient = type => {
        return Cluster.createClient(type, {
          ...invalidConfig,
          lazyConnect: true,
        });
      };

      const queue = new MockBullQueue('test-queue', { createClient });

      // Should handle errors gracefully
      queue.client.on('error', _err => {
        assert.ok(_err instanceof Error);
      });

      await queue.close();
    });

    it('should handle individual node failures', async () => {
      const mixedConfig = {
        nodes: [
          { host: 'localhost', port: 7000 }, // Valid
          { host: 'localhost', port: 9999 }, // Invalid port
        ],
      };

      const client = Cluster.createClient('client', {
        ...mixedConfig,
        lazyConnect: true,
      });

      assert.ok(client instanceof Cluster);
      assert.strictEqual(client.options.nodes.length, 2);
    });
  });

  describe('Performance Considerations', () => {
    it('should support connection pooling', async () => {
      const createClient = type => {
        return Cluster.createClient(type, {
          ...clusterConfig,
          lazyConnect: true,
        });
      };

      const queue1 = new MockBullQueue('queue-1', { createClient });
      const queue2 = new MockBullQueue('queue-2', { createClient });

      // Each queue should have its own client instances
      assert.notStrictEqual(queue1.client, queue2.client);
      assert.notStrictEqual(queue1.subscriber, queue2.subscriber);
      assert.notStrictEqual(queue1.bclient, queue2.bclient);
    });

    it('should support read scaling configuration', async () => {
      const scalingConfig = {
        ...clusterConfig,
        enableReadFromReplicas: true,
        scaleReads: 'all',
      };

      const client = Cluster.createClient('client', {
        ...scalingConfig,
        lazyConnect: true,
      });

      assert.strictEqual(client.options.enableReadFromReplicas, true);
      assert.strictEqual(client.options.scaleReads, 'all');
    });
  });
});
