/**
 * Test dynamic client creation with the exact same pattern as working test
 */

import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

describe('GLIDE Dynamic Debug', () => {
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

  test('dynamic client creation with exact working pattern', async () => {
    // Create a regular client for publishing
    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    // Simulate our bridge's dynamic approach
    const subscribedChannels = new Set(['dynamic-test']);
    
    console.log('🔧 DEBUG: subscribedChannels Set:', subscribedChannels);
    console.log('🔧 DEBUG: subscribedChannels Array.from:', Array.from(subscribedChannels));
    
    // Create config exactly like our bridge does
    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {}
      }
    };

    // Add channels exactly like our bridge does
    if (subscribedChannels.size > 0) {
      const exactChannels = new Set(Array.from(subscribedChannels));
      console.log('🔧 DEBUG: exactChannels Set:', exactChannels);
      
      subscriptionConfig.pubsubSubscriptions!.channelsAndPatterns![
        GlideClientConfiguration.PubSubChannelModes.Exact
      ] = exactChannels;
    }

    console.log('🔧 DEBUG: Final config channelsAndPatterns:', 
      subscriptionConfig.pubsubSubscriptions?.channelsAndPatterns);
    
    // Create subscription client with our dynamic config
    subscribeClient = await GlideClient.createClient(subscriptionConfig);

    console.log('🔧 DEBUG: Subscription client created, waiting...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Publish a message
    console.log('📤 DEBUG: Publishing message...');
    const publishResult = await publishClient.publish('hello dynamic', 'dynamic-test');
    console.log('📊 DEBUG: Publish result:', publishResult, 'subscribers');

    // Try to receive the message
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
      console.log('✅ DEBUG: SUCCESS - Dynamic pattern works!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('dynamic-test');
      expect(receivedMessage).toBe('hello dynamic');
    } else {
      console.log('❌ DEBUG: FAILURE - Dynamic pattern fails');
      console.log('🔍 DEBUG: Issue is in our dynamic client creation approach');
      
      // Let's fail to investigate
      expect(messageReceived).toBe(true);
    }
  });
});
