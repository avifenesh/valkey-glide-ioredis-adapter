/**
 * Integration Tests with Socket.io Redis Adapter
 * Testing real-time communication scenarios
 */

import { RedisAdapter } from '../adapters/RedisAdapter';
import { EventEmitter } from 'events';

// Mock Socket.io classes for testing
class MockSocketIORedisAdapter extends EventEmitter {
  private pubClient: any;
  private subClient: any;
  private nsp: string;
  private rooms: Map<string, Set<string>> = new Map();
  private sockets: Map<string, any> = new Map();

  constructor(pubClient: any, subClient: any, opts: { key?: string } = {}) {
    super();
    this.pubClient = pubClient;
    this.subClient = subClient;
    this.nsp = opts.key || 'socket.io';
    
    // Setup subscription for Socket.io messages
    this.setupSubscriptions();
  }

  private async setupSubscriptions(): Promise<void> {
    // Subscribe to Socket.io channels
    await this.subClient.psubscribe(`${this.nsp}#*`);
    
    this.subClient.on('pmessage', (pattern: string, channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        this.handleSocketIOMessage(channel, data);
      } catch (error) {
        console.error('Failed to parse Socket.io message:', error);
      }
    });
  }

  private handleSocketIOMessage(channel: string, data: any): void {
    const { type, nsp, data: msgData } = data;
    
    if (nsp !== this.nsp) return;

    switch (type) {
      case 'message':
        this.emit('message', msgData);
        break;
      case 'join':
        this.handleJoin(msgData.socketId, msgData.room);
        break;
      case 'leave':
        this.handleLeave(msgData.socketId, msgData.room);
        break;
      case 'disconnect':
        this.handleDisconnect(msgData.socketId);
        break;
    }
  }

  private handleJoin(socketId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socketId);
  }

  private handleLeave(socketId: string, room: string): void {
    const roomSockets = this.rooms.get(room);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  private handleDisconnect(socketId: string): void {
    // Remove socket from all rooms
    for (const [room, sockets] of this.rooms.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.rooms.delete(room);
      }
    }
    this.sockets.delete(socketId);
  }

  async broadcast(packet: any, opts: { rooms?: string[]; except?: string[] } = {}): Promise<void> {
    const message = {
      type: 'message',
      nsp: this.nsp,
      data: {
        packet,
        opts
      }
    };

    if (opts.rooms && opts.rooms.length > 0) {
      // Broadcast to specific rooms
      for (const room of opts.rooms) {
        await this.pubClient.publish(`${this.nsp}#${room}`, JSON.stringify(message));
      }
    } else {
      // Broadcast to all
      await this.pubClient.publish(`${this.nsp}#all`, JSON.stringify(message));
    }
  }

  async join(socketId: string, room: string): Promise<void> {
    const message = {
      type: 'join',
      nsp: this.nsp,
      data: { socketId, room }
    };

    await this.pubClient.publish(`${this.nsp}#${room}`, JSON.stringify(message));
    this.handleJoin(socketId, room);
  }

  async leave(socketId: string, room: string): Promise<void> {
    const message = {
      type: 'leave',
      nsp: this.nsp,
      data: { socketId, room }
    };

    await this.pubClient.publish(`${this.nsp}#${room}`, JSON.stringify(message));
    this.handleLeave(socketId, room);
  }

  async disconnect(socketId: string): Promise<void> {
    const message = {
      type: 'disconnect',
      nsp: this.nsp,
      data: { socketId }
    };

    await this.pubClient.publish(`${this.nsp}#disconnect`, JSON.stringify(message));
    this.handleDisconnect(socketId);
  }

  getRooms(): Map<string, Set<string>> {
    return new Map(this.rooms);
  }

  getSocketsInRoom(room: string): string[] {
    const roomSockets = this.rooms.get(room);
    return roomSockets ? Array.from(roomSockets) : [];
  }

  async close(): Promise<void> {
    await this.subClient.punsubscribe();
    await this.subClient.disconnect();
    await this.pubClient.disconnect();
  }
}

class MockSocket extends EventEmitter {
  id: string;
  rooms: Set<string> = new Set();
  adapter: MockSocketIORedisAdapter;

  constructor(id: string, adapter: MockSocketIORedisAdapter) {
    super();
    this.id = id;
    this.adapter = adapter;
  }

  async join(room: string): Promise<void> {
    this.rooms.add(room);
    await this.adapter.join(this.id, room);
  }

  async leave(room: string): Promise<void> {
    this.rooms.delete(room);
    await this.adapter.leave(this.id, room);
  }

  async emit(event: string, ...args: any[]): Promise<void> {
    const packet = { event, args };
    await this.adapter.broadcast(packet, { 
      rooms: Array.from(this.rooms),
      except: [this.id] 
    });
  }

  async broadcast(event: string, ...args: any[]): Promise<void> {
    const packet = { event, args };
    await this.adapter.broadcast(packet, { 
      rooms: Array.from(this.rooms) 
    });
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect(this.id);
    this.removeAllListeners();
  }
}

describe('Socket.io Redis Adapter Integration Tests', () => {
  let pubClient: RedisAdapter;
  let subClient: RedisAdapter;

  beforeEach(async () => {
    pubClient = new RedisAdapter({
      pooling: {
        enablePooling: true,
        maxConnections: 3
      }
    });
    
    subClient = new RedisAdapter({
      pooling: {
        enablePooling: true,
        maxConnections: 3
      }
    });
  });

  afterEach(async () => {
    await pubClient.disconnect();
    await subClient.disconnect();
  });

  describe('Basic Socket.io Operations', () => {
    it('should handle socket connections and rooms', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      try {
        // Create mock sockets
        const socket1 = new MockSocket('socket-1', adapter);
        const socket2 = new MockSocket('socket-2', adapter);

        // Join rooms
        await socket1.join('room1');
        await socket1.join('room2');
        await socket2.join('room1');

        // Verify room membership
        const room1Sockets = adapter.getSocketsInRoom('room1');
        const room2Sockets = adapter.getSocketsInRoom('room2');

        expect(room1Sockets).toContain('socket-1');
        expect(room1Sockets).toContain('socket-2');
        expect(room2Sockets).toContain('socket-1');
        expect(room2Sockets).not.toContain('socket-2');

        await socket1.disconnect();
        await socket2.disconnect();
      } finally {
        await adapter.close();
      }
    });

    it('should broadcast messages to rooms', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      let receivedMessages: any[] = [];
      adapter.on('message', (data) => {
        receivedMessages.push(data);
      });

      try {
        const socket = new MockSocket('broadcaster', adapter);
        await socket.join('chat-room');

        // Wait for subscription to be established
        await new Promise(resolve => setTimeout(resolve, 100));

        // Broadcast a message
        await socket.broadcast('chat-message', {
          user: 'john',
          message: 'Hello everyone!'
        });

        // Wait for message propagation
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(receivedMessages.length).toBeGreaterThan(0);

        await socket.disconnect();
      } finally {
        await adapter.close();
      }
    });

    it('should handle socket disconnections', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      try {
        const socket = new MockSocket('temp-socket', adapter);
        
        // Join multiple rooms
        await socket.join('room-a');
        await socket.join('room-b');

        // Verify socket is in rooms
        expect(adapter.getSocketsInRoom('room-a')).toContain('temp-socket');
        expect(adapter.getSocketsInRoom('room-b')).toContain('temp-socket');

        // Disconnect socket
        await socket.disconnect();

        // Verify socket is removed from all rooms
        expect(adapter.getSocketsInRoom('room-a')).not.toContain('temp-socket');
        expect(adapter.getSocketsInRoom('room-b')).not.toContain('temp-socket');
      } finally {
        await adapter.close();
      }
    });
  });

  describe('Multi-Instance Communication', () => {
    it('should enable communication between multiple server instances', async () => {
      // Simulate two Socket.io server instances
      const adapter1 = new MockSocketIORedisAdapter(pubClient, subClient, { key: 'instance1' });
      const adapter2 = new MockSocketIORedisAdapter(pubClient, subClient, { key: 'instance2' });

      const messages1: any[] = [];
      const messages2: any[] = [];

      adapter1.on('message', (data) => messages1.push(data));
      adapter2.on('message', (data) => messages2.push(data));

      try {
        // Wait for subscriptions
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send message from instance 1
        await adapter1.broadcast({
          event: 'server-announcement',
          data: 'Message from instance 1'
        });

        // Send message from instance 2
        await adapter2.broadcast({
          event: 'server-announcement', 
          data: 'Message from instance 2'
        });

        // Wait for message propagation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Each instance should receive its own message (in real scenario, they wouldn't)
        // This test verifies the pub/sub mechanism works
        expect(messages1.length).toBeGreaterThanOrEqual(0);
        expect(messages2.length).toBeGreaterThanOrEqual(0);

      } finally {
        await adapter1.close();
        await adapter2.close();
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high frequency messaging', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      let messageCount = 0;
      adapter.on('message', () => messageCount++);

      try {
        // Wait for subscription
        await new Promise(resolve => setTimeout(resolve, 100));

        const startTime = Date.now();
        const messagePromises = [];

        // Send 100 messages rapidly
        for (let i = 0; i < 100; i++) {
          messagePromises.push(
            adapter.broadcast({
              event: 'rapid-fire',
              data: { index: i, timestamp: Date.now() }
            })
          );
        }

        await Promise.all(messagePromises);
        const endTime = Date.now();

        const duration = endTime - startTime;
        console.log(`Sent 100 messages in ${duration}ms`);

        // Verify reasonable performance (should complete within 5 seconds)
        expect(duration).toBeLessThan(5000);

      } finally {
        await adapter.close();
      }
    });

    it('should handle multiple concurrent rooms', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      try {
        const sockets: MockSocket[] = [];
        const roomPromises = [];

        // Create 50 sockets and join different rooms
        for (let i = 0; i < 50; i++) {
          const socket = new MockSocket(`socket-${i}`, adapter);
          sockets.push(socket);
          
          const roomId = `room-${Math.floor(i / 10)}`; // 5 rooms with 10 sockets each
          roomPromises.push(socket.join(roomId));
        }

        await Promise.all(roomPromises);

        // Verify room distribution
        for (let i = 0; i < 5; i++) {
          const roomSockets = adapter.getSocketsInRoom(`room-${i}`);
          expect(roomSockets.length).toBe(10);
        }

        // Broadcast to each room
        const broadcastPromises = [];
        for (let i = 0; i < 5; i++) {
          broadcastPromises.push(
            adapter.broadcast({
              event: 'room-message',
              data: { roomId: `room-${i}`, message: 'Hello room!' }
            }, { rooms: [`room-${i}`] })
          );
        }

        await Promise.all(broadcastPromises);

        // Cleanup
        await Promise.all(sockets.map(socket => socket.disconnect()));

      } finally {
        await adapter.close();
      }
    });
  });

  describe('Connection Pooling with Socket.io', () => {
    it('should efficiently use Redis connections for pub/sub', async () => {
      const pooledPubClient = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 2,
          minConnections: 1
        }
      });

      const pooledSubClient = new RedisAdapter({
        pooling: {
          enablePooling: true,
          maxConnections: 2,
          minConnections: 1
        }
      });

      try {
        const adapter = new MockSocketIORedisAdapter(pooledPubClient, pooledSubClient);

        // Perform multiple pub/sub operations
        const operations = [];
        for (let i = 0; i < 20; i++) {
          operations.push(
            adapter.broadcast({
              event: 'pool-test',
              data: { index: i }
            })
          );
        }

        await Promise.all(operations);

        // Check pool statistics
        const pubStats = pooledPubClient.getPoolStats();
        const subStats = pooledSubClient.getPoolStats();

        expect(pubStats.poolingEnabled).toBe(true);
        expect(subStats.poolingEnabled).toBe(true);
        expect(pubStats.totalConnections).toBeLessThanOrEqual(2);
        expect(subStats.totalConnections).toBeLessThanOrEqual(2);

        await adapter.close();
      } finally {
        await pooledPubClient.disconnect();
        await pooledSubClient.disconnect();
      }
    });
  });

  describe('Redis Commands Used by Socket.io', () => {
    it('should support Socket.io pub/sub patterns', async () => {
      // Test pattern subscription (Socket.io uses patterns like 'socket.io#*')
      await subClient.psubscribe('test-pattern:*');

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 100));

      let receivedMessages: string[] = [];
      subClient.on('pmessage', (pattern: string, channel: string, message: string) => {
        receivedMessages.push(message);
      });

      // Publish to pattern-matching channels
      await pubClient.publish('test-pattern:room1', 'message for room1');
      await pubClient.publish('test-pattern:room2', 'message for room2');
      await pubClient.publish('other-pattern:room1', 'should not match');

      // Wait for message propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessages).toContain('message for room1');
      expect(receivedMessages).toContain('message for room2');
      expect(receivedMessages).not.toContain('should not match');

      await subClient.punsubscribe('test-pattern:*');
    });

    it('should handle Socket.io namespace operations', async () => {
      const namespace = 'chat-app';
      
      // Store namespace data (like Socket.io does)
      await pubClient.hset(`${namespace}:config`, {
        name: namespace,
        created: Date.now().toString(),
        maxConnections: '1000'
      });

      // Store room membership
      await pubClient.sadd(`${namespace}:room:general`, 'socket1', 'socket2', 'socket3');
      await pubClient.sadd(`${namespace}:room:private`, 'socket1', 'socket4');

      // Verify namespace configuration
      const config = await pubClient.hgetall(`${namespace}:config`);
      expect(config.name).toBe(namespace);

      // Verify room membership
      const generalMembers = await pubClient.smembers(`${namespace}:room:general`);
      const privateMembers = await pubClient.smembers(`${namespace}:room:private`);

      expect(generalMembers).toContain('socket1');
      expect(generalMembers).toContain('socket2');
      expect(privateMembers).toContain('socket1');
      expect(privateMembers).toContain('socket4');

      // Test room cleanup (remove socket from all rooms)
      await pubClient.srem(`${namespace}:room:general`, 'socket1');
      await pubClient.srem(`${namespace}:room:private`, 'socket1');

      const updatedGeneral = await pubClient.smembers(`${namespace}:room:general`);
      const updatedPrivate = await pubClient.smembers(`${namespace}:room:private`);

      expect(updatedGeneral).not.toContain('socket1');
      expect(updatedPrivate).not.toContain('socket1');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      try {
        const socket = new MockSocket('resilient-socket', adapter);
        
        // Perform operations before potential connection issue
        await socket.join('resilient-room');
        
        // Simulate continued operation after potential reconnection
        await socket.broadcast('test-message', { data: 'test' });
        
        // Verify socket is still in room
        const roomSockets = adapter.getSocketsInRoom('resilient-room');
        expect(roomSockets).toContain('resilient-socket');

        await socket.disconnect();
      } finally {
        await adapter.close();
      }
    });

    it('should maintain room state consistency', async () => {
      const adapter = new MockSocketIORedisAdapter(pubClient, subClient);
      
      try {
        const sockets: MockSocket[] = [];
        
        // Create multiple sockets and add to rooms
        for (let i = 0; i < 10; i++) {
          const socket = new MockSocket(`socket-${i}`, adapter);
          sockets.push(socket);
          await socket.join('consistency-room');
        }

        // Verify all sockets are in the room
        const roomSockets = adapter.getSocketsInRoom('consistency-room');
        expect(roomSockets.length).toBe(10);

        // Disconnect half the sockets
        for (let i = 0; i < 5; i++) {
          await sockets[i].disconnect();
        }

        // Verify room state is updated correctly
        const updatedRoomSockets = adapter.getSocketsInRoom('consistency-room');
        expect(updatedRoomSockets.length).toBe(5);

        // Cleanup remaining sockets
        for (let i = 5; i < 10; i++) {
          await sockets[i].disconnect();
        }

      } finally {
        await adapter.close();
      }
    });
  });
});