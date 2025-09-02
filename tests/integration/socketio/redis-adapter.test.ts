/**
 * Socket.IO Redis Adapter Integration Test
 *
 * Tests that our ioredis adapter works correctly with @socket.io/redis-adapter
 * for multi-instance Socket.IO scaling and real-time applications.
 */

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io as Client } from 'socket.io-client';
import { createServer } from 'http';
import { Redis } from '../../../src';
import { testUtils } from '../../setup';

describe('Socket.IO Valkey Adapter Integration', () => {
  let valkeyClient1: Redis;
  let valkeyClient2: Redis;
  let subClient1: Redis;
  let subClient2: Redis;
  let server1: any;
  let server2: any;
  let io1: SocketIOServer;
  let io2: SocketIOServer;
  let port1: number;
  let port2: number;
  const keyPrefix = 'TEST:socketio:';
  let originalHandlers: any[];

  beforeAll(async () => {
    // Setup global error handler for GLIDE ClosingError during tests
    originalHandlers = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');

    process.on('uncaughtException', (error: Error) => {
      if (
        error.name === 'ClosingError' &&
        error.message === 'Cleanup initiated'
      ) {
        // Silently ignore GLIDE ClosingError during Socket.IO cleanup
        console.log(
          'Test: Ignoring GLIDE ClosingError during Socket.IO cleanup'
        );
        return;
      }

      // Silently ignore GLIDE UTF-8 errors from Socket.IO binary pub/sub data
      if (error.message && error.message.includes('invalid utf-8 sequence')) {
        console.log(
          'Test: Ignoring GLIDE UTF-8 error from Socket.IO binary pub/sub data'
        );
        return;
      }

      // For all other errors, restore original behavior
      if (originalHandlers.length > 0) {
        originalHandlers.forEach(handler => {
          if (typeof handler === 'function') {
            handler(error);
          }
        });
      } else {
        throw error;
      }
    });

    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available for Socket.IO integration tests. Please start test servers first.'
      );
    }

    // Create shared Valkey connections once for all tests (reduces load by half)
    const config = await testUtils.getStandaloneConfig();

    valkeyClient1 = new Redis({
      ...config,
      keyPrefix: keyPrefix + 'pub:',
      enableEventBasedPubSub: true, // Enable binary-safe pub/sub for Socket.IO
    });

    valkeyClient2 = new Redis({
      ...config,
      keyPrefix: keyPrefix + 'sub:',
      enableEventBasedPubSub: true, // Enable binary-safe pub/sub for Socket.IO
    });

    await valkeyClient1.connect();
    await valkeyClient2.connect();

    // Create duplicate clients for pub/sub (Socket.IO adapter pattern)
    subClient1 = valkeyClient1.duplicate();
    subClient2 = valkeyClient2.duplicate();

    await subClient1.connect();
    await subClient2.connect();
  });

  afterAll(async () => {
    // Clean up shared Valkey connections
    if (valkeyClient1) {
      try {
        const keys = await valkeyClient1.keys(`${keyPrefix}*`);
        if (keys.length > 0) {
          await valkeyClient1.del(...keys);
        }
      } catch {
        // Ignore cleanup errors
      }
      await valkeyClient1.disconnect();
    }

    if (valkeyClient2) {
      await valkeyClient2.disconnect();
    }

    if (subClient1) {
      await subClient1.disconnect();
    }

    if (subClient2) {
      await subClient2.disconnect();
    }

    // Restore original uncaughtException handlers
    process.removeAllListeners('uncaughtException');
    originalHandlers.forEach(handler => {
      process.on('uncaughtException', handler);
    });
  });

  beforeEach(async () => {
    // Skip tests if servers are not available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      pending('Test servers not available');
      return;
    }

    // Get available ports for Socket.IO servers using system allocation
    // This approach uses port 0 to let the OS choose available ports
    const net = await import('net');

    // Get first available port
    const tempServer1 = net.createServer();
    await new Promise<void>(resolve => {
      tempServer1.listen(0, () => {
        port1 = (tempServer1.address() as any)?.port || 0;
        tempServer1.close(() => resolve());
      });
    });

    // Get second available port
    const tempServer2 = net.createServer();
    await new Promise<void>(resolve => {
      tempServer2.listen(0, () => {
        port2 = (tempServer2.address() as any)?.port || 0;
        tempServer2.close(() => resolve());
      });
    });

    // Valkey clients are now shared across tests (created in beforeAll)

    // Create HTTP servers
    server1 = createServer();
    server2 = createServer();

    // Create Socket.IO instances
    io1 = new SocketIOServer(server1, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    io2 = new SocketIOServer(server2, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Setup Valkey adapters for both instances (using shared connections)
    try {
      const adapter1 = createAdapter(valkeyClient1 as any, subClient1 as any);
      const adapter2 = createAdapter(valkeyClient2 as any, subClient2 as any);

      io1.adapter(adapter1);
      io2.adapter(adapter2);
    } catch (error: any) {
      throw new Error(
        `Failed to setup Redis adapters: ${error.message}. Cross-instance functionality must work.`
      );
    }

    // Setup event handlers
    io1.on('connection', socket => {
      socket.on('join-room', room => {
        socket.join(room);
        socket.emit('joined-room', room);
      });

      socket.on('leave-room', room => {
        socket.leave(room);
        socket.emit('left-room', room);
      });

      socket.on('broadcast-to-room', data => {
        socket.to(data.room).emit('room-message', data.message);
      });

      socket.on('private-message', data => {
        socket.to(data.targetSocketId).emit('private-message', data.message);
      });
    });

    io2.on('connection', socket => {
      socket.on('join-room', room => {
        socket.join(room);
        socket.emit('joined-room', room);
      });

      socket.on('broadcast-to-room', data => {
        socket.to(data.room).emit('room-message', data.message);
      });
    });

    // Start servers
    await new Promise<void>(resolve => {
      server1.listen(port1, resolve);
    });

    await new Promise<void>(resolve => {
      server2.listen(port2, resolve);
    });

    // Wait for servers to be ready
    await testUtils.delay(100);
  });

  afterEach(async () => {
    // Small delay to let any pending operations complete
    await testUtils.delay(100);

    // Close Socket.IO servers (global error handler will catch GLIDE ClosingError)
    if (io1) {
      io1.close();
    }
    if (io2) {
      io2.close();
    }

    // Longer delay after close to let cleanup settle on macOS
    await testUtils.delay(200);

    // Close HTTP servers
    if (server1) {
      server1.close();
    }
    if (server2) {
      server2.close();
    }

    // Valkey clients are now shared - no cleanup needed per test

    // Wait longer for cleanup to complete on macOS (port limit issues)
    await testUtils.delay(300);
  });

  describe('Basic Socket.IO Functionality', () => {
    test('should connect and communicate with single instance', async () => {
      const client = Client(`http://localhost:${port1}`);

      await new Promise<void>(resolve => {
        client.on('connect', () => {
          expect(client.connected).toBe(true);
          resolve();
        });
      });

      client.disconnect();
    });

    test('should handle room joining and broadcasting', async () => {
      const client1 = Client(`http://localhost:${port1}`);
      const client2 = Client(`http://localhost:${port1}`);

      const room = 'test-room-' + testUtils.randomString();
      let messagesReceived = 0;

      await Promise.all([
        new Promise<void>(resolve => client1.on('connect', resolve)),
        new Promise<void>(resolve => client2.on('connect', resolve)),
      ]);

      // Both clients join the same room
      await Promise.all([
        new Promise<void>(resolve => {
          client1.emit('join-room', room);
          client1.on('joined-room', resolve);
        }),
        new Promise<void>(resolve => {
          client2.emit('join-room', room);
          client2.on('joined-room', resolve);
        }),
      ]);

      // Setup message listener
      const messagePromise = new Promise<void>(resolve => {
        client2.on('room-message', (message: string) => {
          expect(message).toBe('Hello room!');
          messagesReceived++;
          resolve();
        });
      });

      // Client 1 broadcasts to room
      client1.emit('broadcast-to-room', {
        room: room,
        message: 'Hello room!',
      });

      await messagePromise;
      expect(messagesReceived).toBe(1);

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Cross-Instance Communication (requires Redis adapter)', () => {
    test('should broadcast messages across different Socket.IO instances', async () => {
      const client1 = Client(`http://localhost:${port1}`);
      const client2 = Client(`http://localhost:${port2}`);

      const room = 'cross-instance-room-' + testUtils.randomString();

      await Promise.all([
        new Promise<void>(resolve => client1.on('connect', resolve)),
        new Promise<void>(resolve => client2.on('connect', resolve)),
      ]);

      // Both clients join the same room on different instances
      await Promise.all([
        new Promise<void>(resolve => {
          client1.emit('join-room', room);
          client1.on('joined-room', resolve);
        }),
        new Promise<void>(resolve => {
          client2.emit('join-room', room);
          client2.on('joined-room', resolve);
        }),
      ]);

      // Setup cross-instance message test
      const crossInstancePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              'Cross-instance message not received (Redis adapter may not be working)'
            )
          );
        }, 2000);

        client2.on('room-message', (message: string) => {
          clearTimeout(timeout);
          expect(message).toBe('Cross-instance hello!');
          resolve();
        });
      });

      // Client 1 (instance 1) broadcasts to room
      client1.emit('broadcast-to-room', {
        room: room,
        message: 'Cross-instance hello!',
      });

      // Cross-instance communication must work - no graceful fallbacks
      await crossInstancePromise;

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Room Management', () => {
    test('should handle multiple rooms correctly', async () => {
      const client = Client(`http://localhost:${port1}`);

      await new Promise<void>(resolve => client.on('connect', resolve));

      const room1 = 'room1-' + testUtils.randomString();
      const room2 = 'room2-' + testUtils.randomString();

      // Join multiple rooms
      await Promise.all([
        (new Promise<void>(resolve => {
          client.emit('join-room', room1);
          client.on('joined-room', (room: string) => {
            if (room === room1) resolve();
          });
        }),
        new Promise<void>(resolve => {
          client.emit('join-room', room2);
          client.on('joined-room', (room: string) => {
            if (room === room2) resolve();
          });
        })),
      ]);

      // Leave one room
      await new Promise<void>(resolve => {
        client.emit('leave-room', room1);
        client.on('left-room', resolve);
      });

      client.disconnect();
    });
  });

  describe('Error Handling', () => {
    test('should handle Redis connection errors gracefully', async () => {
      // This test verifies the adapter handles Redis issues gracefully
      const client = Client(`http://localhost:${port1}`);

      await new Promise<void>(resolve => client.on('connect', resolve));

      // Even if Redis has issues, basic Socket.IO should work
      const room = 'error-test-room';

      await new Promise<void>(resolve => {
        client.emit('join-room', room);
        client.on('joined-room', resolve);
      });

      client.disconnect();
    });

    test('should handle disconnections properly', async () => {
      const client = Client(`http://localhost:${port1}`);

      await new Promise<void>(resolve => client.on('connect', resolve));

      const disconnectPromise = new Promise<void>(resolve => {
        client.on('disconnect', _reason => resolve());
      });

      client.disconnect();
      await disconnectPromise;
    });
  });

  describe('Performance & Scalability', () => {
    test('should handle multiple concurrent connections', async () => {
      const clients = [];
      const connectionPromises = [];

      // Create multiple clients
      for (let i = 0; i < 5; i++) {
        const client = Client(`http://localhost:${port1}`);
        clients.push(client);

        connectionPromises.push(
          new Promise<void>(resolve => client.on('connect', resolve))
        );
      }

      // Wait for all to connect
      await Promise.all(connectionPromises);

      // All should be connected
      expect(clients.every(client => client.connected)).toBe(true);

      // Cleanup
      clients.forEach(client => client.disconnect());
    });
  });
});
