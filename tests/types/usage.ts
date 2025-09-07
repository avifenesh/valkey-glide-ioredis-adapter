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
import RedisDefault, {
  Redis,
  Cluster,
  RedisOptions,
} from '../../dist/index.js';

// TypeScript compilation tests
function testRedisTypeUsage() {
  // Basic options with proper typing
  const opts: RedisOptions = {
    host: 'localhost',
    port: parseInt(process.env.VALKEY_PORT || '6383'),
    keyPrefix: 'ts:types:',
    connectTimeout: 200,
    requestTimeout: 1000,
  };

  // Construct via named export
  const client: Redis = new Redis(opts);

  // Construct via default export
  const client2: Redis = new RedisDefault(opts);

  // Method signatures should type-check
  const setPromise: Promise<string | null> = client.set(
    'ts:test:key',
    'test_value'
  );
  const getPromise: Promise<string | null> = client.get('ts:test:key');
  const delPromise: Promise<number> = client.del('ts:test:key');
  const quitPromise: Promise<void> = client.quit();

  return { client, client2, setPromise, getPromise, delPromise, quitPromise };
}

function testClusterTypeUsage() {
  // Cluster type usage (nodes shape)
  const cluster: Cluster = new Cluster(
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
  const quitPromise: Promise<void> = cluster.quit();

  return { cluster, pipeline, multi, quitPromise };
}

function testRedisOptionsInterface() {
  // Test that RedisOptions interface accepts all expected properties
  const fullOptions: RedisOptions = {
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
  const client: Redis = new Redis(fullOptions);
  return client;
}

function testMethodChainingTypes() {
  const opts: RedisOptions = {
    host: 'localhost',
    port: 6383,
  };

  const client: Redis = new Redis(opts);

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
  const opts: RedisOptions = {
    host: 'localhost',
    port: 6383,
    lazyConnect: true, // Don't actually connect in type tests
  };

  const client: Redis = new Redis(opts);

  // String operations - type annotations validate return types
  const setResult: Promise<string | null> = client.set('type:string', 'test');
  const stringResult: Promise<string | null> = client.get('type:string');

  // Number operations
  const incrResult: Promise<number> = client.incr('type:number');

  // Hash operations
  const hsetResult: Promise<number> = client.hset(
    'type:hash',
    'field',
    'value'
  );
  const hashResult: Promise<string | null> = client.hget('type:hash', 'field');

  // List operations
  const lpushResult: Promise<number> = client.lpush('type:list', 'item');
  const listResult: Promise<string[]> = client.lrange('type:list', 0, -1);

  // Cleanup
  const delResult: Promise<number> = client.del(
    'type:string',
    'type:number',
    'type:hash',
    'type:list'
  );
  const quitResult: Promise<void> = client.quit();

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
  const client: Redis = new Redis({
    host: 'nonexistent',
    port: 9999,
    connectTimeout: 100,
    lazyConnect: true,
  });

  // Error handling should be properly typed
  const connectPromise: Promise<void> = client.connect();
  const pingPromise: Promise<string> = client.ping();

  // Error should be unknown type in catch
  connectPromise.catch((error: unknown) => {
    if (error instanceof Error) {
      const message: string = error.message;
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
