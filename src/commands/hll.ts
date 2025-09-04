import { BaseClient } from '../BaseClient';
import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';

export async function pfadd(
  client: BaseClient,
  key: RedisKey,
  ...elements: RedisValue[]
): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const normalized = elements.map(e => ParameterTranslator.normalizeValue(e));
  const result = await (client as any).glideClient.customCommand([
    'PFADD',
    normalizedKey,
    ...normalized,
  ]);
  return Number(result) || 0;
}

export async function pfcount(
  client: BaseClient,
  ...keys: RedisKey[]
): Promise<number> {
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  const result = await (client as any).glideClient.customCommand([
    'PFCOUNT',
    ...normalizedKeys,
  ]);
  return Number(result) || 0;
}

export async function pfmerge(
  client: BaseClient,
  destkey: RedisKey,
  ...sourceKeys: RedisKey[]
): Promise<'OK'> {
  const dest = (client as any).normalizeKey(destkey);
  const sources = sourceKeys.map(k => (client as any).normalizeKey(k));
  const result = await (client as any).glideClient.customCommand([
    'PFMERGE',
    dest,
    ...sources,
  ]);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

