/**
 * Test to see if the class wrapper pattern is the issue
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

// Simple class wrapper that mimics our bridge structure
class SimplePubSubWrapper extends EventEmitter {
  private publishClient: GlideClient | null = null;
  private subscribeClient: GlideClient | null = null;
  private pollingActive = false;

  async createClients() {
    // Create publish client
    this.publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    // Create subscribe client
    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['class-test'])
        }
      }
    };

    this.subscribeClient = await GlideClient.createClient(subscriptionConfig);
  }

  async startPolling() {
    if (this.pollingActive || !this.subscribeClient) return;
    
    this.pollingActive = true;
    console.log('🔄 CLASS: Starting polling...');

    // Use for-loop pattern like our working test
    for (let i = 0; i < 20 && this.pollingActive && this.subscribeClient; i++) {
      try {
        console.log(`🔄 CLASS: Poll iteration ${i + 1}`);

        const message: PubSubMsg | null = await Promise.race([
          this.subscribeClient.getPubSubMessage(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
        ]);

        if (message) {
          console.log('📨 CLASS: Got message:', message);
          const channel = String(message.channel);
          const messageContent = String(message.message);
          
          // Emit like our bridge does
          this.emit('message', channel, messageContent);
          
          // Continue polling (don't break)
        }

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        console.log('❌ CLASS: Polling error:', error);
      }
    }

    console.log('🔄 CLASS: Polling ended');
  }

  async publish(channel: string, message: string): Promise<number> {
    if (!this.publishClient) throw new Error('No publish client');
    return await this.publishClient.publish(message, channel); // GLIDE order
  }

  async cleanup() {
    this.pollingActive = false;
    if (this.publishClient) {
      this.publishClient.close();
      this.publishClient = null;
    }
    if (this.subscribeClient) {
      this.subscribeClient.close();
      this.subscribeClient = null;
    }
  }
}

describe('GLIDE Class Debug', () => {
  let wrapper: SimplePubSubWrapper;

  afterAll(async () => {
    if (wrapper) {
      await wrapper.cleanup();
    }
  });

  test('test if class wrapper breaks the pattern', async () => {
    wrapper = new SimplePubSubWrapper();
    
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener
    wrapper.on('message', (channel: string, message: string) => {
      console.log('📨 CLASS: EventEmitter received:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Create clients
    console.log('🔧 CLASS: Creating clients...');
    await wrapper.createClients();

    // Wait for subscription establishment
    console.log('⏳ CLASS: Waiting for subscription establishment...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Start polling
    const pollingPromise = wrapper.startPolling();

    // Wait for polling to start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish message
    console.log('📤 CLASS: Publishing message...');
    const publishResult = await wrapper.publish('class-test', 'hello class test');
    console.log('📊 CLASS: Publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ CLASS: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop polling
    await wrapper.cleanup();
    await pollingPromise;

    console.log('📊 CLASS: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ CLASS: SUCCESS - Class wrapper works!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('class-test');
      expect(receivedMessage).toBe('hello class test');
    } else {
      console.log('❌ CLASS: FAILURE - Class wrapper breaks the pattern');
      console.log('🔍 CLASS: This suggests the issue is in our bridge class structure');
      
      // Let's fail to investigate
      expect(messageReceived).toBe(true);
    }
  });
});
