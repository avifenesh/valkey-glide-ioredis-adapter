import { BaseClient } from '../BaseClient';
import { RedisKey } from '../types';
import { ConditionalChange } from '@valkey/valkey-glide';

export async function geoadd(
  client: BaseClient,
  key: RedisKey,
  ...args: Array<string | number>
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Support NX | XX | CH flags and standard triple arguments
  // Parse flags
  let updateMode: ConditionalChange | undefined;
  let changed = false;
  let i = 0;
  while (i < args.length) {
    const token = String(args[i]).toUpperCase();
    if (token === 'NX') updateMode = ConditionalChange.ONLY_IF_DOES_NOT_EXIST;
    else if (token === 'XX') updateMode = ConditionalChange.ONLY_IF_EXISTS;
    else if (token === 'CH') changed = true;
    else break;
    i++;
  }

  const remaining = args.slice(i);
  if (remaining.length % 3 !== 0) {
    throw new Error('GEOADD requires longitude latitude member triples');
  }
  const map = new Map<string, { longitude: number; latitude: number }>();
  for (let j = 0; j < remaining.length; j += 3) {
    const lon = Number(remaining[j]);
    const lat = Number(remaining[j + 1]);
    const member = String(remaining[j + 2]);
    map.set(member, { longitude: lon, latitude: lat });
  }
  const options: any = {};
  if (updateMode) options.updateMode = updateMode;
  if (changed) options.changed = true;
  const result = await (client as any).glideClient.geoadd(normalizedKey, map, options);
  return Number(result) || 0;
}

export async function geopos(
  client: BaseClient,
  key: RedisKey,
  ...members: string[]
): Promise<([number, number] | null)[]> {
  await (client as any).ensureConnection();
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
  await (client as any).ensureConnection();
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
  await (client as any).ensureConnection();
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
  await (client as any).ensureConnection();
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
  
  // Format results to match ioredis expectations
  return res.map((row: any) => {
    // If result has additional data (coordinates, distance, hash)
    if (Array.isArray(row) && row.length === 2) {
      const [member, data] = row;
      
      // Handle multiple options (e.g., WITHDIST + WITHCOORD)
      if (Array.isArray(data) && data.length > 1) {
        // Multiple options requested - flatten the result
        const result = [member];
        for (const item of data) {
          if (typeof item === 'number' || typeof item === 'string') {
            // Distance or hash - convert to string
            result.push(String(item));
          } else if (Array.isArray(item)) {
            // Coordinates - keep as array
            result.push(item);
          } else {
            result.push(item);
          }
        }
        return result;
      }
      
      // Fix single data format
      if (Array.isArray(data) && data.length === 1) {
        const value = data[0];
        
        // Coordinates: [[lon, lat]] -> [lon, lat]
        if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
          return [member, value];
        }
        
        // Distance or Hash: [value] -> "value" (as string)
        if (typeof value === 'number' || typeof value === 'string') {
          return [member, String(value)];
        }
      }
      
      // Keep other formats as-is
      return row;
    }
    
    return row;
  });
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
  await (client as any).ensureConnection();
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
