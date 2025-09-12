import { BaseClient } from '../BaseClient';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { RedisKey, RedisValue } from '../types';

export async function evalScript(
  client: BaseClient,
  script: string,
  numKeys: number,
  ...keysAndArgs: any[]
): Promise<any> {
  await (client as any).ensureConnection();

  const keys = keysAndArgs
    .slice(0, numKeys)
    .map((k: RedisKey) => (client as any).normalizeKey(k));
  const args = keysAndArgs
    .slice(numKeys)
    .map((v: RedisValue) => ParameterTranslator.normalizeValue(v));

  // Execute using EVAL directly to ensure compatibility across environments
  return await (client as any).glideClient.customCommand([
    'EVAL',
    script,
    String(numKeys),
    ...keys,
    ...args,
  ]);
}

export async function evalsha(
  client: BaseClient,
  sha1sum: string,
  numKeys: number,
  ...keysAndArgs: any[]
): Promise<any> {
  await (client as any).ensureConnection();

  const keys = keysAndArgs
    .slice(0, numKeys)
    .map((k: RedisKey) => (client as any).normalizeKey(k));
  const args = keysAndArgs
    .slice(numKeys)
    .map((v: RedisValue) => ParameterTranslator.normalizeValue(v));

  // Execute using EVALSHA on the server
  try {
    const result = await (client as any).glideClient.customCommand([
      'EVALSHA',
      sha1sum,
      String(numKeys),
      ...keys,
      ...args,
    ]);
    return result;
  } catch (err: any) {
    // If NOSCRIPT error, we already tried cache, so throw
    if (
      err.message &&
      (err.message.includes('NOSCRIPT') || err.message.includes('NoScript'))
    ) {
      throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    }
    throw err;
  }
}

export async function scriptLoad(
  client: BaseClient,
  script: string
): Promise<string> {
  await (client as any).ensureConnection();

  // Load the script on the server and return the SHA1 provided by Valkey/Redis
  const result = await (client as any).glideClient.customCommand([
    'SCRIPT',
    'LOAD',
    script,
  ]);

  return String(result);
}

export async function scriptExists(
  client: BaseClient,
  ...sha1s: string[]
): Promise<number[]> {
  await (client as any).ensureConnection();

  // Use customCommand to ensure consistent behavior
  const result = await (client as any).glideClient.customCommand([
    'SCRIPT',
    'EXISTS',
    ...sha1s,
  ]);

  // Convert boolean or numeric results to numbers (1 or 0)
  if (Array.isArray(result)) {
    return result.map((val: any) => {
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (typeof val === 'number') return val;
      return Number(val) || 0;
    });
  }

  return [];
}

export async function scriptFlush(
  client: BaseClient,
  mode?: 'SYNC' | 'ASYNC'
): Promise<string> {
  await (client as any).ensureConnection();
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
  await (client as any).ensureConnection();
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
  await (client as any).ensureConnection();
  const result = await (client as any).glideClient.customCommand([
    'SCRIPT',
    subcommand,
    ...args.map(String),
  ]);

  // Convert boolean results to 1/0 for EXISTS subcommand
  if (subcommand.toUpperCase() === 'EXISTS' && Array.isArray(result)) {
    return result.map((val: any) => {
      if (typeof val === 'boolean') return val ? 1 : 0;
      return val;
    });
  }

  return result;
}
