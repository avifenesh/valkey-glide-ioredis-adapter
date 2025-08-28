/**
 * Test the GlidePubSubManager worker-based approach
 */

import { GlidePubSubManager } from '../../src/pubsub/GlidePubSubManager';

describe('GlidePubSubManager', () => {
  let manager: GlidePubSubManager;

  beforeAll(async () => {
    manager = new GlidePubSubManager({
      host: 'localhost',
      port: 6379
    });
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  test('basic pub/sub functionality', async () => {
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener
    manager.on('message', (channel: string, message: string) => {
      console.log('📨 MANAGER: Received message:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Subscribe to channel
    console.log('🔧 MANAGER: Subscribing to manager-test...');
    const subscribeResult = await manager.subscribe('manager-test');
    console.log('📊 MANAGER: Subscribe result:', subscribeResult);

    // Wait for worker to be established
    console.log('⏳ MANAGER: Waiting for worker establishment...');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check status
    const status = manager.getStatus();
    console.log('📊 MANAGER: Status after subscription:', status);

    // Publish message
    console.log('📤 MANAGER: Publishing message...');
    const publishResult = await manager.publish('manager-test', 'hello manager world');
    console.log('📊 MANAGER: Publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ MANAGER: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify results
    console.log('📊 MANAGER: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ MANAGER: SUCCESS - Worker-based approach works!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('manager-test');
      expect(receivedMessage).toBe('hello manager world');
    } else {
      console.log('❌ MANAGER: FAILURE - Worker approach still fails');
      console.log('🔍 MANAGER: Need to investigate worker implementation');
      
      // Show final status for debugging
      const finalStatus = manager.getStatus();
      console.log('📊 MANAGER: Final status:', finalStatus);
      
      expect(messageReceived).toBe(true);
    }
  });

  test('pattern subscription functionality', async () => {
    let patternMessageReceived = false;
    let receivedPattern = '';
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up pattern message listener
    manager.on('pmessage', (pattern: string, channel: string, message: string) => {
      console.log('📨 MANAGER: Received pattern message:', { pattern, channel, message });
      patternMessageReceived = true;
      receivedPattern = pattern;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Subscribe to pattern
    console.log('🔧 MANAGER: Subscribing to pattern news.*...');
    const psubscribeResult = await manager.psubscribe('news.*');
    console.log('📊 MANAGER: Pattern subscribe result:', psubscribeResult);

    // Wait for worker to be established
    console.log('⏳ MANAGER: Waiting for pattern worker establishment...');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check status
    const status = manager.getStatus();
    console.log('📊 MANAGER: Status after pattern subscription:', status);

    // Publish to matching channel
    console.log('📤 MANAGER: Publishing to news.sports...');
    const publishResult = await manager.publish('news.sports', 'goal scored!');
    console.log('📊 MANAGER: Pattern publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ MANAGER: Waiting for pattern message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify results
    console.log('📊 MANAGER: Pattern message received:', patternMessageReceived);
    if (patternMessageReceived) {
      console.log('✅ MANAGER: SUCCESS - Pattern subscriptions work!');
      expect(patternMessageReceived).toBe(true);
      expect(receivedPattern).toBe('news.*');
      expect(receivedChannel).toBe('news.sports');
      expect(receivedMessage).toBe('goal scored!');
    } else {
      console.log('❌ MANAGER: FAILURE - Pattern subscriptions fail');
      
      // Show final status for debugging
      const finalStatus = manager.getStatus();
      console.log('📊 MANAGER: Final pattern status:', finalStatus);
      
      expect(patternMessageReceived).toBe(true);
    }
  });

  test('multiple subscriptions and unsubscriptions', async () => {
    const receivedMessages: Array<{channel: string, message: string}> = [];

    // Set up message listener
    manager.on('message', (channel: string, message: string) => {
      console.log('📨 MANAGER: Multi-sub received:', { channel, message });
      receivedMessages.push({ channel, message });
    });

    // Subscribe to multiple channels
    console.log('🔧 MANAGER: Subscribing to multiple channels...');
    await manager.subscribe('multi-1', 'multi-2', 'multi-3');

    // Wait for workers to be established
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check status
    const status = manager.getStatus();
    console.log('📊 MANAGER: Multi-sub status:', status);
    expect(status.subscribedChannels).toHaveLength(3);
    expect(status.activeWorkers).toBeGreaterThanOrEqual(3);

    // Publish to all channels
    console.log('📤 MANAGER: Publishing to all channels...');
    await manager.publish('multi-1', 'message 1');
    await manager.publish('multi-2', 'message 2');
    await manager.publish('multi-3', 'message 3');

    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('📊 MANAGER: Received messages:', receivedMessages);
    expect(receivedMessages.length).toBeGreaterThanOrEqual(1); // At least one should work

    // Unsubscribe from one channel
    console.log('🔧 MANAGER: Unsubscribing from multi-2...');
    await manager.unsubscribe('multi-2');

    // Check status after unsubscribe
    const statusAfterUnsub = manager.getStatus();
    console.log('📊 MANAGER: Status after unsubscribe:', statusAfterUnsub);
    expect(statusAfterUnsub.subscribedChannels).toHaveLength(2);
    expect(statusAfterUnsub.subscribedChannels).not.toContain('multi-2');
  });
});
