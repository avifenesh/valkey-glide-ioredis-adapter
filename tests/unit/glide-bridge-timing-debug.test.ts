/**
 * Test to debug if client creation order affects message reception
 */

import { GlidePubSubBridge } from '../../src/adapters/GlidePubSubBridge';

describe('GLIDE Bridge Timing Debug', () => {
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

  test('test client creation order hypothesis', async () => {
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener
    bridge.on('message', (channel: string, message: string) => {
      console.log('📨 DEBUG: Bridge received message:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // HYPOTHESIS: Create publish client FIRST, then subscribe client
    console.log('🔧 DEBUG: Creating publish client FIRST...');
    
    // Force creation of publish client by calling publish with a dummy message
    try {
      await bridge.publish('dummy-channel', 'dummy-message');
      console.log('✅ DEBUG: Publish client created successfully');
    } catch (error) {
      console.log('⚠️ DEBUG: Publish client creation error (expected):', error);
    }

    // Now subscribe (which creates subscribe client)
    console.log('🔧 DEBUG: Now subscribing to timing-test...');
    const subscribeResult = await bridge.subscribe('timing-test');
    console.log('📊 DEBUG: Subscribe result:', subscribeResult);

    // Wait for subscription to be established
    console.log('⏳ DEBUG: Waiting for subscription establishment...');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check status
    const status = bridge.getStatus();
    console.log('📊 DEBUG: Status after setup:', status);

    // Now publish the actual test message
    console.log('📤 DEBUG: Publishing test message...');
    const publishResult = await bridge.publish('timing-test', 'hello timing test');
    console.log('📊 DEBUG: Publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ DEBUG: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check results
    console.log('📊 DEBUG: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ DEBUG: SUCCESS - Client order hypothesis confirmed!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('timing-test');
      expect(receivedMessage).toBe('hello timing test');
    } else {
      console.log('❌ DEBUG: FAILURE - Client order is not the issue');
      console.log('🔍 DEBUG: Need to investigate other factors');
      
      // Let's fail to investigate further
      expect(messageReceived).toBe(true);
    }
  });
});
