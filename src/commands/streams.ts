import { BaseClient } from '../BaseClient';
import { RedisKey } from '../types';

export async function xadd(
  client: BaseClient,
  key: RedisKey,
  ...argsIn: any[]
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Translate ioredis-style args to GLIDE xadd(values, options)
  let i = 0;
  const addOptions: any = {};
  let trimOptions: any | undefined;

  while (i < argsIn.length) {
    const token = String(argsIn[i]).toUpperCase();
    if (token === 'NOMKSTREAM') {
      addOptions.makeStream = false;
      i++;
      continue;
    }
    if (token === 'MAXLEN' || token === 'MINID') {
      const method = token === 'MAXLEN' ? 'maxlen' : 'minid';
      i++;
      let exact = true; // Default to exact trimming when no modifier specified
      if (i < argsIn.length && (argsIn[i] === '=' || argsIn[i] === '~')) {
        exact = argsIn[i] === '=';
        i++;
      }
      const threshold = argsIn[i++];
      let limit: number | undefined;
      if (
        i + 1 < argsIn.length &&
        String(argsIn[i]).toUpperCase() === 'LIMIT'
      ) {
        limit = Number(argsIn[i + 1]);
        i += 2;
      }
      trimOptions = {
        method,
        exact,
        threshold: method === 'maxlen' ? Number(threshold) : String(threshold),
      };
      if (limit !== undefined) trimOptions.limit = limit;
      continue;
    }
    break;
  }

  // ID
  if (i >= argsIn.length)
    throw new Error('XADD requires an ID and field/value pairs');
  const id = String(argsIn[i++]);
  if (id !== '*') addOptions.id = id;

  // Field-value pairs
  const remaining = argsIn.slice(i);
  if (remaining.length % 2 !== 0)
    throw new Error('XADD requires field/value pairs');
  const values: [string, string][] = [];
  for (let j = 0; j < remaining.length; j += 2) {
    values.push([String(remaining[j]), String(remaining[j + 1])]);
  }
  if (trimOptions) addOptions.trim = trimOptions;

  try {
    const result = await (client as any).glideClient.xadd(
      normalizedKey,
      values,
      addOptions
    );
    return result == null ? null : String(result);
  } catch (err: any) {
    // Some servers may reject certain trim+id combinations (e.g., MINID with auto-id)
    // Fallback: perform trim first, then add without trim options
    const msg = String(err?.message || '');
    if (trimOptions && /Invalid stream ID/i.test(msg)) {
      try {
        await (client as any).glideClient.xtrim(normalizedKey, trimOptions);
        // Only pass id if it was explicitly set (not auto-generated)
        const fallbackOptions: any = { makeStream: addOptions.makeStream };
        if (addOptions.id !== undefined) {
          fallbackOptions.id = addOptions.id;
        }
        const result = await (client as any).glideClient.xadd(
          normalizedKey,
          values,
          fallbackOptions
        );
        return result == null ? null : String(result);
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

export async function xlen(client: BaseClient, key: RedisKey): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.xlen(normalizedKey);
}

export async function xread(
  client: BaseClient,
  ...args: any[]
): Promise<any[] | null> {
  await (client as any).ensureConnection();
  const upperArgs = args.map(a =>
    typeof a === 'string' ? a.toUpperCase() : a
  );
  const streamsIndex = upperArgs.indexOf('STREAMS');
  const options: any = {};
  const optsEnd = streamsIndex === -1 ? args.length : streamsIndex;
  for (let i = 0; i < optsEnd; i++) {
    const token = String(upperArgs[i]);
    if (token === 'COUNT' && i + 1 < optsEnd) {
      options.count = Number(args[i + 1]);
      i++;
    } else if (token === 'BLOCK' && i + 1 < optsEnd) {
      options.block = Number(args[i + 1]);
      i++;
    }
  }
  if (streamsIndex === -1) {
    return null;
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

  // Call GLIDE xread directly without timeout race
  // GLIDE handles the blocking internally and will return null on timeout
  const result = await (client as any).glideClient.xread(keysAndIds, options);
  if (result == null) return null;
  const out: any[] = [];
  const pushStream = (name: string, val: any) => {
    let entries: any[] = [];
    for (const [id, pairs] of Object.entries(val as Record<string, any>)) {
      const flat: any[] = Array.isArray(pairs)
        ? (pairs as any[]).flatMap((kv: any[]) => [
            String(kv[0]),
            String(kv[1]),
          ])
        : [];
      entries.push([String(id), flat]);
    }
    // Enforce COUNT semantics: at most N entries per stream
    if (options.count !== undefined) {
      const n = Math.max(0, Number(options.count));
      entries = entries.slice(0, n);
    }
    out.push([name, entries]);
  };
  if (Array.isArray(result)) {
    for (const item of result as any[]) {
      if (
        item &&
        typeof item === 'object' &&
        'key' in item &&
        'value' in item
      ) {
        pushStream(String(item.key), item.value || {});
      }
    }
  } else if (typeof result === 'object') {
    for (const [name, val] of Object.entries(result as Record<string, any>)) {
      pushStream(String(name), val || {});
    }
  }
  return out;
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
  const toId = (v: any, isStart: boolean) => {
    if (typeof v === 'number') {
      const ms = Math.floor(v);
      return isStart ? `${ms}-0` : `${ms}-999999`;
    }
    return String(v);
  };
  // GLIDE expects InfBoundary enum values ('+' and '-') directly for infinite bounds
  // or objects with value and isInclusive for specific bounds
  const startBoundary =
    start === '-'
      ? '-' // InfBoundary.NegativeInfinity
      : { value: toId(start, true), isInclusive: true };
  const endBoundary =
    end === '+'
      ? '+' // InfBoundary.PositiveInfinity
      : { value: toId(end, false), isInclusive: true };
  const options = count !== undefined ? { count } : undefined;
  const result = await (client as any).glideClient.xrange(
    normalizedKey,
    startBoundary,
    endBoundary,
    options
  );
  if (!result) return [];

  // GLIDE returns an object/dictionary: { id: [[field, value], ...], ... }
  // Convert to ioredis format: [[id, [field, value, ...]], ...]
  const entries: any[] = [];
  if (typeof result === 'object' && !Array.isArray(result)) {
    for (const [id, fieldValuePairs] of Object.entries(result)) {
      const pairs = Array.isArray(fieldValuePairs) ? fieldValuePairs : [];
      const flat = pairs.flatMap((kv: any[]) => [String(kv[0]), String(kv[1])]);
      entries.push([String(id), flat]);
    }
  } else if (Array.isArray(result)) {
    // Fallback for array format if GLIDE changes
    return (result as any[]).map((entry: any) => {
      const id = String(entry[0]);
      const pairs = Array.isArray(entry[1]) ? entry[1] : [];
      const flat = pairs.flatMap((kv: any[]) => [String(kv[0]), String(kv[1])]);
      return [id, flat];
    });
  }
  return entries;
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
  const toId = (v: any, isStart: boolean) => {
    if (typeof v === 'number') {
      const ms = Math.floor(v);
      return isStart ? `${ms}-999999` : `${ms}-0`;
    }
    return String(v);
  };
  // GLIDE expects InfBoundary enum values ('+' and '-') directly for infinite bounds
  const startBoundary =
    start === '+'
      ? '+' // InfBoundary.PositiveInfinity
      : { value: toId(start, true), isInclusive: true };
  const endBoundary =
    end === '-'
      ? '-' // InfBoundary.NegativeInfinity
      : { value: toId(end, false), isInclusive: true };
  const options = count !== undefined ? { count } : undefined;
  try {
    const result = await (client as any).glideClient.xrevrange(
      normalizedKey,
      startBoundary,
      endBoundary,
      options
    );
    if (!result) return [];

    // GLIDE returns an object/dictionary: { id: [[field, value], ...], ... }
    // Convert to ioredis format: [[id, [field, value, ...]], ...]
    const entries: any[] = [];
    if (typeof result === 'object' && !Array.isArray(result)) {
      for (const [id, fieldValuePairs] of Object.entries(result)) {
        const pairs = Array.isArray(fieldValuePairs) ? fieldValuePairs : [];
        const flat = pairs.flatMap((kv: any[]) => [
          String(kv[0]),
          String(kv[1]),
        ]);
        entries.push([String(id), flat]);
      }
    } else if (Array.isArray(result)) {
      // Fallback for array format if GLIDE changes
      return (result as any[]).map((entry: any) => {
        const id = String(entry[0]);
        const pairs = Array.isArray(entry[1]) ? entry[1] : [];
        const flat = pairs.flatMap((kv: any[]) => [
          String(kv[0]),
          String(kv[1]),
        ]);
        return [id, flat];
      });
    }
    return entries;
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
  return await (client as any).glideClient.xdel(normalizedKey, ids);
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
  let exact = true; // Default to exact trimming when no modifier specified
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
    // Parse id and MKSTREAM in any order
    let mkstream = false;
    let parsedId: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const tok = String(args[i]).toUpperCase();
      if (tok === 'MKSTREAM') {
        mkstream = true;
        continue;
      }
      if (parsedId === undefined) {
        parsedId = String(args[i]);
      }
    }
    let id = String(parsedId ?? '$');
    if (id === '0') id = '0-0';
    const options: any = {};
    if (mkstream) options.mkStream = true;
    return await (client as any).glideClient.xgroupCreate(
      normalizedKey,
      group,
      id,
      options
    );
  } else if (act === 'DESTROY') {
    const ok: boolean = await (client as any).glideClient.xgroupDestroy(
      normalizedKey,
      group
    );
    return ok ? 1 : 0;
  } else if (act === 'CREATECONSUMER') {
    const consumer = String(args[0]);
    const result = await (client as any).glideClient.xgroupCreateConsumer(
      normalizedKey,
      group,
      consumer
    );
    return result ? 1 : 0;
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
): Promise<any[] | null> {
  await (client as any).ensureConnection();
  // Support ioredis call style: xreadgroup('GROUP', group, consumer, ...)
  if (String(group).toUpperCase() === 'GROUP') {
    const newGroup = String(consumer);
    const newConsumer = String(args[0] ?? '');
    group = newGroup;
    consumer = newConsumer;
    args = args.slice(1);
  }
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
  let result: any;
  if (options.block !== undefined) {
    const blockMs = Math.max(0, Number(options.block));
    result = await Promise.race([
      (client as any).glideClient.xreadgroup(
        group,
        consumer,
        keysAndIds,
        options
      ),
      new Promise(resolve => setTimeout(() => resolve(null), blockMs + 50)),
    ]);
  } else {
    result = await (client as any).glideClient.xreadgroup(
      group,
      consumer,
      keysAndIds,
      options
    );
  }
  if (result == null) return null;
  const out: any[] = [];
  const pushStream = (name: string, val: any) => {
    let entries: any[] = [];
    for (const [id, pairs] of Object.entries(val as Record<string, any>)) {
      if (pairs === null) {
        entries.push([String(id), null]);
      } else if (Array.isArray(pairs)) {
        const flat = (pairs as any[]).flatMap((kv: any[]) => [
          String(kv[0]),
          String(kv[1]),
        ]);
        entries.push([String(id), flat]);
      }
    }
    if (options.count !== undefined) {
      const n = Math.max(0, Number(options.count));
      entries = entries.slice(0, n);
    }
    out.push([name, entries]);
  };
  if (Array.isArray(result)) {
    for (const item of result as any[]) {
      if (
        item &&
        typeof item === 'object' &&
        'key' in item &&
        'value' in item
      ) {
        pushStream(String(item.key), item.value || {});
      }
    }
  } else if (typeof result === 'object') {
    for (const [name, val] of Object.entries(result as Record<string, any>)) {
      pushStream(String(name), val || {});
    }
  }
  return out;
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
  const result = await (client as any).glideClient.xclaim(
    normalizedKey,
    group,
    consumer,
    minIdleTime,
    idList,
    options
  );

  // Convert GLIDE object format to ioredis array format
  // GLIDE returns: { id: [[field, value], ...], ... }
  // ioredis expects: [[id, [field, value, ...]], ...]
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const entries: any[] = [];
    for (const [id, fieldValuePairs] of Object.entries(result)) {
      const pairs = Array.isArray(fieldValuePairs) ? fieldValuePairs : [];
      const flat = pairs.flatMap((kv: any[]) => [String(kv[0]), String(kv[1])]);
      entries.push([String(id), flat]);
    }
    return entries;
  }

  return result;
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
  const result = await (client as any).glideClient.xautoclaim(
    normalizedKey,
    group,
    consumer,
    minIdleTime,
    String(start),
    options
  );

  // Convert GLIDE format to ioredis format
  // GLIDE returns: [nextId, {id: [[field, value], ...], ...}, deletedIds]
  // ioredis expects: [nextId, [[id, [field, value, ...]], ...]]
  if (Array.isArray(result) && result.length >= 2) {
    const [nextId, claimedMessages] = result;

    if (
      claimedMessages &&
      typeof claimedMessages === 'object' &&
      !Array.isArray(claimedMessages)
    ) {
      const entries: any[] = [];
      for (const [id, fieldValuePairs] of Object.entries(claimedMessages)) {
        const pairs = Array.isArray(fieldValuePairs) ? fieldValuePairs : [];
        const flat = pairs.flatMap((kv: any[]) => [
          String(kv[0]),
          String(kv[1]),
        ]);
        entries.push([String(id), flat]);
      }
      return [nextId, entries];
    }
  }

  return result;
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
