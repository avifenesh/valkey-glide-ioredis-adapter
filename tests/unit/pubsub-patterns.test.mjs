/**
 * Pub/Sub Patterns Comprehensive Tests
 *
 * Real-world patterns based on production systems:
 * - Slack's channel message routing and notifications
 * - Discord's real-time presence and voice channel updates
 * - Twitch's live chat and stream event broadcasting
 * - WhatsApp's message delivery and group chat patterns
 * - GitHub's webhook event distribution
 * - Trading platforms' real-time price updates
 */

import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';

describe('Pub/Sub Patterns - Real-World Message Routing', () => {
  let publisher;
  let subscriber;

  beforeEach(async () => {
    const config = getStandaloneConfig();
    publisher = new Redis(config);
    subscriber = new Redis(config);
  });

  afterEach(async () => {
    // Clean up subscribers first
    if (subscriber) {
      try {
        await subscriber.unsubscribe();
        await subscriber.punsubscribe();
      } catch (error) {
        // Ignore cleanup errors
      }
      await subscriber.disconnect();
    }

    if (publisher) {
      await publisher.disconnect();
    }
  });

  describe('Slack Channel Notification Pattern', () => {
    test('should route messages to specific channels', async () => {
      const receivedMessages = [];

      // Subscribe to specific Slack-style channels
      await subscriber.subscribe(
        'channel:general',
        'channel:random',
        'channel:tech-discuss'
      );

      subscriber.on('message', (_channel, message) => {
        receivedMessages.push({ channel: _channel, message });
      });

      // Wait for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Simulate Slack messages to different channels
      await publisher.publish(
        'channel:general',
        JSON.stringify({
          user: 'alice',
          text: 'Good morning everyone',
          timestamp: Date.now(),
          thread_ts: null,
        })
      );

      await publisher.publish(
        'channel:tech-discuss',
        JSON.stringify({
          user: 'bob_dev',
          text: 'Anyone tried the new Redis features?',
          timestamp: Date.now(),
          thread_ts: null,
        })
      );

      await publisher.publish(
        'channel:random',
        JSON.stringify({
          user: 'charlie',
          text: 'Coffee break time ☕',
          timestamp: Date.now(),
          thread_ts: null,
        })
      );

      // Wait for messages to be received
      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.strictEqual(receivedMessages.length, 3);

      const generalMsg = receivedMessages.find(
        m => m.channel === 'channel:general'
      );
      const techMsg = receivedMessages.find(
        m => m.channel === 'channel:tech-discuss'
      );
      const randomMsg = receivedMessages.find(
        m => m.channel === 'channel:random'
      );

      assert.ok(generalMsg !== undefined);
      assert.ok(techMsg !== undefined);
      assert.ok(randomMsg !== undefined);

      // Verify message content
      const generalData = JSON.parse(generalMsg.message);
      assert.strictEqual(generalData.user, 'alice');
      assert.ok(generalData.text.includes('Good morning'));

      const techData = JSON.parse(techMsg.message);
      assert.strictEqual(techData.user, 'bob_dev');
      assert.ok(techData.text.includes('Redis features'));
    });

    test('should handle direct message notifications', async () => {
      const dmMessages = [];

      // Subscribe to direct message patterns (Slack DM format)
      await subscriber.psubscribe('dm:user123:*', 'dm:*:user123');

      subscriber.on('pmessage', (_pattern, channel, message) => {
        dmMessages.push({ channel, message });
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Send DM from user456 to user123
      await publisher.publish(
        'dm:user456:user123',
        JSON.stringify({
          from: 'user456',
          to: 'user123',
          text: 'Hey, can you review my PR?',
          timestamp: Date.now(),
          is_dm: true,
        })
      );

      // Send DM from user123 to user789 (should also match pattern)
      await publisher.publish(
        'dm:user123:user789',
        JSON.stringify({
          from: 'user123',
          to: 'user789',
          text: 'Sure, will check it out',
          timestamp: Date.now(),
          is_dm: true,
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.ok(dmMessages.length >= 1);

      const incomingDM = dmMessages.find(
        m => m.channel === 'dm:user456:user123'
      );
      assert.ok(incomingDM !== undefined);

      const dmData = JSON.parse(incomingDM.message);
      assert.strictEqual(dmData.from, 'user456');
      assert.strictEqual(dmData.to, 'user123');
      assert.strictEqual(dmData.is_dm, true);
    });
  });

  describe('Discord Real-Time Presence Pattern', () => {
    test('should broadcast user presence updates', async () => {
      const presenceUpdates = [];

      // Subscribe to guild presence updates (Discord pattern)
      await subscriber.psubscribe('presence:guild:*');

      subscriber.on('pmessage', (_pattern, channel, message) => {
        presenceUpdates.push({ channel, message });
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Simulate user coming online
      await publisher.publish(
        'presence:guild:123456',
        JSON.stringify({
          user_id: 'user789',
          status: 'online',
          activity: {
            name: 'Visual Studio Code',
            type: 'PLAYING',
          },
          timestamp: Date.now(),
        })
      );

      // User starts playing a game
      await publisher.publish(
        'presence:guild:123456',
        JSON.stringify({
          user_id: 'user789',
          status: 'dnd',
          activity: {
            name: 'Cyberpunk 2077',
            type: 'PLAYING',
            details: 'Night City',
          },
          timestamp: Date.now(),
        })
      );

      // Another user joins voice channel
      await publisher.publish(
        'presence:guild:123456',
        JSON.stringify({
          user_id: 'user456',
          voice_channel: 'General',
          voice_state: 'joined',
          timestamp: Date.now(),
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.ok(presenceUpdates.length >= 3);

      const onlineUpdate = presenceUpdates.find(u => {
        const data = JSON.parse(u.message);
        return data.user_id === 'user789' && data.status === 'online';
      });
      assert.ok(onlineUpdate !== undefined);

      const voiceUpdate = presenceUpdates.find(u => {
        const data = JSON.parse(u.message);
        return data.voice_channel === 'General';
      });
      assert.ok(voiceUpdate !== undefined);
    });

    test('should handle voice channel state changes', async () => {
      const voiceUpdates = [];

      // Subscribe to voice channel events
      await subscriber.subscribe('voice:channel:updates');

      subscriber.on('message', (_channel, message) => {
        if (_channel === 'voice:channel:updates') {
          voiceUpdates.push(message);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // User joins voice channel
      await publisher.publish(
        'voice:channel:updates',
        JSON.stringify({
          action: 'user_joined',
          channel_id: 'voice_general',
          user_id: 'user123',
          timestamp: Date.now(),
        })
      );

      // User mutes microphone
      await publisher.publish(
        'voice:channel:updates',
        JSON.stringify({
          action: 'user_muted',
          channel_id: 'voice_general',
          user_id: 'user123',
          muted: true,
          timestamp: Date.now(),
        })
      );

      // User leaves voice channel
      await publisher.publish(
        'voice:channel:updates',
        JSON.stringify({
          action: 'user_left',
          channel_id: 'voice_general',
          user_id: 'user123',
          timestamp: Date.now(),
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.strictEqual(voiceUpdates.length, 3);

      const joinEvent = JSON.parse(voiceUpdates[0]);
      assert.strictEqual(joinEvent.action, 'user_joined');
      assert.strictEqual(joinEvent.user_id, 'user123');

      const muteEvent = JSON.parse(voiceUpdates[1]);
      assert.strictEqual(muteEvent.action, 'user_muted');
      assert.strictEqual(muteEvent.muted, true);

      const leaveEvent = JSON.parse(voiceUpdates[2]);
      assert.strictEqual(leaveEvent.action, 'user_left');
    });
  });

  describe('Twitch Live Chat Pattern', () => {
    test('should handle high-frequency chat messages', async () => {
      const chatMessages = [];

      // Subscribe to Twitch stream chat
      await subscriber.subscribe('chat:stream:12345');

      subscriber.on('message', (_channel, message) => {
        if (_channel === 'chat:stream:12345') {
          chatMessages.push(message);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Simulate rapid chat messages (Twitch pattern)
      const messages = [
        { user: 'viewer1', text: 'First', badges: ['subscriber'] },
        { user: 'viewer2', text: 'PogChamp', badges: [] },
        {
          user: 'moderator1',
          text: 'Welcome everyone',
          badges: ['moderator'],
        },
        { user: 'viewer3', text: 'Amazing play', badges: ['vip'] },
        { user: 'viewer4', text: 'Kappa', badges: [] },
      ];

      for (const msg of messages) {
        await publisher.publish(
          'chat:stream:12345',
          JSON.stringify({
            username: msg.user,
            message: msg.text,
            badges: msg.badges,
            timestamp: Date.now(),
            color: '#FF0000',
            emotes: [],
          })
        );
      }

      await new Promise(resolve => setTimeout(resolve, 300).unref());

      assert.strictEqual(chatMessages.length, 5);

      // Verify message structure
      const firstMessage = JSON.parse(chatMessages[0]);
      assert.strictEqual(firstMessage.username, 'viewer1');
      assert.strictEqual(firstMessage.message, 'First');
      assert.ok(firstMessage.badges.includes('subscriber'));

      const modMessage = JSON.parse(chatMessages[2]);
      assert.ok(modMessage.badges.includes('moderator'));
    });

    test('should handle stream event notifications', async () => {
      const streamEvents = [];

      // Subscribe to stream events
      await subscriber.subscribe('stream:events:12345');

      subscriber.on('message', (_channel, message) => {
        if (_channel === 'stream:events:12345') {
          streamEvents.push(message);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Stream goes live
      await publisher.publish(
        'stream:events:12345',
        JSON.stringify({
          event: 'stream_online',
          streamer: 'pro_gamer',
          title: 'Speedrunning Portal 2!',
          game: 'Portal 2',
          viewers: 0,
          timestamp: Date.now(),
        })
      );

      // New follower
      await publisher.publish(
        'stream:events:12345',
        JSON.stringify({
          event: 'new_follower',
          follower: 'new_viewer123',
          total_followers: 1543,
          timestamp: Date.now(),
        })
      );

      // Raid received
      await publisher.publish(
        'stream:events:12345',
        JSON.stringify({
          event: 'raid_received',
          from_streamer: 'other_streamer',
          raiders: 250,
          timestamp: Date.now(),
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.strictEqual(streamEvents.length, 3);

      const liveEvent = JSON.parse(streamEvents[0]);
      assert.strictEqual(liveEvent.event, 'stream_online');
      assert.strictEqual(liveEvent.game, 'Portal 2');

      const followerEvent = JSON.parse(streamEvents[1]);
      assert.strictEqual(followerEvent.event, 'new_follower');
      assert.strictEqual(followerEvent.total_followers, 1543);

      const raidEvent = JSON.parse(streamEvents[2]);
      assert.strictEqual(raidEvent.event, 'raid_received');
      assert.strictEqual(raidEvent.raiders, 250);
    });
  });

  describe('GitHub Webhook Event Distribution', () => {
    test('should route repository events to subscribers', async () => {
      const webhookEvents = [];

      // Subscribe to GitHub webhook events by repository
      await subscriber.psubscribe(
        'github:repo:*/push',
        'github:repo:*/pull_request'
      );

      subscriber.on('pmessage', (_pattern, channel, message) => {
        webhookEvents.push({ channel, message });
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Push event
      await publisher.publish(
        'github:repo:myorg/myproject/push',
        JSON.stringify({
          event: 'push',
          repository: 'myorg/myproject',
          pusher: 'developer1',
          commits: [
            {
              id: 'abc123',
              message: 'Fix authentication bug',
              author: 'developer1',
              timestamp: new Date().toISOString(),
            },
          ],
          ref: 'refs/heads/main',
        })
      );

      // Pull request event
      await publisher.publish(
        'github:repo:myorg/myproject/pull_request',
        JSON.stringify({
          event: 'pull_request',
          action: 'opened',
          repository: 'myorg/myproject',
          pull_request: {
            number: 42,
            title: 'Add new feature',
            user: 'contributor1',
            base: 'main',
            head: 'feature-branch',
          },
        })
      );

      // Different repo push (should also be received due to pattern)
      await publisher.publish(
        'github:repo:otherorg/otherproject/push',
        JSON.stringify({
          event: 'push',
          repository: 'otherorg/otherproject',
          pusher: 'maintainer1',
          commits: [
            {
              id: 'def456',
              message: 'Update documentation',
              author: 'maintainer1',
            },
          ],
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.ok(webhookEvents.length >= 3);

      const pushEvent = webhookEvents.find(e =>
        e.channel.includes('myorg/myproject/push')
      );
      assert.ok(pushEvent !== undefined);

      const pushData = JSON.parse(pushEvent.message);
      assert.strictEqual(pushData.event, 'push');
      assert.strictEqual(pushData.pusher, 'developer1');

      const prEvent = webhookEvents.find(e =>
        e.channel.includes('pull_request')
      );
      assert.ok(prEvent !== undefined);

      const prData = JSON.parse(prEvent.message);
      assert.strictEqual(prData.event, 'pull_request');
      assert.strictEqual(prData.pull_request.number, 42);
    });
  });

  describe('Trading Platform Real-Time Price Updates', () => {
    test('should broadcast market data to subscribers', async () => {
      const priceUpdates = [];

      // Subscribe to cryptocurrency price feeds
      await subscriber.psubscribe('market:crypto:*', 'market:forex:*');

      subscriber.on('pmessage', (_pattern, channel, message) => {
        priceUpdates.push({ channel, message });
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Bitcoin price update
      await publisher.publish(
        'market:crypto:BTC-USD',
        JSON.stringify({
          symbol: 'BTC-USD',
          price: 45230.5,
          change_24h: 2.34,
          volume_24h: 28500000000,
          timestamp: Date.now(),
          exchange: 'binance',
        })
      );

      // Ethereum price update
      await publisher.publish(
        'market:crypto:ETH-USD',
        JSON.stringify({
          symbol: 'ETH-USD',
          price: 3125.75,
          change_24h: -1.23,
          volume_24h: 15200000000,
          timestamp: Date.now(),
          exchange: 'coinbase',
        })
      );

      // Forex update
      await publisher.publish(
        'market:forex:EUR-USD',
        JSON.stringify({
          symbol: 'EUR-USD',
          bid: 1.0842,
          ask: 1.0844,
          spread: 0.0002,
          timestamp: Date.now(),
          provider: 'reuters',
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.strictEqual(priceUpdates.length, 3);

      const btcUpdate = priceUpdates.find(u => u.channel.includes('BTC-USD'));
      assert.ok(btcUpdate !== undefined);

      const btcData = JSON.parse(btcUpdate.message);
      assert.strictEqual(btcData.symbol, 'BTC-USD');
      assert.strictEqual(btcData.price, 45230.5);

      const forexUpdate = priceUpdates.find(u => u.channel.includes('EUR-USD'));
      assert.ok(forexUpdate !== undefined);

      const forexData = JSON.parse(forexUpdate.message);
      assert.strictEqual(forexData.bid, 1.0842);
      assert.strictEqual(forexData.ask, 1.0844);
    });

    test('should handle trading alerts and notifications', async () => {
      const alerts = [];

      // Subscribe to trading alerts
      await subscriber.subscribe('alerts:price-USD', 'alerts:volume:high');

      subscriber.on('message', (_channel, message) => {
        alerts.push(message);
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Price alert triggered
      await publisher.publish(
        'alerts:price-USD',
        JSON.stringify({
          type: 'price_alert',
          symbol: 'BTC-USD',
          condition: 'above',
          threshold: 45000,
          current_price: 45230.5,
          user_id: 'trader123',
          timestamp: Date.now(),
        })
      );

      // Volume spike alert
      await publisher.publish(
        'alerts:volume:high',
        JSON.stringify({
          type: 'volume_alert',
          symbol: 'ETH-USD',
          volume_threshold: 10000000000,
          current_volume: 15200000000,
          spike_percentage: 52,
          timestamp: Date.now(),
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.strictEqual(alerts.length, 2);

      const priceAlert = JSON.parse(alerts[0]);
      assert.strictEqual(priceAlert.type, 'price_alert');
      assert.strictEqual(priceAlert.current_price, 45230.5);
      assert.strictEqual(priceAlert.condition, 'above');

      const volumeAlert = JSON.parse(alerts[1]);
      assert.strictEqual(volumeAlert.type, 'volume_alert');
      assert.strictEqual(volumeAlert.spike_percentage, 52);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('DEBUG: core subscription and publish test', async () => {
      const messages = [];

      console.log('\n🔍 DEBUG core pubsub test');
      console.log(`Publisher config: ${JSON.stringify(getStandaloneConfig())}`);
      console.log(
        `Subscriber config: ${JSON.stringify(getStandaloneConfig())}`
      );

      // Test connection first
      try {
        console.log('📡 Testing publisher connection...');
        const publisherPing = await publisher.ping();
        console.log(`Publisher ping result: ${publisherPing}`);

        console.log('📡 Testing subscriber connection...');
        const subscriberPing = await subscriber.ping();
        console.log(`Subscriber ping result: ${subscriberPing}`);
      } catch (error) {
        console.error('❌ Connection test failed:', error);
        throw error;
      }

      // Subscribe to channels that may not receive messages
      console.log('📞 Subscribing to channels...');
      const subResult = await subscriber.subscribe(
        'debug:test:1',
        'debug:test:2'
      );
      console.log(`Subscription result: ${subResult}`);

      subscriber.on('message', (_channel, message) => {
        console.log(`📨 Received message: ${_channel} -> ${message}`);
        messages.push(message);
      });

      // Wait for subscription to settle
      await new Promise(resolve => setTimeout(resolve, 200).unref());

      // Now send a message to verify subscription works
      console.log('📤 Publishing test message...');
      const publishResult = await publisher.publish(
        'debug:test:1',
        'test message'
      );
      console.log(`Publish result: ${publishResult}`);

      await new Promise(resolve => setTimeout(resolve, 300).unref());

      console.log(`Final messages received: ${messages.length}`);
      console.log('Messages:', messages);

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0], 'test message');
    });

    test('should handle subscription to non-existent channels', async () => {
      const messages = [];

      // Subscribe to channels that may not receive messages
      await subscriber.subscribe('empty:channel:1', 'empty:channel:2');

      subscriber.on('message', (_channel, message) => {
        messages.push(message);
      });

      // Wait without sending any messages
      await new Promise(resolve => setTimeout(resolve, 200).unref());

      // Should not have received any messages
      assert.strictEqual(messages.length, 0);

      // Now send a message to verify subscription works
      await publisher.publish('empty:channel:1', 'test message');
      await new Promise(resolve => setTimeout(resolve, 100).unref());

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0], 'test message');
    });

    test('should handle pattern subscription with no matches', async () => {
      const patternMessages = [];

      // Subscribe to pattern that won't match published channels
      await subscriber.psubscribe('nomatch:*:test');

      subscriber.on('pmessage', (_pattern, channel, message) => {
        patternMessages.push({ pattern: _pattern, channel, message });
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Publish to channels that don't match the pattern
      await publisher.publish('different:channel', 'message1');
      await publisher.publish('another:format:channel', 'message2');

      await new Promise(resolve => setTimeout(resolve, 200).unref());

      // Should not receive any messages
      assert.strictEqual(patternMessages.length, 0);

      // Now publish to matching channel
      await publisher.publish('nomatch:something:test', 'matching message');
      await new Promise(resolve => setTimeout(resolve, 100).unref());

      assert.strictEqual(patternMessages.length, 1);
      assert.strictEqual(patternMessages[0]?.message, 'matching message');
    });

    test('should handle unsubscribe operations', async () => {
      const messages = [];

      await subscriber.subscribe('test:unsubscribe:1', 'test:unsubscribe:2');

      subscriber.on('message', (_channel, message) => {
        messages.push(`${_channel}:${message}`);
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Send initial messages
      await publisher.publish('test:unsubscribe:1', 'msg1');
      await publisher.publish('test:unsubscribe:2', 'msg2');

      await new Promise(resolve => setTimeout(resolve, 100).unref());
      assert.strictEqual(messages.length, 2);

      // Unsubscribe from one channel
      await subscriber.unsubscribe('test:unsubscribe:1');

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Send more messages
      await publisher.publish('test:unsubscribe:1', 'msg3'); // Should not receive
      await publisher.publish('test:unsubscribe:2', 'msg4'); // Should receive

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Should only have received 3 messages (not the 4th from unsubscribed channel)
      assert.strictEqual(messages.length, 3);
      assert.ok(messages.includes('test:unsubscribe:2:msg4'));
      assert.ok(!messages.includes('test:unsubscribe:1:msg3'));
    });

    test('should handle large message payloads', async () => {
      const largeMessages = [];

      await subscriber.subscribe('large:message:test');

      subscriber.on('message', (_channel, message) => {
        largeMessages.push(message);
      });

      await new Promise(resolve => setTimeout(resolve, 100).unref());

      // Create a large message (1KB)
      const largePayload = JSON.stringify({
        data: 'x'.repeat(1000),
        timestamp: Date.now(),
        metadata: {
          size: '1KB',
          type: 'large_payload_test',
        },
      });

      await publisher.publish('large:message:test', largePayload);
      await new Promise(resolve => setTimeout(resolve, 200).unref());

      assert.strictEqual(largeMessages.length, 1);

      const received = JSON.parse(largeMessages[0]);
      assert.strictEqual(received.data.length, 1000);
      assert.strictEqual(received.metadata.type, 'large_payload_test');
    });
  });
});
