import { BaseClient } from '../BaseClient';
import { RedisKey } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';

export async function del(client: BaseClient, ...keys: RedisKey[]): Promise<number> {
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  const result = await (client as any).glideClient.del(normalizedKeys);
  return Number(result);
}

export async function exists(client: BaseClient, ...keys: RedisKey[]): Promise<number> {
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  const result = await (client as any).glideClient.exists(normalizedKeys);
  return Number(result);
}

export async function persist(client: BaseClient, key: RedisKey): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.persist(normalizedKey);
  return result ? 1 : 0;
}

export async function type(client: BaseClient, key: RedisKey): Promise<string> {
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.type(normalizedKey);
}

export async function unlink(client: BaseClient, ...keys: RedisKey[]): Promise<number> {
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  const result = await (client as any).glideClient.customCommand(['UNLINK', ...normalizedKeys]);
  return Number(result) || 0;
}

export async function touch(client: BaseClient, ...keys: RedisKey[]): Promise<number> {
  const normalizedKeys = keys.map(k => (client as any).normalizeKey(k));
  const result = await (client as any).glideClient.customCommand(['TOUCH', ...normalizedKeys]);
  return Number(result) || 0;
}

export async function rename(client: BaseClient, key: RedisKey, newKey: RedisKey): Promise<string> {
  const src = (client as any).normalizeKey(key);
  const dest = (client as any).normalizeKey(newKey);
  const result = await (client as any).glideClient.customCommand(['RENAME', src, dest]);
  return ParameterTranslator.convertGlideString(result) || 'OK';
}

export async function renamenx(client: BaseClient, key: RedisKey, newKey: RedisKey): Promise<number> {
  const src = (client as any).normalizeKey(key);
  const dest = (client as any).normalizeKey(newKey);
  const result = await (client as any).glideClient.customCommand(['RENAMENX', src, dest]);
  return Number(result) || 0;
}

export async function move(client: BaseClient, key: RedisKey, db: number): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.customCommand(['MOVE', normalizedKey, String(db)]);
  return Number(result) || 0;
}

export async function expireat(client: BaseClient, key: RedisKey, unixSeconds: number): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.customCommand(['EXPIREAT', normalizedKey, String(unixSeconds)]);
  return Number(result) || 0;
}

export async function pexpireat(client: BaseClient, key: RedisKey, unixMs: number): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.customCommand(['PEXPIREAT', normalizedKey, String(unixMs)]);
  return Number(result) || 0;
}

export async function randomkey(client: BaseClient): Promise<string | null> {
  const result = await (client as any).glideClient.customCommand(['RANDOMKEY']);
  return ParameterTranslator.convertGlideString(result);
}

export async function copy(
  client: BaseClient,
  source: RedisKey,
  destination: RedisKey,
  options?: { db?: number; replace?: boolean }
): Promise<number> {
  const src = (client as any).normalizeKey(source);
  const dest = (client as any).normalizeKey(destination);
  const args: string[] = ['COPY', src, dest];
  if (options?.db !== undefined) {
    args.push('DB', String(options.db));
  }
  if (options?.replace) {
    args.push('REPLACE');
  }
  const result = await (client as any).glideClient.customCommand(args);
  return Number(result) || 0;
}


