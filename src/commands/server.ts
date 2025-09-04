import { BaseClient } from '../BaseClient';
import { ParameterTranslator } from '../utils/ParameterTranslator';

// Server/Admin and miscellaneous commands

export async function info(
  client: BaseClient,
  section?: string
): Promise<string> {
  let result: any;
  if (section) {
    result = await (client as any).glideClient.customCommand(['INFO', section]);
  } else {
    result = await (client as any).glideClient.info();
  }
  return ParameterTranslator.convertGlideString(result) || '';
}

export async function client(
  client: BaseClient,
  subcommand: string,
  ...args: any[]
): Promise<any> {
  const commandArgs = [
    'CLIENT',
    subcommand.toUpperCase(),
    ...args.map(arg => String(arg)),
  ];
  const result = await (client as any).glideClient.customCommand(commandArgs);

  if (subcommand.toUpperCase() === 'LIST') {
    return ParameterTranslator.convertGlideString(result) || '';
  } else if (subcommand.toUpperCase() === 'SETNAME') {
    return ParameterTranslator.convertGlideString(result) || 'OK';
  } else {
    return result;
  }
}

export async function clientId(client: BaseClient): Promise<number> {
  if ((client as any).glideClient.clientId) {
    return await (client as any).glideClient.clientId();
  }
  const result = await (client as any).glideClient.customCommand([
    'CLIENT',
    'ID',
  ]);
  return Number(result) || 0;
}

export async function configGet(
  client: BaseClient,
  parameter: string | string[]
): Promise<string[]> {
  const params = Array.isArray(parameter) ? parameter : [parameter];
  if ((client as any).glideClient.configGet) {
    const res = await (client as any).glideClient.configGet(params);
    const list: string[] = [];
    for (const [k, v] of Object.entries(res)) list.push(String(k), String(v));
    return list;
  }
  const result = await (client as any).glideClient.customCommand([
    'CONFIG',
    'GET',
    ...params,
  ]);
  return Array.isArray(result) ? result.map((x: any) => String(x)) : [];
}

export async function configSet(
  client: BaseClient,
  map: Record<string, string>
): Promise<'OK'> {
  if ((client as any).glideClient.configSet) {
    return await (client as any).glideClient.configSet(map);
  }
  const flat = Object.entries(map).flatMap(([k, v]) => [k, v]);
  const result = await (client as any).glideClient.customCommand([
    'CONFIG',
    'SET',
    ...flat,
  ]);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

export async function configRewrite(client: BaseClient): Promise<'OK'> {
  if ((client as any).glideClient.configRewrite)
    return await (client as any).glideClient.configRewrite();
  const result = await (client as any).glideClient.customCommand([
    'CONFIG',
    'REWRITE',
  ]);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

export async function configResetStat(client: BaseClient): Promise<'OK'> {
  if ((client as any).glideClient.configResetStat)
    return await (client as any).glideClient.configResetStat();
  const result = await (client as any).glideClient.customCommand([
    'CONFIG',
    'RESETSTAT',
  ]);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

export async function config(
  client: BaseClient,
  action: string,
  parameter?: string
): Promise<string[]> {
  const args = parameter ? [action, parameter] : [action];
  const result = await (client as any).glideClient.customCommand([
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
  if (
    'flushall' in (client as any).glideClient &&
    typeof (client as any).glideClient.flushall === 'function'
  ) {
    const { FlushMode } = require('@valkey/valkey-glide');
    const flushMode = mode === 'ASYNC' ? FlushMode.ASYNC : FlushMode.SYNC;
    const result = await (client as any).glideClient.flushall(flushMode);
    return ParameterTranslator.convertGlideString(result) || 'OK';
  } else {
    const args = mode ? ['FLUSHALL', mode] : ['FLUSHALL'];
    const result = await (client as any).glideClient.customCommand(args);
    return ParameterTranslator.convertGlideString(result) || 'OK';
  }
}

export async function flushdb(
  client: BaseClient,
  mode?: 'SYNC' | 'ASYNC'
): Promise<string> {
  if (
    'flushdb' in (client as any).glideClient &&
    typeof (client as any).glideClient.flushdb === 'function'
  ) {
    const { FlushMode } = require('@valkey/valkey-glide');
    const flushMode = mode === 'ASYNC' ? FlushMode.ASYNC : FlushMode.SYNC;
    const result = await (client as any).glideClient.flushdb(flushMode);
    return ParameterTranslator.convertGlideString(result) || 'OK';
  } else {
    const args = mode ? ['FLUSHDB', mode] : ['FLUSHDB'];
    const result = await (client as any).glideClient.customCommand(args);
    return ParameterTranslator.convertGlideString(result) || 'OK';
  }
}

export async function dbsize(client: BaseClient): Promise<number> {
  const result = await (client as any).glideClient.customCommand(['DBSIZE']);
  return Number(result) || 0;
}

export async function memory(
  client: BaseClient,
  subcommand: string,
  ...args: (string | number)[]
): Promise<any> {
  const commandArgs = ['MEMORY', subcommand, ...args.map(arg => String(arg))];
  return await (client as any).glideClient.customCommand(commandArgs);
}

export async function slowlog(
  client: BaseClient,
  subcommand: string,
  ...args: (string | number)[]
): Promise<any> {
  const commandArgs = ['SLOWLOG', subcommand, ...args.map(arg => String(arg))];
  return await (client as any).glideClient.customCommand(commandArgs);
}

export async function debug(
  client: BaseClient,
  subcommand: string,
  ...args: (string | number)[]
): Promise<any> {
  const commandArgs = ['DEBUG', subcommand, ...args.map(arg => String(arg))];
  return await (client as any).glideClient.customCommand(commandArgs);
}

export async function echo(client: BaseClient, message: string): Promise<string> {
  const result = await (client as any).glideClient.customCommand(['ECHO', message]);
  return String(result);
}

export async function time(client: BaseClient): Promise<[string, string]> {
  const result = await (client as any).glideClient.customCommand(['TIME']);
  if (Array.isArray(result) && result.length >= 2) {
    return [String(result[0]), String(result[1])];
  }
  return ['0', '0'];
}

export async function lastsave(client: BaseClient): Promise<number> {
  const result = await (client as any).glideClient.customCommand(['LASTSAVE']);
  return Number(result) || 0;
}

export async function save(client: BaseClient): Promise<'OK'> {
  const result = await (client as any).glideClient.customCommand(['SAVE']);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

export async function bgsave(client: BaseClient): Promise<string> {
  const result = await (client as any).glideClient.customCommand(['BGSAVE']);
  return ParameterTranslator.convertGlideString(result) || 'OK';
}

export async function monitor(client: BaseClient): Promise<'OK'> {
  const result = await (client as any).glideClient.customCommand(['MONITOR']);
  return (ParameterTranslator.convertGlideString(result) as any) || 'OK';
}

