/**
 * Debug test to isolate the GLIDE bridge message reception issue
 */

import { GlidePubSubBridge } from '../../src/adapters/GlidePubSubBridge';

describe('GLIDE Bridge Debug', () => {
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

  test('debug message reception issue', async () => {
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener
    bridge.on('message', (channel: string, message: string) => {
      console.log('🎯 DEBUG: Bridge received message:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Subscribe to a channel
    console.log('🔧 DEBUG: Subscribing to debug-channel...');
    const subscribeResult = await bridge.subscribe('debug-channel');
    console.log('📊 DEBUG: Subscribe result:', subscribeResult);

    // Check bridge status after subscription
    const statusAfterSub = bridge.getStatus();
    console.log('📊 DEBUG: Status after subscription:', statusAfterSub);

    // Wait for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 200));

    // Publish a message
    console.log('📤 DEBUG: Publishing message...');
    const publishResult = await bridge.publish('debug-channel', 'debug message');
    console.log('📊 DEBUG: Publish result:', publishResult, 'subscribers');

    // Wait longer for message to be received
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check final status
    const finalStatus = bridge.getStatus();
    console.log('📊 DEBUG: Final status:', finalStatus);

    // Verify results
    console.log('📊 DEBUG: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ DEBUG: SUCCESS - Message was received');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('debug-channel');
      expect(receivedMessage).toBe('debug message');
    } else {
      console.log('❌ DEBUG: FAILURE - Message was not received');
      console.log('🔍 DEBUG: This indicates an issue with our polling implementation');
      
      // Let's fail the test to investigate
      expect(messageReceived).toBe(true);
    }
  });
});
