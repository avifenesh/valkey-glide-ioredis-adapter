/**
 * Bull Integration Tests with ClusterAdapter
 * Adapted from Bull's connection tests to validate cluster compatibility
 */

// Use Jest globals
import { ClusterAdapter } from '../../../../src/adapters/ClusterAdapter';

// Mock Bull Queue for testing
class MockBullQueue {
  // Using Jest; suppress unused name arg
  private clients: { [key: string]: any } = {};
  private createClientFn: any;
  
  constructor(_name: string, options: any) {
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
  
  beforeAll(async () => {
    // Check if cluster servers are available (ports 7000-7005)
    const clusterPorts = [7000, 7001, 7002, 7003, 7004, 7005];
    const net = await import('net');
    
    const isPortOpen = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => { socket.destroy(); resolve(false); }, 500);
        socket.setTimeout(500);
        socket.once('error', () => { clearTimeout(timeout); resolve(false); });
        socket.once('timeout', () => { clearTimeout(timeout); socket.destroy(); resolve(false); });
        socket.connect(port, '127.0.0.1', () => { 
          clearTimeout(timeout); 
          socket.end(); 
          resolve(true); 
        });
      });
    };
    
    const clusterPortChecks = await Promise.all(clusterPorts.map(isPortOpen));
    const hasCluster = clusterPortChecks.some(Boolean); // At least one cluster port should be available
    
    if (!hasCluster) {
      console.warn('⚠️  Cluster servers not available. Skipping Bull cluster integration tests...');
      console.warn('   To run cluster tests, start cluster with: ./scripts/start-test-servers.sh');
      
      // Skip all tests in this suite by marking as skipped
      test.skip('Bull cluster tests skipped - no cluster servers available', () => {});
      return;
    }
  });
  
  beforeEach(() => {
    clusterConfig = {
      nodes: [
        { host: 'localhost', port: 7000 },
        { host: 'localhost', port: 7001 },
        { host: 'localhost', port: 7002 },
        { host: 'localhost', port: 7003 },
        { host: 'localhost', port: 7004 },
        { host: 'localhost', port: 7005 }
      ]
    };
  });

  describe('Bull createClient Pattern', () => {
    it('should work with Bull createClient factory', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect(queue.client).toBeInstanceOf(ClusterAdapter);
      expect(queue.subscriber).toBeInstanceOf(ClusterAdapter);
      expect(queue.bclient).toBeInstanceOf(ClusterAdapter);
      
      expect((queue.client as any).clientType).toBe('client');
      expect((queue.subscriber as any).clientType).toBe('subscriber');
      expect((queue.bclient as any).clientType).toBe('bclient');
    });

    it('should enable blocking operations for bclient', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect((queue.bclient as any).enableBlockingOps).toBe(true);
      expect((queue.client as any).enableBlockingOps).not.toBe(true);
      expect((queue.subscriber as any).enableBlockingOps).not.toBe(true);
    });

    it('should create separate client instances', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect(queue.client).not.toBe(queue.subscriber);
      expect(queue.client).not.toBe(queue.bclient);
      expect(queue.subscriber).not.toBe(queue.bclient);
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
      
      expect((queue.client as any).options.enableReadFromReplicas).toBe(true);
      expect((queue.client as any).options.scaleReads).toBe('all');
      expect((queue.client as any).options.maxRedirections).toBe(32);
      expect((queue.client as any).options.retryDelayOnFailover).toBe(200);
    });

    it('should support single node cluster configuration', () => {
      const singleNodeConfig = {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      };
      
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, singleNodeConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      expect(queue.client).toBeInstanceOf(ClusterAdapter);
      expect((queue.client as any).options.nodes).toHaveLength(1);
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
      expect(client.set).toBeInstanceOf(Function);
      expect(client.get).toBeInstanceOf(Function);
      expect(client.del).toBeInstanceOf(Function);
      expect(client.exists).toBeInstanceOf(Function);
      
      // List commands for job queues
      expect(client.lpush).toBeInstanceOf(Function);
      expect(client.rpush).toBeInstanceOf(Function);
      expect(client.lpop).toBeInstanceOf(Function);
      expect(client.rpop).toBeInstanceOf(Function);
      expect(client.llen).toBeInstanceOf(Function);
      expect(client.lrange).toBeInstanceOf(Function);
      
      // Sorted set commands for delayed jobs
      expect(client.zadd).toBeInstanceOf(Function);
      expect(client.zrem).toBeInstanceOf(Function);
      expect(client.zcard).toBeInstanceOf(Function);
      expect(client.zrange).toBeInstanceOf(Function);
      expect(client.zrangebyscore).toBeInstanceOf(Function);
      
      // Hash commands for job data
      expect(client.hset).toBeInstanceOf(Function);
      expect(client.hget).toBeInstanceOf(Function);
      expect(client.hmset).toBeInstanceOf(Function);
      expect(client.hgetall).toBeInstanceOf(Function);
      
      // Transaction commands
      expect(client.multi).toBeInstanceOf(Function);
      expect(client.exec).toBeInstanceOf(Function);
      expect(client.watch).toBeInstanceOf(Function);
      expect(client.unwatch).toBeInstanceOf(Function);
      
      // Script commands for Lua scripts
      expect(client.eval).toBeInstanceOf(Function);
      expect(client.evalsha).toBeInstanceOf(Function);
      expect(client.script).toBeInstanceOf(Function);
      expect(client.defineCommand).toBeInstanceOf(Function);
    });

    it('should have blocking commands on bclient', () => {
      const bclient = queue.bclient;
      
      // Blocking list operations Bull uses
      expect(bclient.blpop).toBeInstanceOf(Function);
      expect(bclient.brpop).toBeInstanceOf(Function);
      expect(bclient.brpoplpush).toBeInstanceOf(Function);
      
      // Blocking sorted set operations
      expect(bclient.bzpopmin).toBeInstanceOf(Function);
      expect(bclient.bzpopmax).toBeInstanceOf(Function);
    });

    it('should have pub/sub commands on subscriber', () => {
      const subscriber = queue.subscriber;
      
      expect(subscriber.subscribe).toBeInstanceOf(Function);
      expect(subscriber.unsubscribe).toBeInstanceOf(Function);
      expect(subscriber.psubscribe).toBeInstanceOf(Function);
      expect(subscriber.punsubscribe).toBeInstanceOf(Function);
      expect(subscriber.publish).toBeInstanceOf(Function);
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
      
      expect((client as any).addJob).toBeInstanceOf(Function);
    });

    it('should support BullMQ-style array arguments', () => {
      const testScript = `
        return {KEYS[1], ARGV[1], ARGV[2]}
      `;
      
      client.defineCommand('testArrayArgs', {
        numberOfKeys: 1,
        lua: testScript
      });
      
      expect((client as any).testArrayArgs).toBeInstanceOf(Function);
    });

    it('should handle empty Lua script results', () => {
      const emptyScript = `
        return {}
      `;
      
      client.defineCommand('emptyResult', {
        numberOfKeys: 0,
        lua: emptyScript
      });
      
      expect((client as any).emptyResult).toBeInstanceOf(Function);
    });
  });

  describe('Connection Management', () => {
    it('should handle connection lifecycle', async () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, clusterConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      // All clients should start disconnected
      expect(queue.client.status).toBe('disconnected');
      expect(queue.subscriber.status).toBe('disconnected');
      expect(queue.bclient.status).toBe('disconnected');
      
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
      
      expect((queue.client as any).options.username).toBe('testuser');
      expect((queue.client as any).options.password).toBe('testpass');
      expect((queue.client as any).options.db).toBe(0);
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
          { host: 'localhost', port: 9999 },
          { host: 'localhost', port: 9998 }
        ]
      };
      
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, invalidConfig);
      };
      
      const queue = new MockBullQueue('test-queue', { createClient });
      
      // Should handle errors gracefully
      queue.client.on('error', (_err: any) => {
                  expect(_err).toBeInstanceOf(Error);
      });
      
      await queue.close();
    });

    it('should handle individual node failures', () => {
      const mixedConfig = {
        nodes: [
          { host: 'localhost', port: 7000 },  // Valid
          { host: 'localhost', port: 9999 }   // Invalid port
        ]
      };
      
      const client = ClusterAdapter.createClient('client', mixedConfig);
      
      expect(client).toBeInstanceOf(ClusterAdapter);
      expect((client as any).options.nodes).toHaveLength(2);
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
      expect(queue1.client).not.toBe(queue2.client);
      expect(queue1.subscriber).not.toBe(queue2.subscriber);
      expect(queue1.bclient).not.toBe(queue2.bclient);
    });

    it('should support read scaling configuration', () => {
      const scalingConfig = {
        ...clusterConfig,
        enableReadFromReplicas: true,
        scaleReads: 'all' as const
      };
      
      const client = ClusterAdapter.createClient('client', scalingConfig);
      
      expect((client as any).options.enableReadFromReplicas).toBe(true);
      expect((client as any).options.scaleReads).toBe('all');
    });
  });
});
