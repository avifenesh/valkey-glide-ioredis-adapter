import { ClusterAdapter } from '../adapters/ClusterAdapter';
import { ClusterNode, ClusterOptions } from '../types';

describe('ClusterAdapter', () => {
  let clusterAdapter: ClusterAdapter;
  const clusterNodes: ClusterNode[] = [
    { host: 'localhost', port: 7000 },
    { host: 'localhost', port: 7001 },
    { host: 'localhost', port: 7002 }
  ];

  beforeEach(() => {
    clusterAdapter = new ClusterAdapter(clusterNodes);
  });

  afterEach(async () => {
    if (clusterAdapter) {
      await clusterAdapter.disconnect();
    }
  });

  describe('Cluster Management', () => {
    test('should return cluster nodes', () => {
      const nodes = clusterAdapter.nodes();
      expect(nodes).toHaveLength(3);
      expect(nodes[0]).toEqual({ host: 'localhost', port: 7000 });
      expect(nodes[1]).toEqual({ host: 'localhost', port: 7001 });
      expect(nodes[2]).toEqual({ host: 'localhost', port: 7002 });
    });

    test('should initialize with correct connection status', () => {
      expect(clusterAdapter.getConnectionStatus()).toBe('disconnected');
    });

    test('should handle cluster options correctly', () => {
      const options: ClusterOptions = {
        enableReadyCheck: true,
        maxRedirections: 16,
        retryDelayOnFailover: 100,
        slotsRefreshInterval: 30000
      };
      
      const adapter = new ClusterAdapter(clusterNodes, options);
      const nodes = adapter.nodes();
      expect(nodes).toHaveLength(3);
    });
  });

  describe('Connection Management', () => {
    test('should emit connecting event on connect attempt', async () => {
      const connectingSpy = jest.fn();
      clusterAdapter.on('connecting', connectingSpy);

      // This will fail in test environment but should emit event
      try {
        await clusterAdapter.connect();
      } catch (error) {
        // Expected to fail in test environment
      }

      expect(connectingSpy).toHaveBeenCalled();
    });

    test('should emit error on connection failure', async () => {
      const errorSpy = jest.fn();
      clusterAdapter.on('error', errorSpy);

      // This will fail in test environment
      try {
        await clusterAdapter.connect();
      } catch (error) {
        // Expected to fail
      }

      expect(errorSpy).toHaveBeenCalled();
    });

    test('should handle disconnect gracefully', async () => {
      const closeSpy = jest.fn();
      const endSpy = jest.fn();
      
      clusterAdapter.on('close', closeSpy);
      clusterAdapter.on('end', endSpy);

      await clusterAdapter.disconnect();

      expect(closeSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('String Commands (Mock Tests)', () => {
    test('should have get method', () => {
      expect(typeof clusterAdapter.get).toBe('function');
    });

    test('should have set method', () => {
      expect(typeof clusterAdapter.set).toBe('function');
    });

    test('should have mget method', () => {
      expect(typeof clusterAdapter.mget).toBe('function');
    });

    test('should have mset method', () => {
      expect(typeof clusterAdapter.mset).toBe('function');
    });
  });

  describe('Hash Commands (Mock Tests)', () => {
    test('should have hget method', () => {
      expect(typeof clusterAdapter.hget).toBe('function');
    });

    test('should have hset method', () => {
      expect(typeof clusterAdapter.hset).toBe('function');
    });

    test('should have hgetall method', () => {
      expect(typeof clusterAdapter.hgetall).toBe('function');
    });
  });

  describe('List Commands (Mock Tests)', () => {
    test('should have lpush method', () => {
      expect(typeof clusterAdapter.lpush).toBe('function');
    });

    test('should have rpush method', () => {
      expect(typeof clusterAdapter.rpush).toBe('function');
    });

    test('should have lrange method', () => {
      expect(typeof clusterAdapter.lrange).toBe('function');
    });
  });

  describe('Set Commands (Mock Tests)', () => {
    test('should have sadd method', () => {
      expect(typeof clusterAdapter.sadd).toBe('function');
    });

    test('should have smembers method', () => {
      expect(typeof clusterAdapter.smembers).toBe('function');
    });
  });

  describe('Key Commands (Mock Tests)', () => {
    test('should have del method', () => {
      expect(typeof clusterAdapter.del).toBe('function');
    });

    test('should have exists method', () => {
      expect(typeof clusterAdapter.exists).toBe('function');
    });

    test('should have expire method', () => {
      expect(typeof clusterAdapter.expire).toBe('function');
    });

    test('should have ttl method', () => {
      expect(typeof clusterAdapter.ttl).toBe('function');
    });
  });

  describe('Cluster-Specific Commands (Mock Tests)', () => {
    test('should have getBySlot method', () => {
      expect(typeof clusterAdapter.getBySlot).toBe('function');
    });

    test('should have setBySlot method', () => {
      expect(typeof clusterAdapter.setBySlot).toBe('function');
    });

    test('should have getByAddress method', () => {
      expect(typeof clusterAdapter.getByAddress).toBe('function');
    });

    test('should have ping method with node targeting', () => {
      expect(typeof clusterAdapter.ping).toBe('function');
    });

    test('should have info method with node targeting', () => {
      expect(typeof clusterAdapter.info).toBe('function');
    });
  });

  describe('Pipeline and Transactions', () => {
    test('should create pipeline adapter', () => {
      const pipeline = clusterAdapter.pipeline();
      expect(pipeline).toBeDefined();
      expect(typeof pipeline.exec).toBe('function');
    });

    test('should create multi adapter', () => {
      const multi = clusterAdapter.multi();
      expect(multi).toBeDefined();
      expect(typeof multi.exec).toBe('function');
    });
  });

  describe('Pub/Sub Commands (Mock Tests)', () => {
    test('should have publish method', () => {
      expect(typeof clusterAdapter.publish).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('should handle connection errors gracefully', async () => {
      // Commands should throw when not connected
      await expect(clusterAdapter.get('test')).rejects.toThrow();
    });

    test('should throw for unsupported cluster scan', async () => {
      await expect(clusterAdapter.scan()).rejects.toThrow('Cluster SCAN requires ClusterScanCursor');
    });

    test('should throw for getAllKeys', async () => {
      await expect(clusterAdapter.getAllKeys()).rejects.toThrow('getAllKeys not implemented for cluster');
    });
  });

  describe('Configuration Handling', () => {
    test('should handle redis options in cluster configuration', () => {
      const options: ClusterOptions = {
        redisOptions: {
          host: 'localhost',
          port: 6379,
          password: 'secret',
          username: 'admin',
          tls: true,
          connectTimeout: 5000
        },
        maxRedirections: 10,
        slotsRefreshInterval: 15000
      };

      const adapter = new ClusterAdapter(clusterNodes, options);
      expect(adapter.nodes()).toHaveLength(3);
    });

    test('should handle empty cluster options', () => {
      const adapter = new ClusterAdapter(clusterNodes, {});
      expect(adapter.nodes()).toHaveLength(3);
      expect(adapter.getConnectionStatus()).toBe('disconnected');
    });
  });

  describe('Event Emitter Functionality', () => {
    test('should be an EventEmitter instance', () => {
      expect(clusterAdapter.on).toBeDefined();
      expect(clusterAdapter.emit).toBeDefined();
      expect(clusterAdapter.removeListener).toBeDefined();
    });

    test('should handle multiple event listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      clusterAdapter.on('test', listener1);
      clusterAdapter.on('test', listener2);
      
      clusterAdapter.emit('test', 'data');
      
      expect(listener1).toHaveBeenCalledWith('data');
      expect(listener2).toHaveBeenCalledWith('data');
    });
  });
});

describe('ClusterAdapter Integration Patterns', () => {
  describe('ioredis Compatibility', () => {
    test('should match ioredis cluster interface pattern', () => {
      const nodes: ClusterNode[] = [
        { host: '127.0.0.1', port: 7000 },
        { host: '127.0.0.1', port: 7001 }
      ];
      
      const adapter = new ClusterAdapter(nodes);
      
      // Should have ioredis-like interface
      expect(typeof adapter.get).toBe('function');
      expect(typeof adapter.set).toBe('function');
      expect(typeof adapter.pipeline).toBe('function');
      expect(typeof adapter.multi).toBe('function');
      expect(typeof adapter.publish).toBe('function');
      expect(typeof adapter.nodes).toBe('function');
    });

    test('should support ioredis cluster constructor patterns', () => {
      // Pattern 1: Array of nodes
      const adapter1 = new ClusterAdapter([
        { host: 'localhost', port: 7000 },
        { host: 'localhost', port: 7001 }
      ]);
      expect(adapter1.nodes()).toHaveLength(2);

      // Pattern 2: Array of nodes with options
      const adapter2 = new ClusterAdapter([
        { host: 'localhost', port: 7000 }
      ], {
        enableReadyCheck: false,
        maxRedirections: 3
      });
      expect(adapter2.nodes()).toHaveLength(1);
    });
  });

  describe('Routing Behavior', () => {
    test('should support key-based routing methods', () => {
      const adapter = new ClusterAdapter([{ host: 'localhost', port: 7000 }]);
      
      // These methods should exist for cluster-specific routing
      expect(typeof adapter.getBySlot).toBe('function');
      expect(typeof adapter.setBySlot).toBe('function');
      expect(typeof adapter.getByAddress).toBe('function');
    });
  });
});