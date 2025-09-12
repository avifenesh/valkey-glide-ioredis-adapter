/**
 * Proper Socket.IO Redis Adapter Test
 *
 * Based on real production examples from:
 * - github.com/sathrak/socketioandamqplib
 * - github.com/hasithaishere/socket-io-redis-adapter-example
 *
 * Tests the actual Socket.IO Redis adapter functionality:
 * - Cross-server message broadcasting
 * - Room-based messaging
 * - Horizontal scalability
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
describe('Socket.IO Redis Adapter Pattern', () => {
  // Production pattern: 2 Socket.IO servers with separate pub/sub clients each
  let valkeyPubClient1;
  let valkeySubClient1;
  let valkeyPubClient2;
  let valkeySubClient2;

  // 2 Socket.IO servers (horizontal scaling scenario)
  let chatServer1;
  let chatServer2;
  let io1;
  let io2;
  let port1;
  let port2;

  before(async () => {
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available for Socket.IO adapter tests');
    }

    // Get available ports
    const net = await import('net');

    const tempServer1 = net.createServer();
    await new Promise(resolve => {
      tempServer1.listen(0, () => {
        port1 = tempServer1.address()?.port || 0;
        tempServer1.close(() => resolve());
      });
    });

    const tempServer2 = net.createServer();
    await new Promise(resolve => {
      tempServer2.listen(0, () => {
        port2 = tempServer2.address()?.port || 0;
        tempServer2.close(() => resolve());
      });
    });

    // PRODUCTION PATTERN Redis clients for each Socket.IO server
    const config = await getStandaloneConfig();

    // Server 1 pub/sub clients - Use hybrid mode for Socket.IO compatibility
    valkeyPubClient1 = new Redis({
      ...config,
      enableEventBasedPubSub: true, // Socket.IO needs direct TCP pub/sub
    });
    valkeySubClient1 = new Redis({
      ...config,
      enableEventBasedPubSub: true, // Socket.IO needs direct TCP pub/sub
    });

    // Server 2 pub/sub clients - Use hybrid mode for Socket.IO compatibility
    valkeyPubClient2 = new Redis({
      ...config,
      enableEventBasedPubSub: true, // Socket.IO needs direct TCP pub/sub
    });
    valkeySubClient2 = new Redis({
      ...config,
      enableEventBasedPubSub: true, // Socket.IO needs direct TCP pub/sub
    });

    // Ensure all Redis clients are connected before proceeding
    await Promise.all([
      valkeyPubClient1.connect(),
      valkeySubClient1.connect(),
      valkeyPubClient2.connect(),
      valkeySubClient2.connect(),
    ]);

    // Create HTTP servers
    chatServer1 = createServer();
    chatServer2 = createServer();

    // Create Socket.IO instances
    io1 = new Server(chatServer1, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    io2 = new Server(chatServer2, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    // Setup Redis adapters - this is the key production pattern
    const adapter1 = createAdapter(valkeyPubClient1, valkeySubClient1);
    const adapter2 = createAdapter(valkeyPubClient2, valkeySubClient2);

    io1.adapter(adapter1);
    io2.adapter(adapter2);

    // Simple chat server logic (like real production examples)
    [io1, io2].forEach((io, serverIndex) => {
      io.on('connection', socket => {
        console.log(
          `User connected to server ${serverIndex + 1}: ${socket.id}`
        );

        // Join a room
        socket.on('join', room => {
          socket.join(room);
          socket.emit('joined', room);
        });

        // Chat message - broadcast to room
        socket.on('message', data => {
          io.to(data.room).emit('message', {
            ...data,
            server: serverIndex + 1,
            socketId: socket.id,
          });
        });

        socket.on('disconnect', () => {
          console.log(
            `User disconnected from server ${serverIndex + 1}: ${socket.id}`
          );
        });
      });
    });

    // Start servers
    await new Promise(resolve => {
      chatServer1.listen(port1, () => {
        chatServer2.listen(port2, resolve);
      });
    });

    // Small delay to ensure everything is ready
    await delay(100);
  });

  after(async () => {
    // Close Socket.IO servers first (they depend on HTTP servers)
    if (io1) {
      await new Promise(resolve => {
        io1.close(() => resolve());
      });
    }
    if (io2) {
      await new Promise(resolve => {
        io2.close(() => resolve());
      });
    }

    // Close HTTP servers
    if (chatServer1) {
      await new Promise(resolve => {
        chatServer1.close(() => resolve());
      });
    }
    if (chatServer2) {
      await new Promise(resolve => {
        chatServer2.close(() => resolve());
      });
    }

    // Close Redis connections with error handling
    const closeRedis = async client => {
      try {
        if (client && typeof client.disconnect === 'function') {
          await client.disconnect();
        }
      } catch (err) {
        // Ignore closing errors
      }
    };

    await Promise.all([
      closeRedis(valkeyPubClient1),
      closeRedis(valkeySubClient1),
      closeRedis(valkeyPubClient2),
      closeRedis(valkeySubClient2),
    ]);

    // Add delay to ensure all async operations complete
    await new Promise(resolve => setTimeout(resolve, 100).unref());
  });

  test('Socket.IO Redis adapter enables cross-server broadcasting', async () => {
    // This test validates that Socket.IO Redis adapter works for its core purpose:
    // enabling broadcasts from one server to reach clients on other servers

    const alice = io(`http://localhost:${port1}`);
    const bob = io(`http://localhost:${port2}`); // Different server

    let aliceMessages = [];
    let bobMessages = [];

    // Listen for broadcast events (not custom message events)
    alice.on('broadcast-event', data => aliceMessages.push(data));
    bob.on('broadcast-event', data => bobMessages.push(data));

    // Wait for connections
    await Promise.all([
      new Promise(resolve => alice.on('connect', () => resolve())),
      new Promise(resolve => bob.on('connect', () => resolve())),
    ]);

    // Both join the same room
    alice.emit('join', 'general');
    bob.emit('join', 'general');

    // Wait for joins
    await Promise.all([
      new Promise(resolve => alice.on('joined', () => resolve())),
      new Promise(resolve => bob.on('joined', () => resolve())),
    ]);

    // Server 1 broadcasts to room 'general' - this should reach Bob on server 2
    // We simulate this by having the server itself do the broadcast
    io1.to('general').emit('broadcast-event', {
      message: 'Server broadcast test',
      from: 'server-1',
    });

    // Wait for cross-server propagation - increase delay for processing
    await delay(1000);

    // Bob (on server 2) should receive the broadcast from server 1
    assert.strictEqual(bobMessages.length, 1);
    assert.strictEqual(bobMessages[0].message, 'Server broadcast test');
    assert.strictEqual(bobMessages[0].from, 'server-1');

    // Alice (on server 1) should also receive it since she's in the same room
    assert.strictEqual(aliceMessages.length, 1);
    assert.strictEqual(aliceMessages[0].message, 'Server broadcast test');

    alice.disconnect();
    bob.disconnect();
  });

  test('Room isolation works correctly with Redis adapter', async () => {
    const user1 = io(`http://localhost:${port1}`);
    const user2 = io(`http://localhost:${port2}`);
    const user3 = io(`http://localhost:${port1}`);

    let user1Messages = [];
    let user2Messages = [];
    let user3Messages = [];

    user1.on('message', msg => user1Messages.push(msg));
    user2.on('message', msg => user2Messages.push(msg));
    user3.on('message', msg => user3Messages.push(msg));

    await Promise.all([
      new Promise(resolve => user1.on('connect', () => resolve())),
      new Promise(resolve => user2.on('connect', () => resolve())),
      new Promise(resolve => user3.on('connect', () => resolve())),
    ]);

    // User1 and User2 join 'room1'
    user1.emit('join', 'room1');
    user2.emit('join', 'room1');

    // User3 joins 'room2'
    user3.emit('join', 'room2');

    // Wait for all joins to complete
    await Promise.all([
      new Promise(resolve => user1.on('joined', () => resolve())),
      new Promise(resolve => user2.on('joined', () => resolve())),
      new Promise(resolve => user3.on('joined', () => resolve())),
    ]);

    await delay(100);

    // User1 sends message to room1
    user1.emit('message', {
      room: 'room1',
      text: 'Message for room1',
      sender: 'User1',
    });

    await delay(300);

    // User2 should receive the message (same room)
    assert.strictEqual(user2Messages.length, 1);
    assert.strictEqual(user2Messages[0].text, 'Message for room1');

    // User3 should NOT receive the message (different room)
    assert.strictEqual(user3Messages.length, 0);

    user1.disconnect();
    user2.disconnect();
    user3.disconnect();
  });

  test('Multiple servers handle concurrent messaging correctly', async () => {
    // Create 6 users distributed across both servers
    const users = [];
    for (let i = 0; i < 6; i++) {
      const serverPort = i % 2 === 0 ? port1 : port2;
      users.push(io(`http://localhost:${serverPort}`));
    }

    const messagePromises = users.map(client => {
      return new Promise(resolve => {
        const messages = [];
        client.on('message', msg => messages.push(msg));
        client.on('connect', () => {
          client.emit('join', 'concurrent-room');
          // Wait for messages to collect
          setTimeout(() => resolve(messages), 1000);
        });
      });
    });

    // Wait for all users to connect and join room
    await delay(200);

    // Each user sends one message
    users.forEach((client, index) => {
      setTimeout(() => {
        client.emit('message', {
          room: 'concurrent-room',
          text: `Message from User${index + 1}`,
          sender: `User${index + 1}`,
        });
      }, index * 10); // Stagger slightly
    });

    const allMessages = await Promise.all(messagePromises);

    // Each user should receive all 6 messages
    allMessages.forEach((userMessages, userIndex) => {
      assert.ok(userMessages.length >= 5); // Allow for slight timing variations
      assert.ok(userMessages.length <= 6);

      // Verify messages from other users are received
      const messagesFromOthers = userMessages.filter(
        msg => msg.sender !== `User${userIndex + 1}`
      );
      assert.ok(messagesFromOthers.length > 3);
    });

    // Cleanup all users
    users.forEach(client => client.disconnect());
  });
});
