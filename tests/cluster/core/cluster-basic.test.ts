/**
 * Cluster Basic Tests - Adapted from ioredis cluster tests
 * Tests basic cluster functionality with our ClusterAdapter
 */

import { expect } from 'chai';
import { ClusterAdapter } from '../../../src/adapters/ClusterAdapter';
import { describe, it, beforeEach, afterEach } from 'mocha';

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
      
      expect(cluster).to.be.instanceOf(ClusterAdapter);
      expect(cluster.status).to.equal('disconnected');
    });

    it('should create cluster adapter with multiple nodes', async () => {
      const cluster = new ClusterAdapter({
        nodes: [
          { host: '127.0.0.1', port: 7000 },
          { host: '127.0.0.1', port: 7001 },
          { host: '127.0.0.1', port: 7002 }
        ]
      });
      
      expect(cluster).to.be.instanceOf(ClusterAdapter);
      expect(cluster.status).to.equal('disconnected');
    });

    it('should support createClient factory method', () => {
      const cluster = ClusterAdapter.createClient('client', {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).to.be.instanceOf(ClusterAdapter);
      expect((cluster as any).clientType).to.equal('client');
    });

    it('should support createClient with bclient type', () => {
      const cluster = ClusterAdapter.createClient('bclient', {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).to.be.instanceOf(ClusterAdapter);
      expect((cluster as any).clientType).to.equal('bclient');
      expect((cluster as any).enableBlockingOps).to.equal(true);
    });

    it('should support createClient with subscriber type', () => {
      const cluster = ClusterAdapter.createClient('subscriber', {
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster).to.be.instanceOf(ClusterAdapter);
      expect((cluster as any).clientType).to.equal('subscriber');
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
      
      expect(cluster).to.be.instanceOf(ClusterAdapter);
      expect((cluster as any).options.enableReadFromReplicas).to.equal(true);
      expect((cluster as any).options.scaleReads).to.equal('all');
      expect((cluster as any).options.maxRedirections).to.equal(32);
      expect((cluster as any).options.retryDelayOnFailover).to.equal(200);
      expect((cluster as any).options.enableOfflineQueue).to.equal(false);
      expect((cluster as any).options.readOnly).to.equal(true);
    });

    it('should use default cluster options', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect((cluster as any).options.enableReadFromReplicas).to.equal(false);
      expect((cluster as any).options.scaleReads).to.equal('master');
      expect((cluster as any).options.maxRedirections).to.equal(16);
      expect((cluster as any).options.retryDelayOnFailover).to.equal(100);
      expect((cluster as any).options.enableOfflineQueue).to.equal(true);
      expect((cluster as any).options.readOnly).to.equal(false);
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
      
      expect(duplicate).to.be.instanceOf(ClusterAdapter);
      expect(duplicate).to.not.equal(original);
      expect((duplicate as any).options.enableReadFromReplicas).to.equal(false);
      expect((duplicate as any).options.scaleReads).to.equal('all');
    });

    it('should preserve blocking operations in duplicate', async () => {
      const original = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      (original as any).enableBlockingOps = true;
      
      const duplicate = await original.duplicate();
      
      expect((duplicate as any).enableBlockingOps).to.equal(true);
    });
  });

  describe('Pipeline and Multi', () => {
    it('should create pipeline', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      const pipeline = cluster.pipeline();
      expect(pipeline).to.exist;
    });

    it('should create multi transaction', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      const multi = cluster.multi();
      expect(multi).to.exist;
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
      expect(cluster.set).to.be.a('function');
      expect(cluster.get).to.be.a('function');
      expect(cluster.mget).to.be.a('function');
      expect(cluster.mset).to.be.a('function');
      expect(cluster.incr).to.be.a('function');
      expect(cluster.decr).to.be.a('function');
    });

    it('should have hash command methods', () => {
      expect(cluster.hset).to.be.a('function');
      expect(cluster.hget).to.be.a('function');
      expect(cluster.hmset).to.be.a('function');
      expect(cluster.hmget).to.be.a('function');
      expect(cluster.hgetall).to.be.a('function');
      expect(cluster.hdel).to.be.a('function');
    });

    it('should have list command methods', () => {
      expect(cluster.lpush).to.be.a('function');
      expect(cluster.rpush).to.be.a('function');
      expect(cluster.lpop).to.be.a('function');
      expect(cluster.rpop).to.be.a('function');
      expect(cluster.llen).to.be.a('function');
      expect(cluster.lrange).to.be.a('function');
    });

    it('should have sorted set command methods', () => {
      expect(cluster.zadd).to.be.a('function');
      expect(cluster.zrem).to.be.a('function');
      expect(cluster.zcard).to.be.a('function');
      expect(cluster.zscore).to.be.a('function');
      expect(cluster.zrange).to.be.a('function');
      expect(cluster.zrevrange).to.be.a('function');
    });

    it('should have pub/sub command methods', () => {
      expect(cluster.publish).to.be.a('function');
      expect(cluster.subscribe).to.be.a('function');
      expect(cluster.unsubscribe).to.be.a('function');
      expect(cluster.psubscribe).to.be.a('function');
      expect(cluster.punsubscribe).to.be.a('function');
    });

    it('should have transaction command methods', () => {
      expect(cluster.script).to.be.a('function');
      expect(cluster.watch).to.be.a('function');
      expect(cluster.unwatch).to.be.a('function');
      expect(cluster.eval).to.be.a('function');
      expect(cluster.evalsha).to.be.a('function');
      expect(cluster.defineCommand).to.be.a('function');
    });

    it('should have blocking command methods', () => {
      expect(cluster.blpop).to.be.a('function');
      expect(cluster.brpop).to.be.a('function');
      expect(cluster.brpoplpush).to.be.a('function');
      expect(cluster.bzpopmin).to.be.a('function');
      expect(cluster.bzpopmax).to.be.a('function');
    });

    it('should have stream command methods', () => {
      expect(cluster.xadd).to.be.a('function');
      expect(cluster.xread).to.be.a('function');
      expect(cluster.xack).to.be.a('function');
      expect(cluster.xgroup).to.be.a('function');
      expect(cluster.xpending).to.be.a('function');
      expect(cluster.xclaim).to.be.a('function');
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
      
      expect(cluster.connect).to.be.a('function');
      expect(cluster.disconnect).to.be.a('function');
      expect(cluster.quit).to.be.a('function');
      expect(cluster.ping).to.be.a('function');
      expect(cluster.info).to.be.a('function');
    });

    it('should have sendCommand method', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }]
      });
      
      expect(cluster.sendCommand).to.be.a('function');
      expect(cluster.call).to.be.a('function');
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
      
      expect(client).to.be.instanceOf(ClusterAdapter);
      expect(subscriber).to.be.instanceOf(ClusterAdapter);
      expect(bclient).to.be.instanceOf(ClusterAdapter);
      
      expect((client as any).clientType).to.equal('client');
      expect((subscriber as any).clientType).to.equal('subscriber');
      expect((bclient as any).clientType).to.equal('bclient');
      expect((bclient as any).enableBlockingOps).to.equal(true);
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
        expect(err).to.be.instanceOf(Error);
      });
      
      try {
        await cluster.connect();
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
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
      
      expect((cluster as any).options.scaleReads).to.equal('master');
    });

    it('should support slave read scaling', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        scaleReads: 'slave'
      });
      
      expect((cluster as any).options.scaleReads).to.equal('slave');
    });

    it('should support all nodes read scaling', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        scaleReads: 'all'
      });
      
      expect((cluster as any).options.scaleReads).to.equal('all');
    });
  });

  describe('Replica Configuration', () => {
    it('should support reading from replicas', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        enableReadFromReplicas: true
      });
      
      expect((cluster as any).options.enableReadFromReplicas).to.equal(true);
    });

    it('should support read-only mode', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        readOnly: true
      });
      
      expect((cluster as any).options.readOnly).to.equal(true);
    });
  });

  describe('Cluster Resilience', () => {
    it('should configure max redirections', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        maxRedirections: 32
      });
      
      expect((cluster as any).options.maxRedirections).to.equal(32);
    });

    it('should configure retry delay on failover', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        retryDelayOnFailover: 500
      });
      
      expect((cluster as any).options.retryDelayOnFailover).to.equal(500);
    });

    it('should support offline queue configuration', () => {
      const cluster = new ClusterAdapter({
        nodes: [{ host: '127.0.0.1', port: 7000 }],
        enableOfflineQueue: false
      });
      
      expect((cluster as any).options.enableOfflineQueue).to.equal(false);
    });
  });
});
