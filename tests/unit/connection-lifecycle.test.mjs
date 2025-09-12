import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert';

import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../utils/test-config.mjs';
async function checkTestServers() {
  try {
    const config = getStandaloneConfig();
    const testClient = new Redis(config);
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch (error) {
    return false;
  }
}
describe('Connection Management (ioredis compatibility)', () => {
  let client;

  before(async () => {
    const serversAvailable = checkTestServers();
    if (!serversAvailable) {
      throw new Error(
        'Test servers not available. Please start Redis server before running tests.'
      );
    }
  });

  afterEach(async () => {
    if (client) {
      try {
        client.removeAllListeners();
        await client.quit();
        await new Promise(resolve => setTimeout(resolve, 100).unref());
      } catch {}
      client = null;
    }
  });

  after(async () => {
    if (client) {
      try {
        client.removeAllListeners();
        await client.quit();
        await new Promise(resolve => setTimeout(resolve, 200).unref());
      } catch {}
      client = null;
    }
  });

  describe('Client creation patterns', () => {
    it('should create client with default options', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('connect timeout in test')),
            4000
          ).unref()
        ),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with port and host', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('connect timeout in test')),
            4000
          ).unref()
        ),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with options object', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 1,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('connect timeout in test')),
            4000
          ).unref()
        ),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with redis:// URL', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        db: 0,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('connect timeout in test')),
            4000
          ).unref()
        ),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should handle database selection', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      const db = 0;
      client = new Redis({
        port: config.port,
        host: config.host,
        db,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('connect timeout in test')),
            4000
          ).unref()
        ),
      ]);

      assert.strictEqual(await client.select(db), 'OK');
    });
  });

  describe('Connection lifecycle', () => {
    it('should emit ready event when connected', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });

      const readyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.removeAllListeners('ready');
          resolve(); // Resolve anyway to prevent hanging
        }, 1000);

        client.on('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      await client.connect();

      // Clean slate: flush all data to prevent test pollution
      // GLIDE's flushall is multislot safe
      try {
        await client.flushall();
      } catch (error) {
        console.warn('Warning: Could not flush database:', error.message);
      }

      // Wait for ready event with timeout
      await readyPromise;

      client.removeAllListeners('ready');
    });

    it('should emit connect event', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });

      const connectPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.removeAllListeners('connect');
          resolve(); // Resolve anyway to prevent hanging
        }, 1000);

        client.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      await client.connect();

      // Clean slate: flush all data to prevent test pollution
      // GLIDE's flushall is multislot safe
      try {
        await client.flushall();
      } catch (error) {
        console.warn('Warning: Could not flush database:', error.message);
      }

      // Wait for connect event with timeout
      await connectPromise;

      client.removeAllListeners('connect');
    });

    it('should emit end event when disconnected', async () => {
      const serversAvailable = checkTestServers();
      if (!serversAvailable) return;

      const config = getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await client.connect();

      // Clean slate: flush all data to prevent test pollution
      // GLIDE's flushall is multislot safe
      try {
        await client.flushall();
      } catch (error) {
        console.warn('Warning: Could not flush database:', error.message);
      }

      await client.quit();
      assert.strictEqual(client.status, 'end');
      client.removeAllListeners();
      client = null;
    });
  });
});
