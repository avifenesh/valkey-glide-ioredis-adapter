import { BaseClient } from '../BaseClient';
import { RedisKey } from '../types';

export async function geoadd(
  client: BaseClient,
  key: RedisKey,
  ...args: Array<string | number>
): Promise<number> {
  const normalizedKey = (client as any).normalizeKey(key);
  const map = new Map<string, { longitude: number; latitude: number }>();
  for (let i = 0; i < args.length; i += 3) {
    const lon = Number(args[i]);
    const lat = Number(args[i + 1]);
    const member = String(args[i + 2]);
    map.set(member, { longitude: lon, latitude: lat });
  }
  const result = await (client as any).glideClient.geoadd(normalizedKey, map);
  return Number(result) || 0;
}

export async function geopos(
  client: BaseClient,
  key: RedisKey,
  ...members: string[]
): Promise<([number, number] | null)[]> {
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.geopos(normalizedKey, members);
}

export async function geodist(
  client: BaseClient,
  key: RedisKey,
  member1: string,
  member2: string,
  unit?: 'm' | 'km' | 'mi' | 'ft'
): Promise<string | null> {
  const normalizedKey = (client as any).normalizeKey(key);
  const options: any = {};
  if (unit) options.unit = unit;
  const res = await (client as any).glideClient.geodist(
    normalizedKey,
    member1,
    member2,
    options
  );
  return res === null || res === undefined ? null : String(res);
}

export async function geohash(
  client: BaseClient,
  key: RedisKey,
  ...members: string[]
): Promise<(string | null)[]> {
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.geohash(normalizedKey, members);
}

export async function geosearch(
  client: BaseClient,
  key: RedisKey,
  from: { member?: string; longitude?: number; latitude?: number },
  by: {
    radius?: number;
    unit?: 'm' | 'km' | 'mi' | 'ft';
    width?: number;
    height?: number;
  },
  options?: {
    withCoord?: boolean;
    withDist?: boolean;
    withHash?: boolean;
    count?: number;
    any?: boolean;
    order?: 'ASC' | 'DESC';
  }
): Promise<any[]> {
  const normalizedKey = (client as any).normalizeKey(key);
  let origin: any;
  if (from.member) origin = { member: from.member };
  else if (from.longitude !== undefined && from.latitude !== undefined)
    origin = {
      position: { longitude: from.longitude, latitude: from.latitude },
    };
  else throw new Error('Invalid geosearch origin');
  let shape: any;
  if (by.radius !== undefined && by.unit)
    shape = { radius: by.radius, unit: by.unit };
  else if (by.width !== undefined && by.height !== undefined && by.unit)
    shape = { width: by.width, height: by.height, unit: by.unit };
  else throw new Error('Invalid geosearch shape');
  const resultOptions: any = {};
  if (options?.withCoord) resultOptions.withCoord = true;
  if (options?.withDist) resultOptions.withDist = true;
  if (options?.withHash) resultOptions.withHash = true;
  if (options?.count !== undefined) {
    resultOptions.count = options.count;
    resultOptions.isAny = !!options.any;
  }
  if (options?.order) resultOptions.sortOrder = options.order;
  const res = await (client as any).glideClient.geosearch(
    normalizedKey,
    origin,
    shape,
    resultOptions
  );
  return res.map((row: any) => row);
}

export async function geosearchstore(
  client: BaseClient,
  destination: RedisKey,
  source: RedisKey,
  from: { member?: string; longitude?: number; latitude?: number },
  by: {
    radius?: number;
    unit?: 'm' | 'km' | 'mi' | 'ft';
    width?: number;
    height?: number;
  },
  options?: {
    order?: 'ASC' | 'DESC';
    count?: number;
    any?: boolean;
    storeDist?: boolean;
  }
): Promise<number> {
  const dest = (client as any).normalizeKey(destination);
  const src = (client as any).normalizeKey(source);
  let origin: any;
  if (from.member) origin = { member: from.member };
  else if (from.longitude !== undefined && from.latitude !== undefined)
    origin = {
      position: { longitude: from.longitude, latitude: from.latitude },
    };
  else throw new Error('Invalid geosearchstore origin');
  let shape: any;
  if (by.radius !== undefined && by.unit)
    shape = { radius: by.radius, unit: by.unit };
  else if (by.width !== undefined && by.height !== undefined && by.unit)
    shape = { width: by.width, height: by.height, unit: by.unit };
  else throw new Error('Invalid geosearchstore shape');
  const storeOptions: any = {};
  if (options?.order) storeOptions.sortOrder = options.order;
  if (options?.count !== undefined) {
    storeOptions.count = options.count;
    storeOptions.isAny = !!options.any;
  }
  if (options?.storeDist) storeOptions.storeDist = true;
  const res = await (client as any).glideClient.geosearchstore(
    dest,
    src,
    origin,
    shape,
    storeOptions
  );
  return Number(res) || 0;
}


