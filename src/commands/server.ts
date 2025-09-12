import { BaseClient } from '../BaseClient';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { asInternal } from '../types/internal';

// Server/Admin and miscellaneous commands

export async function info(
  client: BaseClient,
  section?: string
): Promise<string> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // GlideClient has info(), GlideClusterClient doesn't
  if (!client.isCluster && 'info' in internal.glideClient) {
    if (section) {
      // GlideClient.info() doesn't accept string sections, needs customCommand
      const result = await internal.glideClient.customCommand(['INFO', section]);
      return ParameterTranslator.convertGlideString(result) || '';
    } else {
      const result = await internal.glideClient.info();
      return ParameterTranslator.convertGlideString(result) || '';
    }
  }
  
  // Cluster client or section specified: use customCommand
  const args = section ? ['INFO', section] : ['INFO'];
  const result = await internal.glideClient.customCommand(args);
  return ParameterTranslator.convertGlideString(result) || '';
}

export async function client(
  client: BaseClient,
  subcommand: string,
  ...args: any[]
): Promise<any> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const commandArgs = [
    'CLIENT',
    subcommand.toUpperCase(),
    ...args.map(arg => String(arg)),
  ];
  const result = await internal.glideClient.customCommand(commandArgs);

  if (subcommand.toUpperCase() === 'LIST') {
    return ParameterTranslator.convertGlideString(result) || '';
  } else if (subcommand.toUpperCase() === 'SETNAME') {
    return ParameterTranslator.convertGlideString(result) || 'OK';
  } else {
    return result;
  }
}

export async function clientId(client: BaseClient): Promise<number> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have clientId()
  const result = await internal.glideClient.clientId();
  
  // GlideClient returns number, GlideClusterClient returns ClusterResponse<number>
  if (client.isCluster && typeof result === 'object') {
    // For cluster, return first node's client ID
    return Object.values(result)[0] as number;
  }
  
  return result as number;
}

export async function configGet(
  client: BaseClient,
  parameter: string | string[]
): Promise<string[]> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const params = Array.isArray(parameter) ? parameter : [parameter];
  
  // Both GlideClient and GlideClusterClient have configGet()
  const res = await internal.glideClient.configGet(params);
  
  // Handle ClusterResponse for cluster clients
  if (client.isCluster && typeof res === 'object') {
    // For cluster, merge all node responses
    const list: string[] = [];
    for (const nodeRes of Object.values(res)) {
      for (const [k, v] of Object.entries(nodeRes as Record<string, any>)) {
        list.push(String(k), ParameterTranslator.convertGlideString(v) || '');
      }
    }
    return list;
  }
  
  // For standalone, convert Record<string, GlideString> to array
  const list: string[] = [];
  for (const [k, v] of Object.entries(res)) {
    list.push(String(k), ParameterTranslator.convertGlideString(v) || '');
  }
  return list;
}

export async function configSet(
  client: BaseClient,
  map: Record<string, string>
): Promise<'OK'> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have configSet()
  return await internal.glideClient.configSet(map);
}

export async function configRewrite(client: BaseClient): Promise<'OK'> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have configRewrite()
  return await internal.glideClient.configRewrite();
}

export async function configResetStat(client: BaseClient): Promise<'OK'> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have configResetStat()
  return await internal.glideClient.configResetStat();
}

export async function config(
  client: BaseClient,
  action: string,
  parameter?: string
): Promise<string[]> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const args = parameter ? [action, parameter] : [action];
  const result = await internal.glideClient.customCommand([
    'CONFIG',
    ...args,
  ]);

  if (action.toUpperCase() === 'GET' && Array.isArray(result)) {
    return result.map((item: any) => String(item));
  }
  return Array.isArray(result)
    ? result.map((item: any) => String(item))
    : [String(result)];
}

export async function flushall(
  client: BaseClient,
  mode?: 'SYNC' | 'ASYNC'
): Promise<string> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have flushall()
  // GLIDE uses FlushMode enum, but we accept string for ioredis compatibility
  const glideMode = mode?.toUpperCase() as any; // FlushMode enum value
  const result = await internal.glideClient.flushall(glideMode);
  return result;
}

export async function flushdb(
  client: BaseClient,
  mode?: 'SYNC' | 'ASYNC'
): Promise<string> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have flushdb()
  // GLIDE uses FlushMode enum, but we accept string for ioredis compatibility  
  const glideMode = mode?.toUpperCase() as any; // FlushMode enum value
  const result = await internal.glideClient.flushdb(glideMode);
  return result;
}

export async function dbsize(client: BaseClient): Promise<number> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have dbsize()
  // GlideClient.dbsize() returns Promise<number>
  // GlideClusterClient.dbsize() ALSO returns Promise<number> (aggregated)
  const result = await internal.glideClient.dbsize();
  return result;
}

export async function memory(
  client: BaseClient,
  subcommand: string,
  ...args: (string | number)[]
): Promise<any> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const commandArgs = ['MEMORY', subcommand, ...args.map(arg => String(arg))];
  return await internal.glideClient.customCommand(commandArgs);
}

export async function slowlog(
  client: BaseClient,
  subcommand: string,
  ...args: (string | number)[]
): Promise<any> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const commandArgs = ['SLOWLOG', subcommand, ...args.map(arg => String(arg))];
  return await internal.glideClient.customCommand(commandArgs);
}

export async function debug(
  client: BaseClient,
  subcommand: string,
  ...args: (string | number)[]
): Promise<any> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const commandArgs = ['DEBUG', subcommand, ...args.map(arg => String(arg))];
  return await internal.glideClient.customCommand(commandArgs);
}

export async function echo(
  client: BaseClient,
  message: string
): Promise<string> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have echo()
  const result = await internal.glideClient.echo(message);
  
  // GlideClient returns GlideString
  // GlideClusterClient returns ClusterResponse<GlideString>
  if (client.isCluster && typeof result === 'object' && !Buffer.isBuffer(result)) {
    // For cluster, return first node's response
    const firstValue = Object.values(result)[0];
    return ParameterTranslator.convertGlideString(firstValue) || '';
  }
  
  return ParameterTranslator.convertGlideString(result) || '';
}

export async function time(client: BaseClient): Promise<[string, string]> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have time()
  const result = await internal.glideClient.time();
  
  // GlideClient returns [string, string]
  // GlideClusterClient returns ClusterResponse<[string, string]>
  if (client.isCluster && typeof result === 'object' && !Array.isArray(result)) {
    // For cluster, return first node's time
    const firstValue = Object.values(result)[0] as [string, string];
    return firstValue;
  }
  
  return result as [string, string];
}

export async function lastsave(client: BaseClient): Promise<number> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  
  // Both GlideClient and GlideClusterClient have lastsave()
  const result = await internal.glideClient.lastsave();
  
  // GlideClient returns number
  // GlideClusterClient returns ClusterResponse<number>
  if (client.isCluster && typeof result === 'object') {
    // For cluster, return the most recent save time across all nodes
    return Math.max(...Object.values(result).map(val => Number(val)));
  }
  
  return result as number;
}

export async function save(client: BaseClient): Promise<'OK'> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const result = await internal.glideClient.customCommand(['SAVE']);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

export async function bgsave(client: BaseClient): Promise<string> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const result = await internal.glideClient.customCommand(['BGSAVE']);
  return ParameterTranslator.convertGlideString(result) || 'OK';
}

export async function monitor(client: BaseClient): Promise<'OK'> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const result = await internal.glideClient.customCommand(['MONITOR']);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}
