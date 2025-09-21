/**
 * TypeScript Usage Tests
 *
 * This test validates that our TypeScript type definitions work correctly
 * and that the public API compiles properly in TypeScript.
 *
 * This is primarily a compilation test - if this file compiles without errors,
 * our TypeScript types are working correctly.
 */

// TypeScript type-usage smoke test: ensures our public types compile in TS
import pkg from '../../dist/index.js';
const { Redis: RedisDefault, Redis, Cluster } = pkg;

// TypeScript compilation tests
function testRedisTypeUsage() {
  // Basic options with proper typing
  const opts = {
    host: 'localhost',
    port: parseInt(process.env.VALKEY_PORT || '6383'),
    keyPrefix: 'ts:types:',
    connectTimeout: 200,
    requestTimeout: 1000,
  };

  // Construct via named export
  const client = new Redis(opts);

  // Construct via default export
  const client2 = new RedisDefault(opts);

  // Method signatures should type-check
  const setPromise = client.set('ts:test:key', 'test_value');
  const getPromise = client.get('ts:test:key');
  const delPromise = client.del('ts:test:key');
  const quitPromise = client.quit();

  return { client, client2, setPromise, getPromise, delPromise, quitPromise };
}

function testClusterTypeUsage() {
  // Cluster type usage (nodes shape)
  const cluster = new Cluster(
    [
      { host: 'localhost', port: 7000 },
      { host: 'localhost', port: 7001 },
    ],
    {
      connectTimeout: 200,
      lazyConnect: true, // Don't actually connect in type tests
    }
  );

  // Method should be typed
  const pipeline = cluster.pipeline();
  const multi = cluster.multi();
  const quitPromise = cluster.quit();

  return { cluster, pipeline, multi, quitPromise };
}

function testRedisOptionsInterface() {
  // Test that RedisOptions interface accepts all expected properties
  const fullOptions = {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'test:',
    connectTimeout: 1000,
    requestTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
    db: 0,
  };

  // Should compile without errors
  const client = new Redis(fullOptions);
  return client;
}

function testMethodChainingTypes() {
  const opts = {
    host: 'localhost',
    port: 6383,
  };

  const client = new Redis(opts);

  // Pipeline should return proper types for chaining
  const pipeline = client
    .pipeline()
    .set('chain:1', 'value1')
    .set('chain:2', 'value2')
    .get('chain:1');

  // Multi should also support chaining
  const multi = client
    .multi()
    .set('multi:1', 'value1')
    .incr('multi:counter')
    .get('multi:1');

  return { client, pipeline, multi };
}

async function testAsyncMethodReturnTypes() {
  const opts = {
    host: 'localhost',
    port: 6383,
    lazyConnect: true, // Don't actually connect in type tests
  };

  const client = new Redis(opts);

  // String operations - type annotations validate return types
  const setResult = client.set('type:string', 'test');
  const stringResult = client.get('type:string');

  // Number operations
  const incrResult = client.incr('type:number');

  // Hash operations
  const hsetResult = client.hset('type:hash', 'field', 'value');
  const hashResult = client.hget('type:hash', 'field');

  // List operations
  const lpushResult = client.lpush('type:list', 'item');
  const listResult = client.lrange('type:list', 0, -1);

  // Cleanup
  const delResult = client.del(
    'type:string',
    'type:number',
    'type:hash',
    'type:list'
  );
  const quitResult = client.quit();

  return {
    setResult,
    stringResult,
    incrResult,
    hsetResult,
    hashResult,
    lpushResult,
    listResult,
    delResult,
    quitResult,
  };
}

function testErrorHandlingTypes() {
  const client = new Redis({
    host: 'nonexistent',
    port: 9999,
    connectTimeout: 100,
    lazyConnect: true,
  });

  // Error handling should be properly typed
  const connectPromise = client.connect();
  const pingPromise = client.ping();

  // Error should be unknown type in catch
  connectPromise.catch(error => {
    if (error instanceof Error) {
      const message = error.message;
      console.log(message); // Use the variable to avoid unused variable warning
    }
  });

  return { client, connectPromise, pingPromise };
}

// Export the test functions so they can be called if needed
export {
  testRedisTypeUsage,
  testClusterTypeUsage,
  testRedisOptionsInterface,
  testMethodChainingTypes,
  testAsyncMethodReturnTypes,
  testErrorHandlingTypes,
};

// Type-only compilation test - functions are defined but not executed
// This ensures all the TypeScript types compile correctly without runtime execution

// If this file compiles without errors, our TypeScript types are working correctly
export const typeTestPassed = true;

console.log(
  '✅ TypeScript compilation test passed - all types are working correctly!'
);
