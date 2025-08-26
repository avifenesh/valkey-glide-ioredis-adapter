/**
 * Debug Test - Hash Operations
 * Test to debug the hgetall issue
 */

import { RedisAdapter } from '../src/adapters/RedisAdapter';
import { testUtils } from './setup';

describe('Debug Hash Operations', () => {
  let adapter: RedisAdapter;

  beforeEach(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      console.warn('⚠️  Test servers not available. Skipping test...');
      return;
    }

    const config = await testUtils.getStandaloneConfig();
    adapter = new RedisAdapter(config);
    await adapter.connect();
  });

  afterEach(async () => {
    if (adapter) {
      try {
        await adapter.del('debug:*');
      } catch {
        // Ignore cleanup errors
      }
      await adapter.disconnect();
    }
  });

  test('debug hgetall response format', async () => {
    // Restore console temporarily for debugging
    const originalConsole = console;
    
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      originalConsole.warn('⚠️  Skipping test - servers not available');
      return;
    }

    // Set hash values using individual hset calls to debug
    originalConsole.log('Setting hash field1...');
    const setResult1 = await adapter.hset('debug:hash', 'field1', 'value1');
    originalConsole.log('HSET result 1:', setResult1);
    
    originalConsole.log('Setting hash field2...');
    const setResult2 = await adapter.hset('debug:hash', 'field2', 'value2');
    originalConsole.log('HSET result 2:', setResult2);

    // Check individual fields
    originalConsole.log('Getting field1...');
    const field1 = await adapter.hget('debug:hash', 'field1');
    originalConsole.log('HGET field1:', field1);
    
    originalConsole.log('Getting field2...');
    const field2 = await adapter.hget('debug:hash', 'field2');
    originalConsole.log('HGET field2:', field2);

    // Get all hash keys
    originalConsole.log('Getting all keys...');
    const keys = await adapter.hkeys('debug:hash');
    originalConsole.log('HKEYS result:', keys);

    // Get all hash values
    originalConsole.log('Getting all values...');
    const values = await adapter.hvals('debug:hash');
    originalConsole.log('HVALS result:', values);

    // Get hash length
    originalConsole.log('Getting hash length...');
    const length = await adapter.hlen('debug:hash');
    originalConsole.log('HLEN result:', length);

    // Now try hgetall
    originalConsole.log('Getting all hash data...');
    const allValues = await adapter.hgetall('debug:hash');
    originalConsole.log('HGETALL result:', allValues);
    originalConsole.log('HGETALL result type:', typeof allValues);
    originalConsole.log('HGETALL result is array:', Array.isArray(allValues));

    // This test will pass if we get here - we're just debugging
    expect(true).toBe(true);
  });
});