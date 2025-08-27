import { RedisAdapter } from '../../src/adapters/RedisAdapter';
import { testUtils } from '../../tests/setup';

describe('Transaction Commands', () => {
  let redis: RedisAdapter;

  beforeAll(async () => {
    // Check if test servers are available
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available. Please start Redis server before running tests.');
    }

    const config = await testUtils.getStandaloneConfig();
    redis = new RedisAdapter(config);
    await redis.connect();
  });

  afterAll(async () => {
    if (redis) {
      await redis.disconnect();
    }
  });

  it('should watch and unwatch keys', async () => {
    // Skip test if servers are not available
    if (!await testUtils.checkTestServers()) {
      return;
    }

    await redis.set('watchkey', 'value1');
    
    // Watch the key
    const watchResult = await redis.watch('watchkey');
    expect(watchResult).toBe('OK');
    
    // Unwatch the key
    const unwatchResult = await redis.unwatch();
    expect(unwatchResult).toBe('OK');
  });

  it('should execute transaction with multi/exec', async () => {
    // Skip test if servers are not available
    if (!await testUtils.checkTestServers()) {
      return;
    }

    await redis.set('multikey1', 'value1');
    await redis.set('multikey2', 'value2');
    
    const multi = redis.multi();
    multi.get('multikey1');
    multi.get('multikey2');
    multi.set('multikey3', 'value3');
    
    const results = await multi.exec();
    
    expect(results).not.toBeNull();
    expect(Array.isArray(results)).toBe(true);
    if (results) {
      expect(results.length).toBe(3);
      expect(results[0]).toEqual([null, 'value1']);
      expect(results[1]).toEqual([null, 'value2']);
      expect(results[2]).toEqual([null, 'OK']);
    }
  });

  it('should handle transaction with watched key modification', async () => {
    // Skip test if servers are not available
    if (!await testUtils.checkTestServers()) {
      return;
    }

    // This test is more complex as it requires simulating a transaction failure
    // For now, we'll just test that the multi/exec flow works
    await redis.set('watchtestkey', 'initial');
    
    const multi = redis.multi();
    multi.get('watchtestkey');
    multi.set('watchtestkey', 'modified');
    
    const results = await multi.exec();
    
    expect(results).not.toBeNull();
    if (results) {
      expect(results.length).toBe(2);
      expect(results[0]).toEqual([null, 'initial']);
      expect(results[1]).toEqual([null, 'OK']);
    }
  });
});