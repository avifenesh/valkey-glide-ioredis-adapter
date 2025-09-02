/**
 * Real-World Socket.IO Test: Chat Application
 *
 * Tests actual production patterns:
 * - 2 Socket.IO servers (typical scaling)
 * - 2 Valkey connections total (pub/sub pattern)
 * - Real chat functionality (rooms, messages, users)
 * - Long-lived connections (not rapid create/destroy)
 */

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io as Client } from 'socket.io-client';
import { createServer } from 'http';
import { Redis } from '../../../src';
import { testUtils } from '../../setup';

describe('Real-World Socket.IO: Chat Application', () => {
  // Production pattern: Separate pub/sub clients for each Socket.IO server
  let valkeyPubClient1: Redis;
  let valkeySubClient1: Redis;
  let valkeyPubClient2: Redis;
  let valkeySubClient2: Redis;

  // 2 Socket.IO servers (typical scaling scenario)
  let chatServer1: any;
  let chatServer2: any;
  let io1: SocketIOServer;
  let io2: SocketIOServer;
  let port1: number;
  let port2: number;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available for Socket.IO chat tests');
    }

    // Get available ports
    const net = await import('net');

    const tempServer1 = net.createServer();
    await new Promise<void>(resolve => {
      tempServer1.listen(0, () => {
        port1 = (tempServer1.address() as any)?.port || 0;
        tempServer1.close(() => resolve());
      });
    });

    const tempServer2 = net.createServer();
    await new Promise<void>(resolve => {
      tempServer2.listen(0, () => {
        port2 = (tempServer2.address() as any)?.port || 0;
        tempServer2.close(() => resolve());
      });
    });

    // PRODUCTION PATTERN: Separate Redis clients for each Socket.IO server
    const config = await testUtils.getStandaloneConfig();

    // Add connection timeout to match ioredis default behavior
    const clientConfig = {
      ...config,
      keyPrefix: 'CHAT:',
      connectTimeout: 10000, // 10 seconds - ioredis default
    };

    // Server 1 clients
    valkeyPubClient1 = new Redis(clientConfig);
    valkeySubClient1 = new Redis(clientConfig);

    // Server 2 clients
    valkeyPubClient2 = new Redis(clientConfig);
    valkeySubClient2 = new Redis(clientConfig);

    // Like real ioredis, connections are lazy - no explicit connect() needed

    // Add debug logging to real ioredis for comparison
    valkeyPubClient1.on('connect', () =>
      console.log('Real ioredis PubClient1 connected')
    );
    valkeySubClient1.on('connect', () =>
      console.log('Real ioredis SubClient1 connected')
    );
    valkeyPubClient2.on('connect', () =>
      console.log('Real ioredis PubClient2 connected')
    );
    valkeySubClient2.on('connect', () =>
      console.log('Real ioredis SubClient2 connected')
    );

    // Monitor subscribe/publish calls on real ioredis
    const originalSubscribe1 =
      valkeySubClient1.subscribe.bind(valkeySubClient1);
    const originalSubscribe2 =
      valkeySubClient2.subscribe.bind(valkeySubClient2);
    const originalPublish1 = valkeyPubClient1.publish.bind(valkeyPubClient1);
    const originalPublish2 = valkeyPubClient2.publish.bind(valkeyPubClient2);

    valkeySubClient1.subscribe = (...args: any[]) => {
      console.log('Real ioredis SubClient1.subscribe called with:', args);
      return originalSubscribe1(...args);
    };

    valkeySubClient2.subscribe = (...args: any[]) => {
      console.log('Real ioredis SubClient2.subscribe called with:', args);
      return originalSubscribe2(...args);
    };

    valkeyPubClient1.publish = (channel: any, message: any) => {
      console.log('Real ioredis PubClient1.publish called with:', [
        channel,
        message,
      ]);
      return originalPublish1(channel, message);
    };

    valkeyPubClient2.publish = (channel: any, message: any) => {
      console.log('Real ioredis PubClient2.publish called with:', [
        channel,
        message,
      ]);
      return originalPublish2(channel, message);
    };

    // Create HTTP servers
    chatServer1 = createServer();
    chatServer2 = createServer();

    // Create Socket.IO instances with real chat functionality
    io1 = new SocketIOServer(chatServer1, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    io2 = new SocketIOServer(chatServer2, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    // Setup Redis adapters with separate clients for each server
    const adapter1 = createAdapter(
      valkeyPubClient1 as any,
      valkeySubClient1 as any
    );
    const adapter2 = createAdapter(
      valkeyPubClient2 as any,
      valkeySubClient2 as any
    );

    io1.adapter(adapter1);
    io2.adapter(adapter2);

    // Implement real chat server logic
    [io1, io2].forEach((io, serverIndex) => {
      io.on('connection', socket => {
        console.log(
          `User connected to server ${serverIndex + 1}: ${socket.id}`
        );

        // Join a chat room
        socket.on('join-room', (roomName, username) => {
          socket.join(roomName);
          socket.data.username = username;
          socket.data.room = roomName;

          // Notify room about new user
          socket.to(roomName).emit('user-joined', {
            username,
            message: `${username} joined the chat`,
            timestamp: Date.now(),
          });

          socket.emit('joined-room', {
            room: roomName,
            message: `Welcome to ${roomName}!`,
          });
        });

        // Handle chat messages
        socket.on('chat-message', data => {
          const message = {
            id: Math.random().toString(36).substr(2, 9),
            username: socket.data.username,
            message: data.message,
            room: socket.data.room,
            timestamp: Date.now(),
            server: serverIndex + 1,
          };

          // Broadcast to all users in the room (across all servers)
          io.to(socket.data.room).emit('new-message', message);
        });

        // Handle private messages
        socket.on('private-message', data => {
          const privateMsg = {
            from: socket.data.username,
            message: data.message,
            timestamp: Date.now(),
            server: serverIndex + 1,
          };

          // Send to specific user across all servers
          io.emit('private-message', privateMsg, data.targetUser);
        });

        socket.on('disconnect', () => {
          if (socket.data.room && socket.data.username) {
            socket.to(socket.data.room).emit('user-left', {
              username: socket.data.username,
              message: `${socket.data.username} left the chat`,
              timestamp: Date.now(),
            });
          }
        });
      });
    });

    // Start servers
    await new Promise<void>(resolve => {
      chatServer1.listen(port1, () => {
        chatServer2.listen(port2, resolve);
      });
    });

    // Small delay to ensure everything is ready
    await testUtils.delay(200);
  });

  afterAll(async () => {
    // Close Socket.IO servers
    if (io1) io1.close();
    if (io2) io2.close();

    // Close HTTP servers
    if (chatServer1) chatServer1.close();
    if (chatServer2) chatServer2.close();

    // Clean up chat data
    try {
      const keys = await valkeyPubClient1.keys('CHAT:*');
      if (keys.length > 0) {
        await valkeyPubClient1.del(...keys);
      }
    } catch {
      // Ignore cleanup errors
    }

    // Close Redis connections
    await valkeyPubClient1.disconnect();
    await valkeySubClient1.disconnect();
    await valkeyPubClient2.disconnect();
    await valkeySubClient2.disconnect();
  });

  test('Real chat: Users can join rooms and exchange messages', async () => {
    // Connect users to different servers (real production scenario)
    const alice = Client(`http://localhost:${port1}`);
    const bob = Client(`http://localhost:${port2}`); // Different server!

    let aliceMessages: any[] = [];
    let bobMessages: any[] = [];

    // Setup message listeners
    alice.on('new-message', msg => aliceMessages.push(msg));
    bob.on('new-message', msg => bobMessages.push(msg));

    // Wait for connections
    await Promise.all([
      new Promise<void>(resolve => alice.on('connect', () => resolve())),
      new Promise<void>(resolve => bob.on('connect', () => resolve())),
    ]);

    // Both users join the same room
    alice.emit('join-room', 'general', 'Alice');
    bob.emit('join-room', 'general', 'Bob');

    // Wait for room joins
    await testUtils.delay(100);

    // Alice sends a message
    alice.emit('chat-message', { message: 'Hello everyone!' });

    // Wait for cross-server message propagation
    await testUtils.delay(200);

    // Bob should receive Alice's message (cross-server communication)
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].message).toBe('Hello everyone!');
    expect(bobMessages[0].username).toBe('Alice');
    expect(bobMessages[0].room).toBe('general');

    // Bob replies
    bob.emit('chat-message', { message: 'Hi Alice! Nice to meet you.' });

    await testUtils.delay(200);

    // Alice should receive Bob's message
    expect(aliceMessages).toHaveLength(2); // Alice's own message + Bob's reply
    const bobsMessage = aliceMessages.find(msg => msg.username === 'Bob');
    expect(bobsMessage.message).toBe('Hi Alice! Nice to meet you.');

    alice.disconnect();
    bob.disconnect();
  });

  test('Real chat: Room isolation works correctly', async () => {
    const user1 = Client(`http://localhost:${port1}`);
    const user2 = Client(`http://localhost:${port2}`);
    const user3 = Client(`http://localhost:${port1}`);

    let user1Messages: any[] = [];
    let user2Messages: any[] = [];
    let user3Messages: any[] = [];

    user1.on('new-message', msg => user1Messages.push(msg));
    user2.on('new-message', msg => user2Messages.push(msg));
    user3.on('new-message', msg => user3Messages.push(msg));

    await Promise.all([
      new Promise<void>(resolve => user1.on('connect', () => resolve())),
      new Promise<void>(resolve => user2.on('connect', () => resolve())),
      new Promise<void>(resolve => user3.on('connect', () => resolve())),
    ]);

    // User1 and User2 join 'dev-team'
    user1.emit('join-room', 'dev-team', 'Developer1');
    user2.emit('join-room', 'dev-team', 'Developer2');

    // User3 joins 'marketing-team'
    user3.emit('join-room', 'marketing-team', 'Marketer1');

    await testUtils.delay(100);

    // Developer1 sends message to dev-team
    user1.emit('chat-message', { message: 'Sprint planning at 3 PM' });

    await testUtils.delay(200);

    // Developer2 should receive the message
    expect(user2Messages).toHaveLength(1);
    expect(user2Messages[0].message).toBe('Sprint planning at 3 PM');

    // Marketer1 should NOT receive the message (different room)
    expect(user3Messages).toHaveLength(0);

    // Marketer1 sends message to marketing-team
    user3.emit('chat-message', { message: 'Campaign launch tomorrow' });

    await testUtils.delay(200);

    // Marketing message should not reach dev team
    expect(user1Messages).toHaveLength(1); // Only their own message
    expect(user2Messages).toHaveLength(1); // Only dev team message

    user1.disconnect();
    user2.disconnect();
    user3.disconnect();
  });

  test('Real chat: Handle user connections and disconnections', async () => {
    const user1 = Client(`http://localhost:${port1}`);
    const user2 = Client(`http://localhost:${port2}`);

    let user1Events: any[] = [];
    let user2Events: any[] = [];

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
      new Promise<void>(resolve => user1.on('connect', () => resolve())),
      new Promise<void>(resolve => user2.on('connect', () => resolve())),
    ]);

    // User1 joins first
    user1.emit('join-room', 'lobby', 'FirstUser');
    await testUtils.delay(100);

    // User2 joins (should trigger join event for User1)
    user2.emit('join-room', 'lobby', 'SecondUser');
    await testUtils.delay(200);

    // User1 should see User2 joined
    expect(user1Events).toHaveLength(1);
    expect(user1Events[0].type).toBe('joined');
    expect(user1Events[0].username).toBe('SecondUser');

    // User2 leaves
    user2.disconnect();
    await testUtils.delay(300);

    // User1 should see User2 left
    expect(user1Events).toHaveLength(2);
    expect(user1Events[1].type).toBe('left');
    expect(user1Events[1].username).toBe('SecondUser');

    user1.disconnect();
  });

  test('Real chat: Performance with 20 concurrent users', async () => {
    // Create 20 users distributed across both servers (realistic busy chat room)
    const users: any[] = [];
    for (let i = 0; i < 20; i++) {
      // Distribute users across servers (load balancing pattern)
      const serverPort = i % 2 === 0 ? port1 : port2;
      users.push(Client(`http://localhost:${serverPort}`));
    }

    const messagePromises = users.map((client, index) => {
      return new Promise<any[]>(resolve => {
        const messages: any[] = [];
        client.on('new-message', (msg: any) => messages.push(msg));
        client.on('connect', () => {
          client.emit('join-room', 'busy-room', `User${index + 1}`);
          // Stagger message collection to avoid overwhelming
          setTimeout(() => resolve(messages), 2000);
        });
      });
    });

    // Wait for all users to connect and join room
    await testUtils.delay(500);

    // Each user sends one message (20 messages total)
    users.forEach((client, index) => {
      // Stagger message sending slightly to simulate real usage
      setTimeout(() => {
        client.emit('chat-message', {
          message: `Hello from User${index + 1}!`,
        });
      }, index * 50); // 50ms between each message
    });

    const allMessages = await Promise.all(messagePromises);

    // Each user should receive all 20 messages (including their own)
    allMessages.forEach((userMessages, userIndex) => {
      expect(userMessages.length).toBeGreaterThanOrEqual(18); // Allow for slight timing variations
      expect(userMessages.length).toBeLessThanOrEqual(20);

      // Verify cross-server communication worked
      const messagesFromOtherUsers = userMessages.filter(
        msg => msg.username !== `User${userIndex + 1}`
      );
      expect(messagesFromOtherUsers.length).toBeGreaterThan(15);
    });

    // Cleanup all users
    users.forEach(client => client.disconnect());
  });
});
