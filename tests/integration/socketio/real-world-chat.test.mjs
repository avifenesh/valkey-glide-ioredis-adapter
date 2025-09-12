/**
 * Real-World Socket.IO Test Application
 *
 * Tests actual production patterns:
 * - 2 Socket.IO servers (typical scaling)
 * - 2 Valkey connections total (pub/sub pattern)
 * - Real chat functionality (rooms, messages, users)
 * - Long-lived connections (not rapid create/destroy)
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
const ioOpts = {
  transports: ['websocket'],
  reconnection: false,
  forceNew: true,
  timeout: 2000,
};
const mk = url => io(url, ioOpts);
import { createServer } from 'http';
import {
  describeForEachMode,
  createClient,
  keyTag,
  flushAll,
} from '../../setup/dual-mode.mjs';
import { getStandaloneConfig } from '../../utils/test-config.mjs';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
describe('Real-World Socket.IO Application', () => {
  // Production pattern pub/sub clients for each Socket.IO server
  let valkeyPubClient1;
  let valkeySubClient1;
  let valkeyPubClient2;
  let valkeySubClient2;

  // 2 Socket.IO servers (typical scaling scenario)
  let chatServer1;
  let chatServer2;
  let io1;
  let io2;
  let port1;
  let port2;

  before(async () => {
    // Get available ports
    const net = await import('net');

    const tempServer1 = net.createServer();
    await new Promise(resolve => {
      tempServer1.listen(0, () => {
        port1 = tempServer1.address()?.port || 0;
        tempServer1.close(() => resolve(undefined));
      });
    });

    const tempServer2 = net.createServer();
    await new Promise(resolve => {
      tempServer2.listen(0, () => {
        port2 = tempServer2.address()?.port || 0;
        tempServer2.close(() => resolve(undefined));
      });
    });

    // PRODUCTION PATTERN Redis clients for each Socket.IO server
    const tag = keyTag('chat');
    const clientOptions = {
      keyPrefix: `${tag}:CHAT:`,
      connectTimeout: 10000,
      enableEventBasedPubSub: true,
    };

    valkeyPubClient1 = await createClient('standalone', clientOptions);
    valkeySubClient1 = valkeyPubClient1.duplicate();
    valkeyPubClient2 = await createClient('standalone', clientOptions);
    valkeySubClient2 = valkeyPubClient2.duplicate();

    // Like real ioredis, connections are lazy - no explicit connect() needed

    // Add debug logging to real ioredis for comparison
    valkeyPubClient1.on('connect', () => {});
    valkeySubClient1.on('connect', () => {});
    valkeyPubClient2.on('connect', () => {});
    valkeySubClient2.on('connect', () => {});

    // Monitor subscribe/publish calls on real ioredis
    const originalSubscribe1 =
      valkeySubClient1.subscribe.bind(valkeySubClient1);
    const originalSubscribe2 =
      valkeySubClient2.subscribe.bind(valkeySubClient2);
    const originalPublish1 = valkeyPubClient1.publish.bind(valkeyPubClient1);
    const originalPublish2 = valkeyPubClient2.publish.bind(valkeyPubClient2);

    valkeySubClient1.subscribe = (...args) => originalSubscribe1(...args);

    valkeySubClient2.subscribe = (...args) => originalSubscribe2(...args);

    valkeyPubClient1.publish = (channel, message) =>
      originalPublish1(channel, message);

    valkeyPubClient2.publish = (channel, message) =>
      originalPublish2(channel, message);

    // Create HTTP servers
    chatServer1 = createServer();
    chatServer2 = createServer();

    // Create Socket.IO instances with real chat functionality
    io1 = new Server(chatServer1, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    io2 = new Server(chatServer2, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    // Setup Redis adapters with separate clients for each server
    const adapter1 = createAdapter(valkeyPubClient1, valkeySubClient1);
    const adapter2 = createAdapter(valkeyPubClient2, valkeySubClient2);

    io1.adapter(adapter1);
    io2.adapter(adapter2);

    // Implement real chat server logic
    [io1, io2].forEach((io, _serverIndex) => {
      io.on('connection', socket => {
        // Join a room with username
        socket.on('join-room', (room, username) => {
          try {
            socket.data = socket.data || {};
            if (username) socket.data.username = username;
            socket.join(room);
            // Notify other users in the room that a user joined (exclude self)
            socket.to(room).emit('user-joined', {
              room,
              username: socket.data.username || 'Anonymous',
            });
          } catch {}
        });

        // Broadcast chat messages to the room as 'new-message'
        socket.on('chat-message', ({ message }) => {
          try {
            const username = socket.data?.username || 'Anonymous';
            // Emit to all rooms the socket is part of (excluding its own id)
            const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
            for (const room of rooms) {
              io.to(room).emit('new-message', {
                message,
                username,
                room,
              });
            }
          } catch {}
        });

        socket.on('disconnecting', () => {
          try {
            const username = socket.data?.username || 'Anonymous';
            const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
            for (const room of rooms) {
              socket.to(room).emit('user-left', { room, username });
            }
          } catch {}
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
    await delay(200);
  });

  after(async () => {
    // Close Socket.IO servers
    if (io1) await new Promise(resolve => io1.close(() => resolve()));
    if (io2) await new Promise(resolve => io2.close(() => resolve()));

    // Close HTTP servers
    if (chatServer1)
      await new Promise(resolve => chatServer1.close(() => resolve()));
    if (chatServer2)
      await new Promise(resolve => chatServer2.close(() => resolve()));

    // Clean up chat data via cluster-safe FLUSHALL
    try {
      await flushAll(valkeyPubClient1);
    } catch {}

    // Close Redis connections
    await valkeyPubClient1.disconnect();
    await valkeySubClient1.disconnect();
    await valkeyPubClient2.disconnect();
    await valkeySubClient2.disconnect();
  });

  test('Real chat can join rooms and exchange messages', async () => {
    // Connect users to different servers (real production scenario)
    const alice = mk(`http://localhost:${port1}`);
    const bob = mk(`http://localhost:${port2}`); // Different server

    let aliceMessages = [];
    let bobMessages = [];

    // Setup message listeners
    alice.on('new-message', msg => aliceMessages.push(msg));
    bob.on('new-message', msg => bobMessages.push(msg));

    // Wait for connections
    await Promise.all([
      new Promise(resolve => alice.on('connect', () => resolve())),
      new Promise(resolve => bob.on('connect', () => resolve())),
    ]);

    // Both users join the same room
    alice.emit('join-room', 'general', 'Alice');
    bob.emit('join-room', 'general', 'Bob');

    // Wait for room joins
    await delay(100);

    // Alice sends a message
    alice.emit('chat-message', { message: 'Hello everyone' });

    // Wait for cross-server message propagation
    await delay(200);

    // Bob should receive Alice's message (cross-server communication)
    assert.strictEqual(bobMessages.length, 1);
    assert.strictEqual(bobMessages[0].message, 'Hello everyone');
    assert.strictEqual(bobMessages[0].username, 'Alice');
    assert.strictEqual(bobMessages[0].room, 'general');

    // Bob replies
    bob.emit('chat-message', { message: 'Hi Alice Nice to meet you.' });

    await delay(200);

    // Alice should receive Bob's message
    assert.strictEqual(aliceMessages.length, 2); // Alice's own message + Bob's reply
    const bobsMessage = aliceMessages.find(msg => msg.username === 'Bob');
    assert.strictEqual(bobsMessage.message, 'Hi Alice Nice to meet you.');

    alice.disconnect();
    bob.disconnect();
  });

  test('Real chat isolation works correctly', async () => {
    const user1 = mk(`http://localhost:${port1}`);
    const user2 = mk(`http://localhost:${port2}`);
    const user3 = mk(`http://localhost:${port1}`);

    let user1Messages = [];
    let user2Messages = [];
    let user3Messages = [];

    user1.on('new-message', msg => user1Messages.push(msg));
    user2.on('new-message', msg => user2Messages.push(msg));
    user3.on('new-message', msg => user3Messages.push(msg));

    await Promise.all([
      new Promise(resolve => user1.on('connect', () => resolve())),
      new Promise(resolve => user2.on('connect', () => resolve())),
      new Promise(resolve => user3.on('connect', () => resolve())),
    ]);

    // User1 and User2 join 'dev-team'
    user1.emit('join-room', 'dev-team', 'Developer1');
    user2.emit('join-room', 'dev-team', 'Developer2');

    // User3 joins 'marketing-team'
    user3.emit('join-room', 'marketing-team', 'Marketer1');

    await delay(100);

    // Developer1 sends message to dev-team
    user1.emit('chat-message', { message: 'Sprint planning at 3 PM' });

    await delay(200);

    // Developer2 should receive the message
    assert.strictEqual(user2Messages.length, 1);
    assert.strictEqual(user2Messages[0].message, 'Sprint planning at 3 PM');

    // Marketer1 should NOT receive the message (different room)
    assert.strictEqual(user3Messages.length, 0);

    // Marketer1 sends message to marketing-team
    user3.emit('chat-message', { message: 'Campaign launch tomorrow' });

    await delay(200);

    // Marketing message should not reach dev team
    assert.strictEqual(user1Messages.length, 1); // Only their own message
    assert.strictEqual(user2Messages.length, 1); // Only dev team message

    user1.disconnect();
    user2.disconnect();
    user3.disconnect();
  });

  test('Real chat user connections and disconnections', async () => {
    const user1 = mk(`http://localhost:${port1}`);
    const user2 = mk(`http://localhost:${port2}`);

    let user1Events = [];
    let user2Events = [];

    user1.on('user-joined', event =>
      user1Events.push({ type: 'joined', ...event })
    );
    user1.on('user-left', event =>
      user1Events.push({ type: 'left', ...event })
    );

    user2.on('user-joined', event =>
      user2Events.push({ type: 'joined', ...event })
    );
    user2.on('user-left', event =>
      user2Events.push({ type: 'left', ...event })
    );

    await Promise.all([
      new Promise(resolve => user1.on('connect', () => resolve())),
      new Promise(resolve => user2.on('connect', () => resolve())),
    ]);

    // User1 joins first
    user1.emit('join-room', 'lobby', 'FirstUser');
    await delay(100);

    // User2 joins (should trigger join event for User1)
    const joinedSeen = new Promise(resolve => {
      const t = setTimeout(() => resolve('timeout'), 1000);
      t && typeof t.unref === 'function' && t.unref();
      user1.once('user-joined', e => {
        if (e.username === 'SecondUser' && e.room === 'lobby') {
          clearTimeout(t);
          resolve('joined');
        }
      });
    });
    user2.emit('join-room', 'lobby', 'SecondUser');
    await joinedSeen;

    // User1 should see User2 joined
    const joinedEvent = user1Events.find(
      e =>
        e.type === 'joined' && e.username === 'SecondUser' && e.room === 'lobby'
    );
    assert.ok(joinedEvent);

    // User2 leaves
    const leftSeen = new Promise(resolve => {
      const t = setTimeout(() => resolve('timeout'), 1000);
      t && typeof t.unref === 'function' && t.unref();
      user1.once('user-left', e => {
        if (e.username === 'SecondUser' && e.room === 'lobby') {
          clearTimeout(t);
          resolve('left');
        }
      });
    });
    user2.disconnect();
    await leftSeen;

    // User1 should see User2 left
    const leftEvent = user1Events.find(
      e =>
        e.type === 'left' && e.username === 'SecondUser' && e.room === 'lobby'
    );
    assert.ok(leftEvent);

    user1.disconnect();
  });

  test('Real chat with 20 concurrent users', async () => {
    // Create 20 users distributed across both servers (realistic busy chat room)
    const users = [];
    for (let i = 0; i < 20; i++) {
      // Distribute users across servers (load balancing pattern)
      const serverPort = i % 2 === 0 ? port1 : port2;
      users.push(mk(`http://localhost:${serverPort}`));
    }

    const messagePromises = users.map((client, index) => {
      return new Promise(resolve => {
        const messages = [];
        client.on('new-message', msg => messages.push(msg));
        client.on('connect', () => {
          client.emit('join-room', 'busy-room', `User${index + 1}`);
          // Stagger message collection to avoid overwhelming
          const t = setTimeout(() => resolve(messages), 2000);
          t && typeof t.unref === 'function' && t.unref();
        });
      });
    });

    // Wait for all users to connect and join room
    await delay(500);

    // Each user sends one message (20 messages total)
    users.forEach((client, index) => {
      // Stagger message sending slightly to simulate real usage
      const t = setTimeout(() => {
        client.emit('chat-message', {
          message: `Hello from User${index + 1}!`,
        });
      }, index * 50);
      t && typeof t.unref === 'function' && t.unref(); // 50ms between each message
    });

    const allMessages = await Promise.all(messagePromises);

    // Each user should receive all 20 messages (including their own)
    allMessages.forEach((userMessages, userIndex) => {
      assert.ok(userMessages.length >= 18); // Allow for slight timing variations
      assert.ok(userMessages.length <= 20);

      // Verify cross-server communication worked
      const messagesFromOtherUsers = userMessages.filter(
        msg => msg.username !== `User${userIndex + 1}`
      );
      assert.ok(messagesFromOtherUsers.length > 15);
    });

    // Cleanup all users
    users.forEach(client => client.disconnect());
  });
});
