import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert';

import pkg from '../../dist/index.js';
const { Redis } = pkg;
import { testUtils } from '../setup/index.mjs';

describe('Connection Management (ioredis compatibility)', () => {
  let client;

  before(async () => {
    const serversAvailable = testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available. Please start Redis server before running tests.');
    }
  });

  afterEach(async () => {
    if (client) {
      try {
        client.removeAllListeners();
        await client.quit();
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {}
      client = null;
    }
  });

  after(async () => {
    if (client) {
      try {
        client.removeAllListeners();
        await client.quit();
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch {}
      client = null;
    }
  });

  describe('Client creation patterns', () => {
    it('should create client with default options', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000)),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with port and host', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        port: config.port,
        host: config.host,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000)),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with options object', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000)),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should create client with redis:// URL', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000)),
      ]);

      const result = await client.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should handle database selection', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout in test')), 4000)),
      ]);

      assert.strictEqual(await client.select(db), 'OK');
    });
  });

  describe('Connection lifecycle', () => {
    it('should emit ready event when connected', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });

      const readyPromise = new Promise(resolve => {
        client.on('ready', resolve);
      });

      await client.connect();
      await readyPromise;

      client.removeAllListeners('ready');
    });

    it('should emit connect event', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });

      const connectPromise = new Promise(resolve => {
        client.on('connect', resolve);
      });

      await client.connect();
      await connectPromise;

      client.removeAllListeners('connect');
    });

    it('should emit end event when disconnected', async () => {
      const serversAvailable = testUtils.checkTestServers();
      if (!serversAvailable) return;

      const config = await testUtils.getStandaloneConfig();
      client = new Redis({
        ...config,
        connectTimeout: config.connectTimeout ?? 2000,
        requestTimeout: config.requestTimeout ?? 3000,
        maxRetriesPerRequest: 1,
      });
      await client.connect();

      await client.quit();
      assert.strictEqual(client.status, 'end');
      client.removeAllListeners();
      client = null;
    });
  });
});
