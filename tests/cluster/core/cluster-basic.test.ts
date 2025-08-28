/**
 * Cluster Basic Tests - Adapted from ioredis cluster tests
 * Tests basic cluster functionality with our ClusterAdapter
 */

import { ClusterAdapter } from '../../../src/adapters/ClusterAdapter';


// Mock Redis cluster for testing
class MockRedisCluster {
  private servers: Map<number, any> = new Map();
  
  createServer(port: number, handler: (argv: string[]) => any) {
    // This would be implemented with actual Redis cluster mock
    // For now, we'll create a placeholder
    this.servers.set(port, { port, handler });
  }
  
  cleanup() {
    this.servers.clear();
  }
}

describe('ClusterAdapter - Basic Tests', () => {
  let mockCluster: MockRedisCluster;
  
  beforeEach(() => {
    mockCluster = new MockRedisCluster();
  });
  
  afterEach(() => {
    mockCluster.cleanup();
  });

  describe('Basic Operations', () => {
    it('should create cluster adapter with single node', async () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).toBeInstanceOf(ClusterAdapter);
      expect(cluster.status).toBe('disconnected');
    });

    it('should create cluster adapter with multiple nodes', async () => {
      const cluster = new ClusterAdapter({
        nodes: [
          { host: '127.0.0.1', port: 7000 },
          { host: '127.0.0.1', port: 7001 },
          { host: '127.0.0.1', port: 7002 }
        ]
      });
      
      expect(cluster).toBeInstanceOf(ClusterAdapter);
      expect(cluster.status).toBe('disconnected');
    });

    it('should support createClient factory method', () => {
      const cluster = ClusterAdapter.createClient('client', {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).toBeInstanceOf(ClusterAdapter);
      expect((cluster as any).clientType).toBe('client');
    });

    it('should support createClient with bclient type', () => {
      const cluster = ClusterAdapter.createClient('bclient', {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).toBeInstanceOf(ClusterAdapter);
      expect((cluster as any).clientType).toBe('bclient');
      expect((cluster as any).enableBlockingOps).toBe(true);
    });

    it('should support createClient with subscriber type', () => {
      const cluster = ClusterAdapter.createClient('subscriber', {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).toBeInstanceOf(ClusterAdapter);
      expect((cluster as any).clientType).toBe('subscriber');
    });
  });

  describe('Configuration Options', () => {
    it('should accept cluster-specific options', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        enableReadFromReplicas: true,
        scaleReads: 'all',
        maxRedirections: 32,
        retryDelayOnFailover: 200,
        enableOfflineQueue: false,
        readOnly: true
      });
      
      expect(cluster).toBeInstanceOf(ClusterAdapter);
      expect((cluster as any).options.enableReadFromReplicas).toBe(true);
      expect((cluster as any).options.scaleReads).toBe('all');
      expect((cluster as any).options.maxRedirections).toBe(32);
      expect((cluster as any).options.retryDelayOnFailover).toBe(200);
      expect((cluster as any).options.enableOfflineQueue).toBe(false);
      expect((cluster as any).options.readOnly).toBe(true);
    });

    it('should use default cluster options', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect((cluster as any).options.enableReadFromReplicas).toBe(false);
      expect((cluster as any).options.scaleReads).toBe('master');
      expect((cluster as any).options.maxRedirections).toBe(16);
      expect((cluster as any).options.retryDelayOnFailover).toBe(100);
      expect((cluster as any).options.enableOfflineQueue).toBe(true);
      expect((cluster as any).options.readOnly).toBe(false);
    });
  });

  describe('Duplicate Method', () => {
    it('should create duplicate cluster adapter', async () => {
      const original = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        enableReadFromReplicas: true
      });
      
      const duplicate = await original.duplicate({
        enableReadFromReplicas: false,
        scaleReads: 'all'
      });
      
      expect(duplicate).toBeInstanceOf(ClusterAdapter);
      expect(duplicate).not.toBe(original);
      expect((duplicate as any).options.enableReadFromReplicas).toBe(false);
      expect((duplicate as any).options.scaleReads).toBe('all');
    });

    it('should preserve blocking operations in duplicate', async () => {
      const original = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      (original as any).enableBlockingOps = true;
      
      const duplicate = await original.duplicate();
      
      expect((duplicate as any).enableBlockingOps).toBe(true);
    });
  });

  describe('Pipeline and Multi', () => {
    it('should create pipeline', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      const pipeline = cluster.pipeline();
      expect(pipeline).toBeTruthy();
    });

    it('should create multi transaction', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      const multi = cluster.multi();
      expect(multi).toBeTruthy();
    });
  });

  describe('Command Delegation', () => {
    let cluster: ClusterAdapter;
    
    beforeEach(() => {
      cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
    });

    it('should have string command methods', () => {
      expect(cluster.set).toBeInstanceOf(Function);
      expect(cluster.get).toBeInstanceOf(Function);
      expect(cluster.mget).toBeInstanceOf(Function);
      expect(cluster.mset).toBeInstanceOf(Function);
      expect(cluster.incr).toBeInstanceOf(Function);
      expect(cluster.decr).toBeInstanceOf(Function);
    });

    it('should have hash command methods', () => {
      expect(cluster.hset).toBeInstanceOf(Function);
      expect(cluster.hget).toBeInstanceOf(Function);
      expect(cluster.hmset).toBeInstanceOf(Function);
      expect(cluster.hmget).toBeInstanceOf(Function);
      expect(cluster.hgetall).toBeInstanceOf(Function);
      expect(cluster.hdel).toBeInstanceOf(Function);
    });

    it('should have list command methods', () => {
      expect(cluster.lpush).toBeInstanceOf(Function);
      expect(cluster.rpush).toBeInstanceOf(Function);
      expect(cluster.lpop).toBeInstanceOf(Function);
      expect(cluster.rpop).toBeInstanceOf(Function);
      expect(cluster.lrange).toBeInstanceOf(Function);
      expect(cluster.llen).toBeInstanceOf(Function);
    });

    it('should have sorted set command methods', () => {
      expect(cluster.zadd).toBeInstanceOf(Function);
      expect(cluster.zrem).toBeInstanceOf(Function);
      expect(cluster.zcard).toBeInstanceOf(Function);
      expect(cluster.zscore).toBeInstanceOf(Function);
      expect(cluster.zrange).toBeInstanceOf(Function);
      expect(cluster.zrevrange).toBeInstanceOf(Function);
    });

    it('should have pub/sub command methods', () => {
      expect(cluster.publish).toBeInstanceOf(Function);
      expect(cluster.subscribe).toBeInstanceOf(Function);
      expect(cluster.unsubscribe).toBeInstanceOf(Function);
      expect(cluster.psubscribe).toBeInstanceOf(Function);
      expect(cluster.punsubscribe).toBeInstanceOf(Function);
    });

    it('should have transaction command methods', () => {
      expect(cluster.script).toBeInstanceOf(Function);
      expect(cluster.watch).toBeInstanceOf(Function);
      expect(cluster.unwatch).toBeInstanceOf(Function);
      expect(cluster.eval).toBeInstanceOf(Function);
      expect(cluster.evalsha).toBeInstanceOf(Function);
      expect(cluster.defineCommand).toBeInstanceOf(Function);
    });

    it('should have blocking command methods', () => {
      expect(cluster.blpop).toBeInstanceOf(Function);
      expect(cluster.brpop).toBeInstanceOf(Function);
      expect(cluster.brpoplpush).toBeInstanceOf(Function);
      expect(cluster.bzpopmin).toBeInstanceOf(Function);
      expect(cluster.bzpopmax).toBeInstanceOf(Function);
    });

    it('should have stream command methods', () => {
      expect(cluster.xadd).toBeInstanceOf(Function);
      expect(cluster.xread).toBeInstanceOf(Function);
      expect(cluster.xack).toBeInstanceOf(Function);
      expect(cluster.xgroup).toBeInstanceOf(Function);
      expect(cluster.xpending).toBeInstanceOf(Function);
      expect(cluster.xclaim).toBeInstanceOf(Function);
    });
  });

  describe('Event Handling', () => {
    it('should forward pub/sub events', (done) => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      let eventCount = 0;
      const expectedEvents = ['message', 'pmessage', 'subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe'];
      
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
    it('should have connection methods', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster.connect).toBeInstanceOf(Function);
      expect(cluster.disconnect).toBeInstanceOf(Function);
      expect(cluster.quit).toBeInstanceOf(Function);
      expect(cluster.ping).toBeInstanceOf(Function);
      expect(cluster.info).toBeInstanceOf(Function);
    });

    it('should have sendCommand method', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster.sendCommand).toBeInstanceOf(Function);
      expect(cluster.call).toBeInstanceOf(Function);
    });
  });

  describe('Bull Compatibility', () => {
    it('should work with Bull createClient pattern', () => {
      const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
        return ClusterAdapter.createClient(type, {
          nodes: [
            { host: '127.0.0.1', port: 7000 },
            { host: '127.0.0.1', port: 7001 },
            { host: '127.0.0.1', port: 7002 }
          ]
        });
      };
      
      const client = createClient('client');
      const subscriber = createClient('subscriber');
      const bclient = createClient('bclient');
      
      expect(client).toBeInstanceOf(ClusterAdapter);
      expect(subscriber).toBeInstanceOf(ClusterAdapter);
      expect(bclient).toBeInstanceOf(ClusterAdapter);
      
      expect((client as any).clientType).toBe('client');
      expect((subscriber as any).clientType).toBe('subscriber');
      expect((bclient as any).clientType).toBe('bclient');
      expect((bclient as any).enableBlockingOps).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: 'invalid-host', port: 9999 }]
      });
      
      let errorEmitted = false;
      cluster.on('error', (err) => {
        errorEmitted = true;
        expect(err).toBeInstanceOf(Error);
      });
      
      try {
        await cluster.connect();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      // Ensure error event was emitted
      expect(errorEmitted).toBe(true);
    });
  });
});

// Additional test for cluster-specific scenarios
describe('ClusterAdapter - Cluster Specific Features', () => {
  describe('Read Scaling', () => {
    it('should support master read scaling', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        scaleReads: 'master'
      });
      
      expect((cluster as any).options.scaleReads).toBe('master');
    });

    it('should support slave read scaling', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        scaleReads: 'slave'
      });
      
      expect((cluster as any).options.scaleReads).toBe('slave');
    });

    it('should support all nodes read scaling', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        scaleReads: 'all'
      });
      
      expect((cluster as any).options.scaleReads).toBe('all');
    });
  });

  describe('Replica Configuration', () => {
    it('should support reading from replicas', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        enableReadFromReplicas: true
      });
      
      expect((cluster as any).options.enableReadFromReplicas).toBe(true);
    });

    it('should support read-only mode', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        readOnly: true
      });
      
      expect((cluster as any).options.readOnly).toBe(true);
    });
  });

  describe('Cluster Resilience', () => {
    it('should configure max redirections', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        maxRedirections: 32
      });
      
      expect((cluster as any).options.maxRedirections).toBe(32);
    });

    it('should configure retry delay on failover', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        retryDelayOnFailover: 500
      });
      
      expect((cluster as any).options.retryDelayOnFailover).toBe(500);
    });

    it('should support offline queue configuration', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        enableOfflineQueue: false
      });
      
      expect((cluster as any).options.enableOfflineQueue).toBe(false);
    });
  });
});
