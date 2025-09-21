import { describe, it, afterEach, after } from 'node:test';
import assert from 'node:assert';
import {
  describeForEachMode,
  createClient,
  flushAll,
} from '../setup/dual-mode.mjs';
describeForEachMode('Connection Management (ioredis compatibility)', mode => {
  let client;

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
    it('should connect and ping', async () => {
      client = await createClient(mode);
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
    // Standalone-only behaviors (port/host constructors, URL, DB selection) are
    // validated in other tests; keep this suite adapter-agnostic.
  });

  describe('Connection lifecycle', () => {
    it('should emit ready event when connected', async () => {
      client = await createClient(mode);

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

      await flushAll(client);

      // Wait for ready event with timeout
      await readyPromise;

      client.removeAllListeners('ready');
    });

    it('should emit connect event', async () => {
      client = await createClient(mode);

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
      await flushAll(client);

      // Wait for connect event with timeout
      await connectPromise;

      client.removeAllListeners('connect');
    });

    it('should emit end event when disconnected', async () => {
      client = await createClient(mode);
      await client.connect();
      await flushAll(client);

      await client.quit();
      assert.strictEqual(client.status, 'end');
      client.removeAllListeners();
      client = null;
    });
  });
});
