/**
 * Test that replicates the exact working pattern from our simple polling test
 */

import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

describe('GLIDE Single Client Debug', () => {
  let publishClient: GlideClient;
  let subscribeClient: GlideClient;

  afterAll(async () => {
    if (publishClient) {
      publishClient.close();
    }
    if (subscribeClient) {
      subscribeClient.close();
    }
  });

  test('replicate exact working pattern from simple polling test', async () => {
    // Create a regular client for publishing (like in our working test)
    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    // Create a pub/sub client for subscribing (EXACT same pattern as working test)
    const subscribeConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['single-client-test'])
        }
      }
    };

    subscribeClient = await GlideClient.createClient(subscribeConfig);

    console.log('🔧 DEBUG: Clients created, waiting for subscription to establish...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Publish a message
    console.log('📤 DEBUG: Publishing message...');
    const publishResult = await publishClient.publish('hello single client', 'single-client-test');
    console.log('📊 DEBUG: Publish result:', publishResult, 'subscribers');

    // Try to receive the message (EXACT same pattern as working test)
    console.log('🔄 DEBUG: Polling for message...');
    let messageReceived = false;
    let receivedMessage = '';
    let receivedChannel = '';

    for (let i = 0; i < 10; i++) {
      try {
        const message: PubSubMsg | null = await Promise.race([
          subscribeClient.getPubSubMessage(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
        ]);

        if (message) {
          console.log('📨 DEBUG: Got message:', message);
          messageReceived = true;
          receivedMessage = String(message.message);
          receivedChannel = String(message.channel);
          break;
        } else {
          console.log(`🔄 DEBUG: Poll ${i + 1}/10 - no message`);
        }
      } catch (error) {
        console.log('❌ DEBUG: Error polling:', error);
      }
    }

    // Verify results
    console.log('📊 DEBUG: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ DEBUG: SUCCESS - Single client pattern works!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('single-client-test');
      expect(receivedMessage).toBe('hello single client');
    } else {
      console.log('❌ DEBUG: FAILURE - Even single client pattern fails');
      console.log('🔍 DEBUG: This suggests a fundamental issue with our GLIDE setup');
      
      // Let's fail to investigate
      expect(messageReceived).toBe(true);
    }
  });
});
