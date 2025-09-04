import { BaseClient } from '../BaseClient';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { RedisKey, RedisValue } from '../types';

// Maintain a per-client script cache similar to ioredis behavior
// Map<BaseClient, Map<SHA1, { script: any; source: string }>>
const scriptCaches = new WeakMap<
  BaseClient,
  Map<string, { script: any; source: string }>
>();

function getCache(client: BaseClient) {
  let cache = scriptCaches.get(client);
  if (!cache) {
    cache = new Map();
    scriptCaches.set(client, cache);
  }
  return cache;
}

function sha1(text: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(text).digest('hex');
}

export async function evalScript(
  client: BaseClient,
  script: string,
  numKeys: number,
  ...keysAndArgs: any[]
): Promise<any> {
  const { Script } = require('@valkey/valkey-glide');

  const keys = keysAndArgs
    .slice(0, numKeys)
    .map((k: RedisKey) => (client as any).normalizeKey(k));
  const args = keysAndArgs
    .slice(numKeys)
    .map((v: RedisValue) => ParameterTranslator.normalizeValue(v));

  const glideScript = new Script(script);

  const id = sha1(script);
  getCache(client).set(id, { script: glideScript, source: script });

  return await (client as any).glideClient.invokeScript(glideScript, {
    keys,
    args,
  });
}

export async function evalsha(
  client: BaseClient,
  sha1sum: string,
  numKeys: number,
  ...keysAndArgs: any[]
): Promise<any> {
  const cache = getCache(client);

  const keys = keysAndArgs
    .slice(0, numKeys)
    .map((k: RedisKey) => (client as any).normalizeKey(k));
  const args = keysAndArgs
    .slice(numKeys)
    .map((v: RedisValue) => ParameterTranslator.normalizeValue(v));

  if (cache.has(sha1sum)) {
    const cached = cache.get(sha1sum)!;
    return await (client as any).glideClient.invokeScript(cached.script, {
      keys,
      args,
    });
  } else {
    throw new Error('NOSCRIPT No matching script. Please use EVAL.');
  }
}

export async function scriptLoad(
  client: BaseClient,
  script: string
): Promise<string> {
  const { Script } = require('@valkey/valkey-glide');
  const id = sha1(script);
  const glideScript = new Script(script);
  getCache(client).set(id, { script: glideScript, source: script });
  return id;
}

export async function scriptExists(
  client: BaseClient,
  ...sha1s: string[]
): Promise<number[]> {
  if ((client as any).glideClient.scriptExists) {
    const res = await (client as any).glideClient.scriptExists(sha1s);
    return res.map((b: boolean) => (b ? 1 : 0));
  }
  const result = await (client as any).glideClient.customCommand([
    'SCRIPT',
    'EXISTS',
    ...sha1s,
  ]);
  return Array.isArray(result) ? result.map((n: any) => Number(n)) : [];
}

export async function scriptFlush(
  client: BaseClient,
  mode?: 'SYNC' | 'ASYNC'
): Promise<string> {
  if ((client as any).glideClient.scriptFlush) {
    const { FlushMode } = require('@valkey/valkey-glide');
    const m = mode === 'ASYNC' ? FlushMode.ASYNC : FlushMode.SYNC;
    const res = await (client as any).glideClient.scriptFlush(m);
    return res || 'OK';
  }
  const result = await (client as any).glideClient.customCommand([
    'SCRIPT',
    'FLUSH',
    ...(mode ? [mode] : []),
  ]);
  return ParameterTranslator.convertGlideString(result) || 'OK';
}

export async function scriptKill(client: BaseClient): Promise<string> {
  if ((client as any).glideClient.scriptKill) {
    const res = await (client as any).glideClient.scriptKill();
    return res || 'OK';
  }
  const result = await (client as any).glideClient.customCommand([
    'SCRIPT',
    'KILL',
  ]);
  return ParameterTranslator.convertGlideString(result) || 'OK';
}

export async function script(
  client: BaseClient,
  subcommand: string,
  ...args: any[]
): Promise<any> {
  return await (client as any).glideClient.customCommand([
    'SCRIPT',
    subcommand,
    ...args.map(String),
  ]);
}

