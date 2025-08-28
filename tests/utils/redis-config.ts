import { PortDiscovery } from './port-discovery';

export interface RedisTestConfig {
  host: string;
  port: number;
}

export async function getRedisTestConfig(): Promise<RedisTestConfig> {
  const envHost = process.env.REDIS_HOST?.trim();
  const envPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined;

  if (envHost && envPort) {
    return { host: envHost, port: envPort };
  }

  // Prefer a responsive discovered server
  const discovered = await PortDiscovery.discoverRedisServers();
  const responsive = discovered.find(s => s.responsive);
  if (responsive) {
    return { host: responsive.host, port: responsive.port };
  }

  // Fallback to default
  return { host: 'localhost', port: 6379 };
}
