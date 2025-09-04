import { BaseClient } from '../BaseClient';
import { RedisKey } from '../types';
import { BitwiseOperation } from '@valkey/valkey-glide';

export async function setbit(
  client: BaseClient,
  key: RedisKey,
  offset: number,
  value: number
): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.setbit(
    normalizedKey,
    offset,
    value
  );
  return Number(result);
}

export async function getbit(
  client: BaseClient,
  key: RedisKey,
  offset: number
): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.getbit(normalizedKey, offset);
  return Number(result);
}

export async function bitcount(
  client: BaseClient,
  key: RedisKey,
  start?: number,
  end?: number
): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  if (start !== undefined && end !== undefined) {
    const result = await (client as any).glideClient.bitcount(normalizedKey, {
      start,
      end,
    });
    return Number(result);
  } else {
    const result = await (client as any).glideClient.bitcount(normalizedKey);
    return Number(result);
  }
}

export async function bitpos(
  client: BaseClient,
  key: RedisKey,
  bit: number,
  start?: number,
  end?: number
): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  if (start === undefined) {
    return await (client as any).glideClient.bitpos(normalizedKey, bit);
  }
  const options: any = { start };
  if (end !== undefined) options.end = end;
  return await (client as any).glideClient.bitpos(normalizedKey, bit, options);
}

export async function bitop(
  client: BaseClient,
  operation: 'AND' | 'OR' | 'XOR' | 'NOT',
  destkey: RedisKey,
  ...keys: RedisKey[]
): Promise<number> {
  const normalizedDestKey = (client as any).normalizeKey(destkey);
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  const bitwiseOp = operation as keyof typeof BitwiseOperation;
  const result = await (client as any).glideClient.bitop(
    BitwiseOperation[bitwiseOp],
    normalizedDestKey,
    normalizedKeys
  );
  return Number(result);
}
