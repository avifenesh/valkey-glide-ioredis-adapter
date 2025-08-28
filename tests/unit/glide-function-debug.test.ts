/**
 * Test if any encapsulation breaks GLIDE by using a simple function
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

// Simple function wrapper (no class at all)
async function testFunctionWrapper() {
  let publishClient: GlideClient | null = null;
  let subscribeClient: GlideClient | null = null;
  const eventEmitter = new EventEmitter();
  
  let messageReceived = false;
  let receivedChannel = '';
  let receivedMessage = '';

  // Set up message listener
  eventEmitter.on('message', (channel: string, message: string) => {
    console.log('📨 FUNC: EventEmitter received:', { channel, message });
    messageReceived = true;
    receivedChannel = channel;
    receivedMessage = message;
  });

  try {
    // Create clients (exact same pattern as working test)
    console.log('🔧 FUNC: Creating clients...');
    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['function-test'])
        }
      }
    };

    subscribeClient = await GlideClient.createClient(subscriptionConfig);

    // Wait for subscription establishment
    console.log('⏳ FUNC: Waiting for subscription establishment...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Start polling (for-loop pattern)
    console.log('🔄 FUNC: Starting polling...');
    let pollingActive = true;

    const pollingPromise = (async () => {
      for (let i = 0; i < 20 && pollingActive && subscribeClient; i++) {
        try {
          console.log(`🔄 FUNC: Poll iteration ${i + 1}`);

          const message: PubSubMsg | null = await Promise.race([
            subscribeClient.getPubSubMessage(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
          ]);

          if (message) {
            console.log('📨 FUNC: Got message:', message);
            const channel = String(message.channel);
            const messageContent = String(message.message);
            
            // Emit to EventEmitter
            eventEmitter.emit('message', channel, messageContent);
            
            // Continue polling (don't break)
          }

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch (error) {
          console.log('❌ FUNC: Polling error:', error);
        }
      }
      console.log('🔄 FUNC: Polling ended');
    })();

    // Wait for polling to start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish message
    console.log('📤 FUNC: Publishing message...');
    const publishResult = await publishClient.publish('hello function', 'function-test');
    console.log('📊 FUNC: Publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ FUNC: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop polling
    pollingActive = false;
    await pollingPromise;

    return { messageReceived, receivedChannel, receivedMessage };

  } finally {
    // Cleanup
    if (publishClient) publishClient.close();
    if (subscribeClient) subscribeClient.close();
  }
}

describe('GLIDE Function Debug', () => {
  test('test if any encapsulation breaks GLIDE', async () => {
    const result = await testFunctionWrapper();

    console.log('📊 FUNC: Message received:', result.messageReceived);
    if (result.messageReceived) {
      console.log('✅ FUNC: SUCCESS - Function wrapper works!');
      expect(result.messageReceived).toBe(true);
      expect(result.receivedChannel).toBe('function-test');
      expect(result.receivedMessage).toBe('hello function');
    } else {
      console.log('❌ FUNC: FAILURE - Even function wrapper fails');
      console.log('🔍 FUNC: The issue is fundamental to any encapsulation');
      
      // Let's fail to investigate
      expect(result.messageReceived).toBe(true);
    }
  });
});
