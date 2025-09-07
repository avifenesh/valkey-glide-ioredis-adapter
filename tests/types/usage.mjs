import { describe, it, test, beforeEach, afterEach, beforeAll, afterAll } from 'node:test';
import assert from 'node:assert';
// TypeScript type-usage smoke test: ensures our public types compile in TS
import RedisDefault, { Redis, Cluster, RedisOptions } from '../../dist.js';

// Basic options
const opts = {
  host: 'localhost',
  port: parseInt(process.env.VALKEY_PORT || "6383"),
  keyPrefix: 'ts:types:',
  connectTimeout: 200,
  requestTimeout: 1000,
};

// Construct via named export
const client = new Redis(opts);
// Construct via default export
const client2 = new RedisDefault(opts);

// Cluster type usage (nodes shape)
const cluster = new Cluster(
  [
    { host: 'localhost', port: 7000 },
    { host: 'localhost', port: 7001 },
  ],
  { connectTimeout: 200 }
);

async function tsSmoke() {
  // Method signatures should type-check
  await client.set('k', 'v');
  const v = await client.get('k');
  if (v !== null) {
    await client.del('k');
  }
  await client.quit();
  await cluster.quit();
}

tsSmoke();
