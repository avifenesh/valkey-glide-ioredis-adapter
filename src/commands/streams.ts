import { BaseClient } from '../BaseClient';
import { RedisKey } from '../types';

export async function xadd(
  client: BaseClient,
  key: RedisKey,
  ...argsIn: any[]
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  const cmd: string[] = ['XADD', normalizedKey];
  let i = 0;

  // Parse optional modifiers before ID
  while (i < argsIn.length) {
    const t = String(argsIn[i]);
    const token = t.toUpperCase();

    if (token === 'NOMKSTREAM') {
      cmd.push('NOMKSTREAM');
      i++;
      continue;
    }

    if (token === 'MAXLEN' || token === 'MINID') {
      cmd.push(token);
      i++;
      if (i < argsIn.length) {
        const mod = String(argsIn[i]);
        if (mod === '=' || mod === '~') {
          cmd.push(mod);
          i++;
        }
      }
      if (i < argsIn.length) {
        cmd.push(String(argsIn[i++]));
      }
      if (i + 1 < argsIn.length && String(argsIn[i]).toUpperCase() === 'LIMIT') {
        cmd.push('LIMIT', String(argsIn[i + 1]));
        i += 2;
      }
      continue;
    }

    // First non-modifier token is the ID
    break;
  }

  if (i >= argsIn.length) {
    throw new Error('XADD requires an ID and field/value pairs');
  }

  const id = String(argsIn[i++]);
  cmd.push(id);

  const fields = argsIn.slice(i).map(v => String(v));
  if (fields.length % 2 !== 0) {
    throw new Error('XADD requires field/value pairs');
  }
  cmd.push(...fields);

  const result = await (client as any).glideClient.customCommand(cmd);
  if (result == null) return null;
  return String(result);
}

export async function xlen(client: BaseClient, key: RedisKey): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.xlen(normalizedKey);
}

export async function xread(
  client: BaseClient,
  ...args: any[]
): Promise<any[]> {
  await (client as any).ensureConnection();
  let streamsIndex = args.findIndex(
    arg => String(arg).toUpperCase() === 'STREAMS'
  );
  if (streamsIndex === -1) {
    const result = await (client as any).glideClient.customCommand([
      'XREAD',
      ...args.map(arg => String(arg)),
    ]);
    return Array.isArray(result) ? result : [];
  }

  const streamArgs = args.slice(streamsIndex + 1);
  const streamCount = Math.floor(streamArgs.length / 2);
  const streamNames = streamArgs
    .slice(0, streamCount)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const streamIds = streamArgs.slice(streamCount).map((id: any) => String(id));

  const keysAndIds: Record<string, string> = {};
  const len = Math.min(streamNames.length, streamIds.length);
  for (let i = 0; i < len; i++) {
    const name = streamNames[i];
    const id = streamIds[i];
    if (typeof name !== 'string' || typeof id !== 'string') continue;
    keysAndIds[name] = id;
  }

  const result = await (client as any).glideClient.xread(keysAndIds);
  if (!result || typeof result !== 'object') return [];
  const ioredisResult: any[] = [];
  for (const [streamName, entries] of Object.entries(result)) {
    if (entries && Array.isArray(entries)) {
      ioredisResult.push([streamName, entries]);
    }
  }
  return ioredisResult;
}

export async function xrange(
  client: BaseClient,
  key: RedisKey,
  start: string = '-',
  end: string = '+',
  count?: number
): Promise<any[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const startBoundary =
    start === '-'
      ? { value: '-', isInclusive: false }
      : { value: start, isInclusive: true };
  const endBoundary =
    end === '+'
      ? { value: '+', isInclusive: false }
      : { value: end, isInclusive: true };
  const options = count !== undefined ? { count } : undefined;
  const result = await (client as any).glideClient.xrange(
    normalizedKey,
    startBoundary,
    endBoundary,
    options
  );
  if (!result || !Array.isArray(result)) return [];
  return result;
}

export async function xrevrange(
  client: BaseClient,
  key: RedisKey,
  start: string = '+',
  end: string = '-',
  count?: number
): Promise<any[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const startBoundary =
    start === '+'
      ? { value: '+', isInclusive: false }
      : { value: start, isInclusive: true };
  const endBoundary =
    end === '-'
      ? { value: '-', isInclusive: false }
      : { value: end, isInclusive: true };
  const options = count !== undefined ? { count } : undefined;
  try {
    const result = await (client as any).glideClient.xrevrange(
      normalizedKey,
      startBoundary,
      endBoundary,
      options
    );
    if (!result || !Array.isArray(result)) return [];
    return result;
  } catch {
    const args = ['XREVRANGE', normalizedKey, start, end];
    if (count !== undefined) args.push('COUNT', String(count));
    const result = await (client as any).glideClient.customCommand(args);
    return Array.isArray(result) ? result : [];
  }
}

export async function xdel(
  client: BaseClient,
  key: RedisKey,
  ...ids: string[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.customCommand([
    'XDEL',
    normalizedKey,
    ...ids,
  ]);
  return Number(result) || 0;
}

export async function xtrim(
  client: BaseClient,
  key: RedisKey,
  ...args: any[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  // Parse XTRIM [MAXLEN|MINID] [=|~] threshold [LIMIT count]
  if (args.length === 0) return 0;
  const methodToken = String(args[0]).toUpperCase();
  let exact = false;
  let idx = 1;
  if (idx < args.length) {
    const t = String(args[idx]);
    if (t === '=' || t === '~') {
      exact = t === '=';
      idx++;
    }
  }
  const threshold = args[idx++];
  let limit: number | undefined = undefined;
  if (idx + 1 < args.length && String(args[idx]).toUpperCase() === 'LIMIT') {
    limit = Number(args[idx + 1]);
  }
  const options: any = { exact };
  if (limit !== undefined) options.limit = limit;
  if (methodToken === 'MAXLEN') {
    options.method = 'maxlen';
    options.threshold = Number(threshold);
  } else {
    options.method = 'minid';
    options.threshold = String(threshold);
  }
  return await (client as any).glideClient.xtrim(normalizedKey, options);
}

export async function xgroup(
  client: BaseClient,
  action: string,
  key: RedisKey,
  group: string,
  ...args: (string | number)[]
): Promise<any> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const act = String(action).toUpperCase();
  if (act === 'CREATE') {
    const id = String(args[0] ?? '$');
    const options: any = {};
    // Optional MKSTREAM flag
    if (args.map(a => String(a).toUpperCase()).includes('MKSTREAM')) {
      options.createStream = true;
    }
    return await (client as any).glideClient.xgroupCreate(
      normalizedKey,
      group,
      id,
      options
    );
  } else if (act === 'DESTROY') {
    return await (client as any).glideClient.xgroupDestroy(normalizedKey, group);
  } else if (act === 'CREATECONSUMER') {
    const consumer = String(args[0]);
    return await (client as any).glideClient.xgroupCreateConsumer(
      normalizedKey,
      group,
      consumer
    );
  } else if (act === 'DELCONSUMER') {
    const consumer = String(args[0]);
    return await (client as any).glideClient.xgroupDelConsumer(
      normalizedKey,
      group,
      consumer
    );
  } else if (act === 'SETID') {
    const id = String(args[0] ?? '0');
    // Optional entriesRead via 'ENTRIESREAD n'
    let entriesRead: number | undefined;
    const upper = args.map(a => String(a).toUpperCase());
    const idx = upper.indexOf('ENTRIESREAD');
    if (idx !== -1 && idx + 1 < args.length) {
      entriesRead = Number(args[idx + 1]);
    }
    return await (client as any).glideClient.xgroupSetId(
      normalizedKey,
      group,
      id,
      entriesRead !== undefined ? { entriesRead } : undefined
    );
  }
  throw new Error(`Unsupported XGROUP action: ${action}`);
}

export async function xreadgroup(
  client: BaseClient,
  group: string,
  consumer: string,
  ...args: any[]
): Promise<any[]> {
  await (client as any).ensureConnection();
  let streamsIndex = args.findIndex(
    arg => String(arg).toUpperCase() === 'STREAMS'
  );
  const options: any = {};
  for (let i = 0; i < (streamsIndex === -1 ? args.length : streamsIndex); i++) {
    const token = String(args[i]).toUpperCase();
    if (token === 'COUNT' && i + 1 < args.length) {
      options.count = Number(args[i + 1]);
      i++;
    } else if (token === 'BLOCK' && i + 1 < args.length) {
      options.block = Number(args[i + 1]);
      i++;
    } else if (token === 'NOACK') {
      options.noAck = true;
    }
  }
  if (streamsIndex === -1) {
    const result = await (client as any).glideClient.customCommand([
      'XREADGROUP',
      'GROUP',
      group,
      consumer,
      ...args.map(arg => String(arg)),
    ]);
    return Array.isArray(result) ? result : [];
  }
  const streamArgs = args.slice(streamsIndex + 1);
  const streamCount = Math.floor(streamArgs.length / 2);
  const streamNames = streamArgs
    .slice(0, streamCount)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const streamIds = streamArgs.slice(streamCount).map((id: any) => String(id));
  const keysAndIds: Record<string, string> = {};
  const len = Math.min(streamNames.length, streamIds.length);
  for (let i = 0; i < len; i++) {
    const name = streamNames[i];
    const id = streamIds[i];
    if (typeof name !== 'string' || typeof id !== 'string') continue;
    keysAndIds[name] = id;
  }
  const result = await (client as any).glideClient.xreadgroup(
    group,
    consumer,
    keysAndIds,
    options
  );
  if (!result || typeof result !== 'object') return [];
  const ioredisResult: any[] = [];
  for (const [streamName, entries] of Object.entries(result)) {
    ioredisResult.push([streamName, entries]);
  }
  return ioredisResult;
}

export async function xack(
  client: BaseClient,
  key: RedisKey,
  group: string,
  ...ids: string[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.xack(normalizedKey, group, ids);
}

export async function xclaim(
  client: BaseClient,
  key: RedisKey,
  group: string,
  consumer: string,
  minIdleTime: number,
  ids: string[] | string,
  options?: {
    idle?: number;
    idleUnixTime?: number;
    retryCount?: number;
    isForce?: boolean;
  }
): Promise<any> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const idList = Array.isArray(ids) ? ids : [ids];
  return await (client as any).glideClient.xclaim(
    normalizedKey,
    group,
    consumer,
    minIdleTime,
    idList,
    options
  );
}

export async function xclaimJustId(
  client: BaseClient,
  key: RedisKey,
  group: string,
  consumer: string,
  minIdleTime: number,
  ids: string[] | string,
  options?: {
    idle?: number;
    idleUnixTime?: number;
    retryCount?: number;
    isForce?: boolean;
  }
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const idList = Array.isArray(ids) ? ids : [ids];
  return await (client as any).glideClient.xclaimJustId(
    normalizedKey,
    group,
    consumer,
    minIdleTime,
    idList,
    options
  );
}

export async function xautoclaim(
  client: BaseClient,
  key: RedisKey,
  group: string,
  consumer: string,
  minIdleTime: number,
  start: string,
  count?: number
): Promise<any> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const options: any = {};
  if (count !== undefined) options.count = count;
  return await (client as any).glideClient.xautoclaim(
    normalizedKey,
    group,
    consumer,
    minIdleTime,
    String(start),
    options
  );
}

export async function xautoclaimJustId(
  client: BaseClient,
  key: RedisKey,
  group: string,
  consumer: string,
  minIdleTime: number,
  start: string,
  count?: number
): Promise<[string, string[], string[]?]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const options: any = {};
  if (count !== undefined) options.count = count;
  return await (client as any).glideClient.xautoclaimJustId(
    normalizedKey,
    group,
    consumer,
    minIdleTime,
    String(start),
    options
  );
}

export async function xpending(
  client: BaseClient,
  key: RedisKey,
  group: string,
  ...args: any[]
): Promise<any> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  if (args.length === 0) {
    return await (client as any).glideClient.xpending(normalizedKey, group);
  }
  const { InfBoundary } = require('@valkey/valkey-glide');
  const startRaw = String(args[0]);
  const endRaw = String(args[1]);
  const count = Number(args[2]);
  const consumer = args[3] !== undefined ? String(args[3]) : undefined;
  const start =
    startRaw === '-'
      ? InfBoundary.NegativeInfinity
      : { value: startRaw, isInclusive: true };
  const end =
    endRaw === '+'
      ? InfBoundary.PositiveInfinity
      : { value: endRaw, isInclusive: true };
  const options: any = { start, end, count };
  if (consumer) options.consumer = consumer;
  return await (client as any).glideClient.xpendingWithOptions(
    normalizedKey,
    group,
    options
  );
}

export async function xinfoConsumers(
  client: BaseClient,
  key: RedisKey,
  group: string
): Promise<Record<string, any>[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.xinfoConsumers(normalizedKey, group);
}

export async function xinfoGroups(
  client: BaseClient,
  key: RedisKey
): Promise<Record<string, any>[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.xinfoGroups(normalizedKey);
}

export async function xinfoStream(
  client: BaseClient,
  key: RedisKey,
  full?: boolean | number
): Promise<any> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const options: any = {};
  if (full !== undefined) options.fullOptions = full;
  return await (client as any).glideClient.xinfoStream(normalizedKey, options);
}
