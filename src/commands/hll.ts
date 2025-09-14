import { BaseClient } from '../BaseClient';
import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';

export async function pfadd(
  client: BaseClient,
  key: RedisKey,
  ...elements: RedisValue[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalized = elements.map(e => ParameterTranslator.normalizeValue(e));
  const ok: boolean = await (client as any).callWithTimeout(
    (client as any).glideClient.pfadd(normalizedKey, normalized),
    'PFADD'
  );
  // ioredis returns 1 if modified/created, 0 otherwise
  return ok ? 1 : 0;
}

export async function pfcount(
  client: BaseClient,
  ...keys: RedisKey[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  return await (client as any).callWithTimeout(
    (client as any).glideClient.pfcount(normalizedKeys),
    'PFCOUNT'
  );
}

export async function pfmerge(
  client: BaseClient,
  destkey: RedisKey,
  ...sourceKeys: RedisKey[]
): Promise<'OK'> {
  await (client as any).ensureConnection();
  const dest = (client as any).normalizeKey(destkey);
  const sources = sourceKeys.map(k => (client as any).normalizeKey(k));
  return await (client as any).callWithTimeout(
    (client as any).glideClient.pfmerge(dest, sources),
    'PFMERGE'
  );
}
