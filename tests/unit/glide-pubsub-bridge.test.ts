/**
 * GLIDE Pub/Sub Bridge Test Suite
 * Tests the native GLIDE-based pub/sub implementation using polling pattern
 */

import { GlidePubSubBridge } from '../../src/adapters/GlidePubSubBridge';

describe('GLIDE Pub/Sub Bridge', () => {
  let bridge: GlidePubSubBridge;

  beforeAll(async () => {
    bridge = new GlidePubSubBridge({
      host: 'localhost',
      port: 6379
    });
  });

  afterAll(async () => {
    if (bridge) {
      await bridge.cleanup();
    }
  });

  test('should handle basic pub/sub functionality', async () => {
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener
    bridge.on('message', (channel: string, message: string) => {
      console.log('📨 Bridge received message:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Subscribe to a channel
    console.log('📝 Subscribing to glide-bridge-test...');
    const subscribeResult = await bridge.subscribe('glide-bridge-test');
    console.log('📊 Subscribe result:', subscribeResult);

    // Wait for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish a message
    console.log('📤 Publishing message...');
    const publishResult = await bridge.publish('glide-bridge-test', 'hello glide bridge');
    console.log('📊 Publish result:', publishResult, 'subscribers');

    // Wait for message to be received
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify results
    console.log('📊 Message received:', messageReceived);
    if (messageReceived) {
      console.log('📨 Received channel:', receivedChannel);
      console.log('📨 Received message:', receivedMessage);
      
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('glide-bridge-test');
      expect(receivedMessage).toBe('hello glide bridge');
    } else {
      console.log('⚠️  Message not received - checking bridge status');
      console.log('📊 Bridge status:', bridge.getStatus());
      
      // For now, we expect this to work based on our polling test
      expect(messageReceived).toBe(true);
    }
  });

  test('should handle pattern subscriptions', async () => {
    let patternMessageReceived = false;
    let receivedPattern = '';
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up pattern message listener
    bridge.on('pmessage', (pattern: string, channel: string, message: string) => {
      console.log('📨 Bridge received pattern message:', { pattern, channel, message });
      patternMessageReceived = true;
      receivedPattern = pattern;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Subscribe to a pattern
    console.log('📝 Subscribing to pattern glide.bridge.*...');
    const psubscribeResult = await bridge.psubscribe('glide.bridge.*');
    console.log('📊 Pattern subscribe result:', psubscribeResult);

    // Wait for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish a message to a matching channel
    console.log('📤 Publishing pattern message...');
    const publishResult = await bridge.publish('glide.bridge.news', 'pattern test message');
    console.log('📊 Pattern publish result:', publishResult, 'subscribers');

    // Wait for message to be received
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify results
    console.log('📊 Pattern message received:', patternMessageReceived);
    if (patternMessageReceived) {
      console.log('📨 Received pattern:', receivedPattern);
      console.log('📨 Received channel:', receivedChannel);
      console.log('📨 Received message:', receivedMessage);
      
      expect(patternMessageReceived).toBe(true);
      expect(receivedPattern).toBe('glide.bridge.*');
      expect(receivedChannel).toBe('glide.bridge.news');
      expect(receivedMessage).toBe('pattern test message');
    } else {
      console.log('⚠️  Pattern message not received - checking bridge status');
      console.log('📊 Bridge status:', bridge.getStatus());
      
      // For now, we expect this to work based on our polling test
      expect(patternMessageReceived).toBe(true);
    }
  });

  test('should handle subscription events', async () => {
    let subscribeEventReceived = false;
    let psubscribeEventReceived = false;

    // Set up subscription event listeners
    bridge.on('subscribe', (channel: string, count: number) => {
      console.log('📨 Subscribe event:', { channel, count });
      if (channel === 'glide-bridge-events') {
        subscribeEventReceived = true;
      }
    });

    bridge.on('psubscribe', (pattern: string, count: number) => {
      console.log('📨 Pattern subscribe event:', { pattern, count });
      if (pattern === 'glide.events.*') {
        psubscribeEventReceived = true;
      }
    });

    // Subscribe to channel and pattern
    await bridge.subscribe('glide-bridge-events');
    await bridge.psubscribe('glide.events.*');

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify subscription events were emitted
    expect(subscribeEventReceived).toBe(true);
    expect(psubscribeEventReceived).toBe(true);
  });

  test('should provide accurate status information', async () => {
    // Subscribe to some channels and patterns
    await bridge.subscribe('status-test-1', 'status-test-2');
    await bridge.psubscribe('status.pattern.*', 'status.other.*');

    // Check status
    const status = bridge.getStatus();
    console.log('📊 Bridge status:', status);

    expect(status.subscribedChannels).toContain('status-test-1');
    expect(status.subscribedChannels).toContain('status-test-2');
    expect(status.subscribedPatterns).toContain('status.pattern.*');
    expect(status.subscribedPatterns).toContain('status.other.*');
    expect(status.pollingActive).toBe(true);
    expect(status.hasSubscribeClient).toBe(true);
    expect(status.hasPublishClient).toBe(true);
  });

  test('should handle unsubscribe operations', async () => {
    let unsubscribeEventReceived = false;
    let punsubscribeEventReceived = false;

    // Set up unsubscribe event listeners
    bridge.on('unsubscribe', (channel: string, count: number) => {
      console.log('📨 Unsubscribe event:', { channel, count });
      if (channel === 'unsubscribe-test') {
        unsubscribeEventReceived = true;
      }
    });

    bridge.on('punsubscribe', (pattern: string, count: number) => {
      console.log('📨 Pattern unsubscribe event:', { pattern, count });
      if (pattern === 'unsubscribe.pattern.*') {
        punsubscribeEventReceived = true;
      }
    });

    // Subscribe first
    await bridge.subscribe('unsubscribe-test');
    await bridge.psubscribe('unsubscribe.pattern.*');

    // Then unsubscribe
    await bridge.unsubscribe('unsubscribe-test');
    await bridge.punsubscribe('unsubscribe.pattern.*');

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify unsubscribe events were emitted
    expect(unsubscribeEventReceived).toBe(true);
    expect(punsubscribeEventReceived).toBe(true);
  });
});
