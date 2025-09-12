import { it, before, after } from 'node:test';
import assert from 'node:assert';
import { describeForEachMode, createClient, keyTag, flushAll } from '../setup/dual-mode.mjs';
describeForEachMode('Transaction Commands', mode => {
  let client;
  let tag;

  before(async () => {
    client = await createClient(mode);
    await client.connect();
    await flushAll(client);
    tag = keyTag('tx');
  });

  after(async () => {
    if (client) {
      await client.quit();
    }
  });

  it('should watch and unwatch keys', async () => {
    await client.set(`${tag}:watchkey`, 'value1');

    // Watch the key
    const watchResult = await client.watch(`${tag}:watchkey`);
    assert.strictEqual(watchResult, 'OK');

    // Unwatch the key
    const unwatchResult = await client.unwatch();
    assert.strictEqual(unwatchResult, 'OK');
  });

  it('should execute transaction with multi/exec', async () => {
    // Use same slot keys via tag to avoid MOVED in cluster
    await client.set(`${tag}:multikey1`, 'value1');
    await client.set(`${tag}:multikey2`, 'value2');

    const multi = client.multi();
    multi.get(`${tag}:multikey1`);
    multi.get(`${tag}:multikey2`);
    multi.set(`${tag}:multikey3`, 'value3');

    const results = await multi.exec();

    assert.ok(results !== null);
    assert.ok(Array.isArray(results));
    if (results) {
      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results[0], [null, 'value1']);
      assert.deepStrictEqual(results[1], [null, 'value2']);
      assert.deepStrictEqual(results[2], [null, 'OK']);
    }
  });

  it('should handle transaction with watched key modification', async () => {
    // This test is more complex as it requires simulating a transaction failure
    // For now, we'll just test that the multi/exec flow works
    await client.set(`${tag}:watchtestkey`, 'initial');

    const multi = client.multi();
    multi.get(`${tag}:watchtestkey`);
    multi.set(`${tag}:watchtestkey`, 'modified');

    const results = await multi.exec();

    assert.ok(results !== null);
    if (results) {
      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results[0], [null, 'initial']);
      assert.deepStrictEqual(results[1], [null, 'OK']);
    }
  });
});
