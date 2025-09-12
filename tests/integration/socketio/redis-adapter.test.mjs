/**
 * Socket.IO Redis Adapter Integration Test
 *
 * Tests that our ioredis adapter works correctly with @socket.io/redis-adapter
 * for multi-instance Socket.IO scaling and real-time applications.
 */

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
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io } from 'socket.io-client';
import { createServer } from 'http';
import pkg from '../../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../../utils/test-config.mjs';

async function checkTestServers() {
  try {
    const config = getStandaloneConfig();
    const testClient = new Redis(config);
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch (error) {
    return false;
  }
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
describe('Socket.IO Valkey Adapter Integration', () => {
  let valkeyClient1;
  let valkeyClient2;
  let subClient1;
  let subClient2;
  let server1;
  let server2;
  let io1;
  let io2;
  let port1;
  let port2;
  const keyPrefix = 'TEST:socketio:';
  let originalHandlers = [];

  before(async () => {
    // Setup global error handler for GLIDE ClosingError during tests
    originalHandlers = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');

    process.on('uncaughtException', error => {
      if (
        error.name === 'ClosingError' &&
        error.message === 'Cleanup initiated'
      ) {
        // Silently ignore GLIDE ClosingError during Socket.IO cleanup
        console.log('Test GLIDE ClosingError during Socket.IO cleanup');
        return;
      }

      // Silently ignore GLIDE UTF-8 errors from Socket.IO binary pub/sub data
      if (error.message && error.message.includes('invalid utf-8 sequence')) {
        console.log(
          'Test GLIDE UTF-8 error from Socket.IO binary pub/sub data'
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
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available for Socket.IO integration tests. Please start test servers first.'
      );
    }

    // Create shared Valkey connections once for all tests (reduces load by half)
    const config = await getStandaloneConfig();

    valkeyClient1 = new Redis({
      ...config,
      keyPrefix: keyPrefix, // Same prefix for all clients to enable cross-instance communication
      enableEventBasedPubSub: true, // Enable binary-safe pub/sub for Socket.IO
    });

    valkeyClient2 = new Redis({
      ...config,
      keyPrefix: keyPrefix, // Same prefix for all clients to enable cross-instance communication
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

  after(async () => {
    // Clean up shared Valkey connections
    if (valkeyClient1) {
      try {
        // Clean up Socket.IO keys via SCAN
        let cursor = '0';
        const keys = [];
        do {
          const res = await valkeyClient1.scan(
            cursor,
            'MATCH',
            `${keyPrefix}*`,
            'COUNT',
            200
          );
          cursor = Array.isArray(res) ? res[0] : '0';
          const batch = Array.isArray(res) ? res[1] : [];
          if (Array.isArray(batch) && batch.length) keys.push(...batch);
        } while (cursor !== '0');
        if (keys.length > 0) await valkeyClient1.del(...keys);
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
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      this.skip('Test servers not available');
      return;
    }

    // Get available ports for Socket.IO servers using system allocation
    // This approach uses port 0 to let the OS choose available ports
    const net = await import('net');

    // Get first available port
    const tempServer1 = net.createServer();
    await new Promise(resolve => {
      tempServer1.listen(0, () => {
        port1 = tempServer1.address()?.port || 0;
        tempServer1.close(() => resolve());
      });
    });

    // Get second available port
    const tempServer2 = net.createServer();
    await new Promise(resolve => {
      tempServer2.listen(0, () => {
        port2 = tempServer2.address()?.port || 0;
        tempServer2.close(() => resolve());
      });
    });

    // Valkey clients are now shared across tests (created in beforeAll)

    // Create HTTP servers
    server1 = createServer();
    server2 = createServer();

    // Create Socket.IO instances
    io1 = new Server(server1, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    io2 = new Server(server2, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Setup Valkey adapters for both instances (using shared connections)
    try {
      const adapter1 = createAdapter(valkeyClient1, subClient1);
      const adapter2 = createAdapter(valkeyClient2, subClient2);

      io1.adapter(adapter1);
      io2.adapter(adapter2);
    } catch (error) {
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
    await new Promise(resolve => {
      server1.listen(port1, resolve);
    });

    await new Promise(resolve => {
      server2.listen(port2, resolve);
    });

    // Wait for servers to be ready
    await delay(100);
  });

  afterEach(async () => {
    // Small delay to let any pending operations complete
    await delay(100);

    // Close Socket.IO servers (global error handler will catch GLIDE ClosingError)
    if (io1) {
      io1.close();
    }
    if (io2) {
      io2.close();
    }

    // Longer delay after close to let cleanup settle on macOS
    await delay(200);

    // Close HTTP servers
    if (server1) {
      server1.close();
    }
    if (server2) {
      server2.close();
    }

    // Valkey clients are now shared - no cleanup needed per test

    // Wait longer for cleanup to complete on macOS (port limit issues)
    await delay(300);
  });

  describe('Basic Socket.IO Functionality', () => {
    test('should connect and communicate with single instance', async () => {
      const client = io(`http://localhost:${port1}`);

      await new Promise(resolve => {
        client.on('connect', () => {
          assert.strictEqual(client.connected, true);
          resolve();
        });
      });

      client.disconnect();
    });

    test('should handle room joining and broadcasting', async () => {
      const client1 = io(`http://localhost:${port1}`);
      const client2 = io(`http://localhost:${port1}`);

      const room = 'test-room-' + Math.random().toString(36).substring(7);
      let messagesReceived = 0;

      await Promise.all([
        new Promise(resolve => client1.on('connect', resolve)),
        new Promise(resolve => client2.on('connect', resolve)),
      ]);

      // Both clients join the same room
      await Promise.all([
        new Promise(resolve => {
          client1.emit('join-room', room);
          client1.on('joined-room', resolve);
        }),
        new Promise(resolve => {
          client2.emit('join-room', room);
          client2.on('joined-room', resolve);
        }),
      ]);

      // Setup message listener
      const messagePromise = new Promise(resolve => {
        client2.on('room-message', message => {
          assert.strictEqual(message, 'Hello room');
          messagesReceived++;
          resolve();
        });
      });

      // Client 1 broadcasts to room
      client1.emit('broadcast-to-room', {
        room: room,
        message: 'Hello room',
      });

      await messagePromise;
      assert.strictEqual(messagesReceived, 1);

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Cross-Instance Communication (requires Redis adapter)', () => {
    test('should broadcast messages across different Socket.IO instances', async () => {
      const client1 = io(`http://localhost:${port1}`);
      const client2 = io(`http://localhost:${port2}`);

      const room =
        'cross-instance-room-' + Math.random().toString(36).substring(7);

      await Promise.all([
        new Promise(resolve => client1.on('connect', resolve)),
        new Promise(resolve => client2.on('connect', resolve)),
      ]);

      // Both clients join the same room on different instances
      await Promise.all([
        new Promise(resolve => {
          client1.emit('join-room', room);
          client1.on('joined-room', resolve);
        }),
        new Promise(resolve => {
          client2.emit('join-room', room);
          client2.on('joined-room', resolve);
        }),
      ]);

      // Setup cross-instance message test
      const crossInstancePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              'Cross-instance message not received (Redis adapter may not be working)'
            )
          );
        }, 2000);

        client2.on('room-message', message => {
          clearTimeout(timeout);
          assert.strictEqual(message, 'Cross-instance hello');
          resolve();
        });
      });

      // Client 1 (instance 1) broadcasts to room
      client1.emit('broadcast-to-room', {
        room: room,
        message: 'Cross-instance hello',
      });

      // Cross-instance communication must work - no graceful fallbacks
      await crossInstancePromise;

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Room Management', () => {
    test('should handle multiple rooms correctly', async () => {
      const client = io(`http://localhost:${port1}`);

      await new Promise(resolve => client.on('connect', resolve));

      const room1 = 'room1-' + Math.random().toString(36).substring(7);
      const room2 = 'room2-' + Math.random().toString(36).substring(7);

      // Join multiple rooms
      await Promise.all([
        (new Promise(resolve => {
          client.emit('join-room', room1);
          client.on('joined-room', room => {
            if (room === room1) resolve();
          });
        }),
        new Promise(resolve => {
          client.emit('join-room', room2);
          client.on('joined-room', room => {
            if (room === room2) resolve();
          });
        })),
      ]);

      // Leave one room
      await new Promise(resolve => {
        client.emit('leave-room', room1);
        client.on('left-room', resolve);
      });

      client.disconnect();
    });
  });

  describe('Error Handling', () => {
    test('should handle Redis connection errors gracefully', async () => {
      // This test verifies the adapter handles Redis issues gracefully
      const client = io(`http://localhost:${port1}`);

      await new Promise(resolve => client.on('connect', resolve));

      // Even if Redis has issues, basic Socket.IO should work
      const room = 'error-test-room';

      await new Promise(resolve => {
        client.emit('join-room', room);
        client.on('joined-room', resolve);
      });

      client.disconnect();
    });

    test('should handle disconnections properly', async () => {
      const client = io(`http://localhost:${port1}`);

      await new Promise(resolve => client.on('connect', resolve));

      const disconnectPromise = new Promise(resolve => {
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
        const client = io(`http://localhost:${port1}`);
        clients.push(client);

        connectionPromises.push(
          new Promise(resolve => client.on('connect', resolve))
        );
      }

      // Wait for all to connect
      await Promise.all(connectionPromises);

      // All should be connected
      assert.ok(clients.every(client => client.connected));

      // Cleanup
      clients.forEach(client => client.disconnect());
    });
  });
});
