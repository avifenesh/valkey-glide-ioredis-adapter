import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { BaseClient } from '../BaseClient';

export async function lpush(client: BaseClient, key: RedisKey, ...args: any[]): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Handle both spread and array forms
  let values: RedisValue[];
  if (args.length === 1 && Array.isArray(args[0])) {
    values = args[0];
  } else {
    values = args;
  }

  const normalizedValues = values.map(ParameterTranslator.normalizeValue);
  return await (client as any).glideClient.lpush(normalizedKey, normalizedValues);
}

export async function rpush(client: BaseClient, key: RedisKey, ...args: any[]): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Handle both spread and array forms
  let values: RedisValue[];
  if (args.length === 1 && Array.isArray(args[0])) {
    values = args[0];
  } else {
    values = args;
  }

  const normalizedValues = values.map(ParameterTranslator.normalizeValue);
  return await (client as any).glideClient.rpush(normalizedKey, normalizedValues);
}

export async function lpop(client: BaseClient, key: RedisKey, count?: number): Promise<string | string[] | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  if (count !== undefined) {
    const results = await (client as any).glideClient.lpopCount(normalizedKey, count);
    return results
      ? results.map((r: any) => ParameterTranslator.convertGlideString(r) || '')
      : null;
  } else {
    const result = await (client as any).glideClient.lpop(normalizedKey);
    return ParameterTranslator.convertGlideString(result);
  }
}

export async function rpop(client: BaseClient, key: RedisKey, count?: number): Promise<string | string[] | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  if (count !== undefined) {
    const results = await (client as any).glideClient.rpopCount(normalizedKey, count);
    return results
      ? results.map((r: any) => ParameterTranslator.convertGlideString(r) || '')
      : null;
  } else {
    const result = await (client as any).glideClient.rpop(normalizedKey);
    return ParameterTranslator.convertGlideString(result);
  }
}

export async function llen(client: BaseClient, key: RedisKey): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.llen(normalizedKey);
}

export async function lrange(client: BaseClient, key: RedisKey, start: number, stop: number): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const results = await (client as any).glideClient.lrange(normalizedKey, start, stop);
  return results.map((r: any) => ParameterTranslator.convertGlideString(r) || '');
}

export async function ltrim(client: BaseClient, key: RedisKey, start: number, stop: number): Promise<string> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  await (client as any).glideClient.ltrim(normalizedKey, start, stop);
  return 'OK';
}

export async function lindex(client: BaseClient, key: RedisKey, index: number): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.lindex(normalizedKey, index);
  return ParameterTranslator.convertGlideString(result);
}

export async function lset(client: BaseClient, key: RedisKey, index: number, value: RedisValue): Promise<string> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedValue = ParameterTranslator.normalizeValue(value);
  await (client as any).glideClient.lset(normalizedKey, index, normalizedValue);
  return 'OK';
}

export async function lrem(client: BaseClient, key: RedisKey, count: number, value: RedisValue): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedValue = ParameterTranslator.normalizeValue(value);
  return await (client as any).glideClient.lrem(normalizedKey, count, normalizedValue);
}

export async function linsert(
  client: BaseClient,
  key: RedisKey,
  direction: 'BEFORE' | 'AFTER',
  pivot: RedisValue,
  element: RedisValue
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedPivot = ParameterTranslator.normalizeValue(pivot);
  const normalizedElement = ParameterTranslator.normalizeValue(element);
  const insertPosition = direction === 'BEFORE' ? 'before' : 'after';
  return await (client as any).glideClient.linsert(
    normalizedKey,
    insertPosition as any,
    normalizedPivot,
    normalizedElement
  );
}

export async function rpoplpush(
  client: BaseClient,
  source: RedisKey,
  destination: RedisKey
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedSource = (client as any).normalizeKey(source);
  const normalizedDest = (client as any).normalizeKey(destination);
  const result = await (client as any).glideClient.customCommand([
    'RPOPLPUSH',
    normalizedSource,
    normalizedDest,
  ]);
  return ParameterTranslator.convertGlideString(result);
}

export async function lpos(
  client: BaseClient,
  key: RedisKey,
  element: RedisValue,
  rank?: number,
  count?: number,
  maxlen?: number
): Promise<number | number[] | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedElement = ParameterTranslator.normalizeValue(element);
  
  const args: any[] = [normalizedKey, normalizedElement];
  if (rank !== undefined) args.push('RANK', rank);
  if (count !== undefined) args.push('COUNT', count);
  if (maxlen !== undefined) args.push('MAXLEN', maxlen);
  
  const result = await (client as any).glideClient.customCommand(['LPOS', ...args]);
  return result as number | number[] | null;
}

export async function lmove(
  client: BaseClient,
  source: RedisKey,
  destination: RedisKey,
  from: 'LEFT' | 'RIGHT',
  to: 'LEFT' | 'RIGHT'
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedSource = (client as any).normalizeKey(source);
  const normalizedDest = (client as any).normalizeKey(destination);
  const result = await (client as any).glideClient.customCommand([
    'LMOVE',
    normalizedSource,
    normalizedDest,
    from,
    to,
  ]);
  return ParameterTranslator.convertGlideString(result);
}

export async function blmove(
  client: BaseClient,
  source: RedisKey,
  destination: RedisKey,
  from: 'LEFT' | 'RIGHT',
  to: 'LEFT' | 'RIGHT',
  timeout: number
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedSource = (client as any).normalizeKey(source);
  const normalizedDest = (client as any).normalizeKey(destination);
  const result = await (client as any).glideClient.customCommand([
    'BLMOVE',
    normalizedSource,
    normalizedDest,
    from,
    to,
    String(timeout),
  ]);
  return ParameterTranslator.convertGlideString(result);
}

export async function lpushx(
  client: BaseClient,
  key: RedisKey,
  ...elements: RedisValue[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedValues = elements.map(ParameterTranslator.normalizeValue);
  // Use customCommand for compatibility
  const result = await ((client as any).glideClient as any).customCommand([
    'LPUSHX',
    normalizedKey,
    ...normalizedValues,
  ]);
  return Number(result) || 0;
}

export async function rpushx(
  client: BaseClient,
  key: RedisKey,
  ...elements: RedisValue[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedValues = elements.map(ParameterTranslator.normalizeValue);
  const result = await ((client as any).glideClient as any).customCommand([
    'RPUSHX',
    normalizedKey,
    ...normalizedValues,
  ]);
  return Number(result) || 0;
}