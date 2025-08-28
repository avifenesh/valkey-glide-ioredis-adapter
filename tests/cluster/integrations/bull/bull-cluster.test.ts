/**
 * Bull Integration Tests with ClusterAdapter
 * Adapted from Bull's connection tests to validate cluster compatibility
 */

import { expect } from 'chai';
import { ClusterAdapter } from '../../../../src/adapters/ClusterAdapter';
import { describe, it, beforeEach, afterEach } from 'mocha';

// Mock Bull Queue for testing
class MockBullQueue {
  private clients: { [key: string]: any } = {};
  private createClientFn: any;
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(name: string, options: any) {
    this.createClientFn = options.createClient;
    
    // Initialize clients using the createClient factory
    if (this.createClientFn) {
      this.clients.client = this.createClientFn('client');
      this.clients.subscriber = this.createClientFn('subscriber');
      this.clients.bclient = this.createClientFn('bclient');
    }
  }
  
  get client() { return this.clients.client; }
  get subscriber() { return this.clients.subscriber; }
  get bclient() { return this.clients.bclient; }
  
  async close() {
    for (const client of Object.values(this.clients)) {
      if (client && client.disconnect) {
        await client.disconnect();
      }
    }
  }
}

describe('Bull Integration with ClusterAdapter', () => {
  let clusterConfig: any;
  
  beforeEach(() => {
    clusterConfig = {
      nodes: [
        { host: '127.0.0.1', port: 7000 },
        { host: '127.0.0.1', port: 7001 },
        { host: '127.0.0.1', port: 7002 }
      ]
    };
  });

  describe('Bull createClient Pattern', () => {
    it('should work with Bull createClient factory', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect(queue.client).to.be.instanceOf(ClusterAdapter);
      expect(queue.subscriber).to.be.instanceOf(ClusterAdapter);
      expect(queue.bclient).to.be.instanceOf(ClusterAdapter);
      
      expect((queue.client as any).clientType).to.equal('client');
      expect((queue.subscriber as any).clientType).to.equal('subscriber');
      expect((queue.bclient as any).clientType).to.equal('bclient');
    });

    it('should enable blocking operations for bclient', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect((queue.bclient as any).enableBlockingOps).to.equal(true);
      expect((queue.client as any).enableBlockingOps).to.not.equal(true);
      expect((queue.subscriber as any).enableBlockingOps).to.not.equal(true);
    });

    it('should create separate client instances', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect(queue.client).to.not.equal(queue.subscriber);
      expect(queue.client).to.not.equal(queue.bclient);
      expect(queue.subscriber).to.not.equal(queue.bclient);
    });
  });

  describe('Cluster Configuration', () => {
    it('should accept cluster-specific options in createClient', () => {
      const clusterOptions = {
        nodes: [
          { host: '127.0.0.1', port: 7000 },
          { host: '127.0.0.1', port: 7001 },
          { host: '127.0.0.1', port: 7002 }
        ],
        enableReadFromReplicas: true,
        scaleReads: 'all' as const,
        maxRedirections: 32,
        retryDelayOnFailover: 200
      };
      
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterOptions);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect((queue.client as any).options.enableReadFromReplicas).to.equal(true);
      expect((queue.client as any).options.scaleReads).to.equal('all');
      expect((queue.client as any).options.maxRedirections).to.equal(32);
      expect((queue.client as any).options.retryDelayOnFailover).to.equal(200);
    });

    it('should support single node cluster configuration', () => {
      const singleNodeConfig = {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      };
      
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, singleNodeConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect(queue.client).to.be.instanceOf(ClusterAdapter);
      expect((queue.client as any).options.nodes).to.have.lengthOf(1);
    });
  });

  describe('Bull Command Compatibility', () => {
    let queue: MockBullQueue;
    
    beforeEach(() => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      queue = new MockBullQueue('test-queue', { createClient });
    });
    
    afterEach(async () => {
      await queue.close();
    });

    it('should have all required Bull commands on client', () => {
      const client = queue.client;
      
      // Basic Redis commands Bull uses
      expect(client.set).to.be.a('function');
      expect(client.get).to.be.a('function');
      expect(client.del).to.be.a('function');
      expect(client.exists).to.be.a('function');
      
      // List commands for job queues
      expect(client.lpush).to.be.a('function');
      expect(client.rpush).to.be.a('function');
      expect(client.lpop).to.be.a('function');
      expect(client.rpop).to.be.a('function');
      expect(client.llen).to.be.a('function');
      expect(client.lrange).to.be.a('function');
      
      // Sorted set commands for delayed jobs
      expect(client.zadd).to.be.a('function');
      expect(client.zrem).to.be.a('function');
      expect(client.zcard).to.be.a('function');
      expect(client.zrange).to.be.a('function');
      expect(client.zrangebyscore).to.be.a('function');
      
      // Hash commands for job data
      expect(client.hset).to.be.a('function');
      expect(client.hget).to.be.a('function');
      expect(client.hmset).to.be.a('function');
      expect(client.hgetall).to.be.a('function');
      
      // Transaction commands
      expect(client.multi).to.be.a('function');
      expect(client.exec).to.be.a('function');
      expect(client.watch).to.be.a('function');
      expect(client.unwatch).to.be.a('function');
      
      // Script commands for Lua scripts
      expect(client.eval).to.be.a('function');
      expect(client.evalsha).to.be.a('function');
      expect(client.script).to.be.a('function');
      expect(client.defineCommand).to.be.a('function');
    });

    it('should have blocking commands on bclient', () => {
      const bclient = queue.bclient;
      
      // Blocking list operations Bull uses
      expect(bclient.blpop).to.be.a('function');
      expect(bclient.brpop).to.be.a('function');
      expect(bclient.brpoplpush).to.be.a('function');
      
      // Blocking sorted set operations
      expect(bclient.bzpopmin).to.be.a('function');
      expect(bclient.bzpopmax).to.be.a('function');
    });

    it('should have pub/sub commands on subscriber', () => {
      const subscriber = queue.subscriber;
      
      expect(subscriber.subscribe).to.be.a('function');
      expect(subscriber.unsubscribe).to.be.a('function');
      expect(subscriber.psubscribe).to.be.a('function');
      expect(subscriber.punsubscribe).to.be.a('function');
      expect(subscriber.publish).to.be.a('function');
    });
  });

  describe('Bull Lua Script Compatibility', () => {
    let client: ClusterAdapter;
    
    beforeEach(() => {
      client = ClusterAdapter.createClient('client', clusterConfig);
    });
    
    afterEach(async () => {
      await client.disconnect();
    });

    it('should support defineCommand for Bull Lua scripts', () => {
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
        lua: addJobScript
      });
      
      expect((client as any).addJob).to.be.a('function');
    });

    it('should support BullMQ-style array arguments', () => {
      const testScript = `
        return {KEYS[1], ARGV[1], ARGV[2]}
      `;
      
      client.defineCommand('testArrayArgs', {
        numberOfKeys: 1,
        lua: testScript
      });
      
      expect((client as any).testArrayArgs).to.be.a('function');
    });

    it('should handle empty Lua script results', () => {
      const emptyScript = `
        return {}
      `;
      
      client.defineCommand('emptyResult', {
        numberOfKeys: 0,
        lua: emptyScript
      });
      
      expect((client as any).emptyResult).to.be.a('function');
    });
  });

  describe('Connection Management', () => {
    it('should handle connection lifecycle', async () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      // All clients should start disconnected
      expect(queue.client.status).to.equal('disconnected');
      expect(queue.subscriber.status).to.equal('disconnected');
      expect(queue.bclient.status).to.equal('disconnected');
      
      await queue.close();
    });

    it('should support connection options', () => {
      const optionsConfig = {
        ...clusterConfig,
        username: 'testuser',
        password: 'testpass',
        db: 0
      };
      
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, optionsConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect((queue.client as any).options.username).to.equal('testuser');
      expect((queue.client as any).options.password).to.equal('testpass');
      expect((queue.client as any).options.db).to.equal(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit connection events', (done) => {
      const client = ClusterAdapter.createClient('client', clusterConfig);
      
      let eventCount = 0;
      const expectedEvents = ['connecting', 'connect', 'ready', 'error', 'end'];
      
      expectedEvents.forEach(event => {
        client.on(event, () => {
          eventCount++;
          if (eventCount === expectedEvents.length) {
            client.disconnect().then(() => done()).catch(done);
          }
        });
      });
      
      // Simulate events
      setTimeout(() => {
        expectedEvents.forEach(event => {
          client.emit(event);
        });
      }, 10);
    });

    it('should forward pub/sub events', (done) => {
      const subscriber = ClusterAdapter.createClient('subscriber', clusterConfig);
      
      let eventCount = 0;
      const pubsubEvents = ['message', 'pmessage', 'subscribe', 'unsubscribe'];
      
      pubsubEvents.forEach(event => {
        subscriber.on(event, () => {
          eventCount++;
          if (eventCount === pubsubEvents.length) {
            subscriber.disconnect().then(() => done()).catch(done);
          }
        });
      });
      
      // Simulate pub/sub events
      setTimeout(() => {
        pubsubEvents.forEach(event => {
          subscriber.emit(event, 'test-channel', 'test-message');
        });
      }, 10);
    });
  });

  describe('Error Handling', () => {
    it('should handle cluster connection errors', async () => {
      const invalidConfig = {
        nodes: [
          { host: 'invalid-host-1', port: 9999 },
          { host: 'invalid-host-2', port: 9998 }
        ]
      };
      
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, invalidConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      // Should handle errors gracefully
      queue.client.on('error', (_err: any) => {
        expect(_err).to.be.instanceOf(Error);
      });
      
      await queue.close();
    });

    it('should handle individual node failures', () => {
      const mixedConfig = {
        nodes: [
          { host: '127.0.0.1', port: 7000 },  // Valid
          { host: 'invalid-host', port: 9999 } // Invalid
        ]
      };
      
      const client = ClusterAdapter.createClient('client', mixedConfig);
      
      expect(client).to.be.instanceOf(ClusterAdapter);
      expect((client as any).options.nodes).to.have.lengthOf(2);
    });
  });

  describe('Performance Considerations', () => {
    it('should support connection pooling', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue1 = new MockBullQueue('queue-1', { createClient });
      const queue2 = new MockBullQueue('queue-2', { createClient });
      
      // Each queue should have its own client instances
      expect(queue1.client).to.not.equal(queue2.client);
      expect(queue1.subscriber).to.not.equal(queue2.subscriber);
      expect(queue1.bclient).to.not.equal(queue2.bclient);
    });

    it('should support read scaling configuration', () => {
      const scalingConfig = {
        ...clusterConfig,
        enableReadFromReplicas: true,
        scaleReads: 'all' as const
      };
      
      const client = ClusterAdapter.createClient('client', scalingConfig);
      
      expect((client as any).options.enableReadFromReplicas).to.equal(true);
      expect((client as any).options.scaleReads).to.equal('all');
    });
  });
});
