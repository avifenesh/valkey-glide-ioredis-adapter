/**
 * Test composition vs inheritance to isolate EventEmitter issue
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

// Use composition instead of inheritance
class CompositionPubSubWrapper {
  private publishClient: GlideClient | null = null;
  private subscribeClient: GlideClient | null = null;
  private pollingActive = false;
  private eventEmitter = new EventEmitter(); // Composition, not inheritance

  // Expose EventEmitter methods
  on(event: string, listener: (...args: any[]) => void) {
    return this.eventEmitter.on(event, listener);
  }

  emit(event: string, ...args: any[]) {
    return this.eventEmitter.emit(event, ...args);
  }

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
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['composition-test'])
        }
      }
    };

    this.subscribeClient = await GlideClient.createClient(subscriptionConfig);
  }

  async startPolling() {
    if (this.pollingActive || !this.subscribeClient) return;
    
    this.pollingActive = true;
    console.log('🔄 COMP: Starting polling...');

    // Use for-loop pattern like our working test
    for (let i = 0; i < 20 && this.pollingActive && this.subscribeClient; i++) {
      try {
        console.log(`🔄 COMP: Poll iteration ${i + 1}`);

        const message: PubSubMsg | null = await Promise.race([
          this.subscribeClient.getPubSubMessage(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
        ]);

        if (message) {
          console.log('📨 COMP: Got message:', message);
          const channel = String(message.channel);
          const messageContent = String(message.message);
          
          // Emit using composition
          this.emit('message', channel, messageContent);
          
          // Continue polling (don't break)
        }

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        console.log('❌ COMP: Polling error:', error);
      }
    }

    console.log('🔄 COMP: Polling ended');
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

describe('GLIDE Composition Debug', () => {
  let wrapper: CompositionPubSubWrapper;

  afterAll(async () => {
    if (wrapper) {
      await wrapper.cleanup();
    }
  });

  test('test if EventEmitter inheritance is the issue', async () => {
    wrapper = new CompositionPubSubWrapper();
    
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Set up message listener
    wrapper.on('message', (channel: string, message: string) => {
      console.log('📨 COMP: EventEmitter received:', { channel, message });
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Create clients
    console.log('🔧 COMP: Creating clients...');
    await wrapper.createClients();

    // Wait for subscription establishment
    console.log('⏳ COMP: Waiting for subscription establishment...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Start polling
    const pollingPromise = wrapper.startPolling();

    // Wait for polling to start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish message
    console.log('📤 COMP: Publishing message...');
    const publishResult = await wrapper.publish('composition-test', 'hello composition test');
    console.log('📊 COMP: Publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ COMP: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop polling
    await wrapper.cleanup();
    await pollingPromise;

    console.log('📊 COMP: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ COMP: SUCCESS - Composition works! EventEmitter inheritance was the issue!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('composition-test');
      expect(receivedMessage).toBe('hello composition test');
    } else {
      console.log('❌ COMP: FAILURE - Even composition fails');
      console.log('🔍 COMP: The issue is deeper than EventEmitter inheritance');
      
      // Let's fail to investigate
      expect(messageReceived).toBe(true);
    }
  });
});
