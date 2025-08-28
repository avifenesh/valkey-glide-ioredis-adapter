/**
 * Debug test to understand GLIDE configuration construction
 */

import { GlideClientConfiguration } from '@valkey/valkey-glide';

describe('GLIDE Config Debug', () => {
  test('debug configuration construction', () => {
    console.log('🔧 DEBUG: PubSubChannelModes.Exact value:', GlideClientConfiguration.PubSubChannelModes.Exact);
    console.log('🔧 DEBUG: PubSubChannelModes.Pattern value:', GlideClientConfiguration.PubSubChannelModes.Pattern);
    
    // Test Set creation
    const testChannels = new Set(['debug-channel']);
    console.log('🔧 DEBUG: Test Set:', testChannels);
    console.log('🔧 DEBUG: Test Set JSON:', JSON.stringify(testChannels));
    console.log('🔧 DEBUG: Test Set Array.from:', Array.from(testChannels));
    
    // Test configuration construction (our approach)
    const config1: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {}
      }
    };
    
    config1.pubsubSubscriptions!.channelsAndPatterns![
      GlideClientConfiguration.PubSubChannelModes.Exact
    ] = new Set(['debug-channel']);
    
    console.log('🔧 DEBUG: Our config approach:', JSON.stringify(config1, null, 2));
    
    // Test configuration construction (direct approach)
    const config2: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['debug-channel'])
        }
      }
    };
    
    console.log('🔧 DEBUG: Direct config approach:', JSON.stringify(config2, null, 2));
    
    // This test always passes - we're just debugging
    expect(true).toBe(true);
  });
});
