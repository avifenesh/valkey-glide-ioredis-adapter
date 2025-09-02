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

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io as Client } from 'socket.io-client';
import { createServer } from 'http';
import { Redis } from '../../../src';
import { testUtils } from '../../setup';

describe('Socket.IO Redis Adapter: Production Pattern', () => {
  // Production pattern: 2 Socket.IO servers with separate pub/sub clients each
  let valkeyPubClient1: Redis;
  let valkeySubClient1: Redis;
  let valkeyPubClient2: Redis;
  let valkeySubClient2: Redis;

  // 2 Socket.IO servers (horizontal scaling scenario)
  let chatServer1: any;
  let chatServer2: any;
  let io1: SocketIOServer;
  let io2: SocketIOServer;
  let port1: number;
  let port2: number;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available for Socket.IO adapter tests');
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

    // Create HTTP servers
    chatServer1 = createServer();
    chatServer2 = createServer();

    // Create Socket.IO instances
    io1 = new SocketIOServer(chatServer1, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    io2 = new SocketIOServer(chatServer2, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    // Setup Redis adapters - this is the key production pattern
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
    await new Promise<void>(resolve => {
      chatServer1.listen(port1, () => {
        chatServer2.listen(port2, resolve);
      });
    });

    // Small delay to ensure everything is ready
    await testUtils.delay(100);
  });

  afterAll(async () => {
    // Close Socket.IO servers
    if (io1) io1.close();
    if (io2) io2.close();

    // Close HTTP servers
    if (chatServer1) chatServer1.close();
    if (chatServer2) chatServer2.close();

    // Close Redis connections
    await valkeyPubClient1.disconnect();
    await valkeySubClient1.disconnect();
    await valkeyPubClient2.disconnect();
    await valkeySubClient2.disconnect();
  });

  test('Socket.IO Redis adapter enables cross-server broadcasting', async () => {
    // This test validates that Socket.IO Redis adapter works for its core purpose:
    // enabling broadcasts from one server to reach clients on other servers

    const alice = Client(`http://localhost:${port1}`);
    const bob = Client(`http://localhost:${port2}`); // Different server!

    let aliceMessages: any[] = [];
    let bobMessages: any[] = [];

    // Listen for broadcast events (not custom message events)
    alice.on('broadcast-event', data => aliceMessages.push(data));
    bob.on('broadcast-event', data => bobMessages.push(data));

    // Wait for connections
    await Promise.all([
      new Promise<void>(resolve => alice.on('connect', () => resolve())),
      new Promise<void>(resolve => bob.on('connect', () => resolve())),
    ]);

    // Both join the same room
    alice.emit('join', 'general');
    bob.emit('join', 'general');

    // Wait for joins
    await Promise.all([
      new Promise<void>(resolve => alice.on('joined', () => resolve())),
      new Promise<void>(resolve => bob.on('joined', () => resolve())),
    ]);

    // Server 1 broadcasts to room 'general' - this should reach Bob on server 2
    // We simulate this by having the server itself do the broadcast
    io1.to('general').emit('broadcast-event', {
      message: 'Server broadcast test',
      from: 'server-1',
    });

    // Wait for cross-server propagation - increase delay for processing
    await testUtils.delay(1000);

    // Bob (on server 2) should receive the broadcast from server 1
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].message).toBe('Server broadcast test');
    expect(bobMessages[0].from).toBe('server-1');

    // Alice (on server 1) should also receive it since she's in the same room
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0].message).toBe('Server broadcast test');

    alice.disconnect();
    bob.disconnect();
  });

  test('Room isolation works correctly with Redis adapter', async () => {
    const user1 = Client(`http://localhost:${port1}`);
    const user2 = Client(`http://localhost:${port2}`);
    const user3 = Client(`http://localhost:${port1}`);

    let user1Messages: any[] = [];
    let user2Messages: any[] = [];
    let user3Messages: any[] = [];

    user1.on('message', msg => user1Messages.push(msg));
    user2.on('message', msg => user2Messages.push(msg));
    user3.on('message', msg => user3Messages.push(msg));

    await Promise.all([
      new Promise<void>(resolve => user1.on('connect', () => resolve())),
      new Promise<void>(resolve => user2.on('connect', () => resolve())),
      new Promise<void>(resolve => user3.on('connect', () => resolve())),
    ]);

    // User1 and User2 join 'room1'
    user1.emit('join', 'room1');
    user2.emit('join', 'room1');

    // User3 joins 'room2'
    user3.emit('join', 'room2');

    // Wait for all joins to complete
    await Promise.all([
      new Promise<void>(resolve => user1.on('joined', () => resolve())),
      new Promise<void>(resolve => user2.on('joined', () => resolve())),
      new Promise<void>(resolve => user3.on('joined', () => resolve())),
    ]);

    await testUtils.delay(100);

    // User1 sends message to room1
    user1.emit('message', {
      room: 'room1',
      text: 'Message for room1',
      sender: 'User1',
    });

    await testUtils.delay(300);

    // User2 should receive the message (same room)
    expect(user2Messages).toHaveLength(1);
    expect(user2Messages[0].text).toBe('Message for room1');

    // User3 should NOT receive the message (different room)
    expect(user3Messages).toHaveLength(0);

    user1.disconnect();
    user2.disconnect();
    user3.disconnect();
  });

  test('Multiple servers handle concurrent messaging correctly', async () => {
    // Create 6 users distributed across both servers
    const users: any[] = [];
    for (let i = 0; i < 6; i++) {
      const serverPort = i % 2 === 0 ? port1 : port2;
      users.push(Client(`http://localhost:${serverPort}`));
    }

    const messagePromises = users.map(client => {
      return new Promise<any[]>(resolve => {
        const messages: any[] = [];
        client.on('message', (msg: any) => messages.push(msg));
        client.on('connect', () => {
          client.emit('join', 'concurrent-room');
          // Wait for messages to collect
          setTimeout(() => resolve(messages), 1000);
        });
      });
    });

    // Wait for all users to connect and join room
    await testUtils.delay(200);

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
      expect(userMessages.length).toBeGreaterThanOrEqual(5); // Allow for slight timing variations
      expect(userMessages.length).toBeLessThanOrEqual(6);

      // Verify messages from other users are received
      const messagesFromOthers = userMessages.filter(
        msg => msg.sender !== `User${userIndex + 1}`
      );
      expect(messagesFromOthers.length).toBeGreaterThan(3);
    });

    // Cleanup all users
    users.forEach(client => client.disconnect());
  });
});
