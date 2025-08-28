/**
 * Minimal test that bypasses bridge methods to isolate the issue
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

describe('GLIDE Minimal Bridge Test', () => {
  let publishClient: GlideClient;
  let subscribeClient: GlideClient;
  let eventEmitter: EventEmitter;

  afterAll(async () => {
    if (publishClient) {
      publishClient.close();
    }
    if (subscribeClient) {
      subscribeClient.close();
    }
  });

  test('minimal bridge functionality without bridge wrapper', async () => {
    // Create EventEmitter (like our bridge does)
    eventEmitter = new EventEmitter();
    
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener on EventEmitter
    eventEmitter.on('message', (channel: string, message: string) => {
      console.log('📨 DEBUG: EventEmitter received message:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Create publish client (regular client)
    console.log('🔧 DEBUG: Creating publish client...');
    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    // Create subscribe client (with pub/sub config)
    console.log('🔧 DEBUG: Creating subscribe client...');
    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['minimal-test'])
        }
      }
    };

    subscribeClient = await GlideClient.createClient(subscriptionConfig);

    // Start polling loop (like our bridge does)
    console.log('🔧 DEBUG: Starting polling loop...');
    let pollingActive = true;
    let pollCount = 0;

    const pollingPromise = (async () => {
      while (pollingActive && subscribeClient) {
        try {
          pollCount++;
          console.log(`🔄 DEBUG: Poll iteration ${pollCount}`);

          const message: PubSubMsg | null = await Promise.race([
            subscribeClient.getPubSubMessage(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
          ]);

          if (message) {
            console.log('📨 DEBUG: Got message from polling:', message);
            // Emit to EventEmitter (like our bridge does)
            const channel = String(message.channel);
            const messageContent = String(message.message);
            eventEmitter.emit('message', channel, messageContent);
            break; // Stop polling after receiving message
          }
        } catch (error) {
          console.log('❌ DEBUG: Polling error:', error);
          break;
        }
      }
      console.log('🔄 DEBUG: Polling loop ended');
    })();

    // Wait for subscription to be established
    console.log('⏳ DEBUG: Waiting for subscription establishment...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Publish message (GLIDE uses message, channel order - opposite of ioredis!)
    console.log('📤 DEBUG: Publishing message...');
    const publishResult = await publishClient.publish('hello minimal', 'minimal-test');
    console.log('📊 DEBUG: Publish result:', publishResult, 'subscribers');
    
    console.log('🔧 DEBUG: GLIDE publish order is (message, channel) - we published:');
    console.log('🔧 DEBUG: Message: "hello minimal" to Channel: "minimal-test"');
    console.log('🔧 DEBUG: But we are subscribed to channel: "minimal-test"');
    console.log('🔧 DEBUG: So this should work!');

    // Wait for message reception
    console.log('⏳ DEBUG: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop polling
    pollingActive = false;
    await pollingPromise;

    // Check results
    console.log('📊 DEBUG: Message received:', messageReceived);
    console.log('📊 DEBUG: Poll count:', pollCount);

    if (messageReceived) {
      console.log('✅ DEBUG: SUCCESS - Minimal bridge pattern works!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('minimal-test');
      expect(receivedMessage).toBe('hello minimal');
    } else {
      console.log('❌ DEBUG: FAILURE - Even minimal pattern fails');
      console.log('🔍 DEBUG: This suggests a fundamental issue with our approach');
      
      // Let's fail to investigate
      expect(messageReceived).toBe(true);
    }
  });
});
