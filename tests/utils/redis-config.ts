// Removed PortDiscovery import to avoid problematic server discovery

export interface RedisTestConfig {
  host: string;
  port: number;
}

export async function getRedisTestConfig(): Promise<RedisTestConfig> {
  // Check for Valkey standalone configuration first (from test server script)
  const valkeyHost = process.env.VALKEY_STANDALONE_HOST?.trim();
  const valkeyPort = process.env.VALKEY_STANDALONE_PORT ? Number(process.env.VALKEY_STANDALONE_PORT) : undefined;

  if (valkeyHost && valkeyPort) {
    console.log(`Using Valkey test server: ${valkeyHost}:${valkeyPort}`);
    return { host: valkeyHost, port: valkeyPort };
  }

  // Check for legacy Redis configuration  
  const envHost = process.env.REDIS_HOST?.trim();
  const envPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined;

  if (envHost && envPort) {
    console.log(`Using Redis test server: ${envHost}:${envPort}`);
    return { host: envHost, port: envPort };
  }

  // AVOID discovery as it might find old cluster nodes - use safe default
  console.warn('No explicit test server config found, using localhost:6379');
  return { host: 'localhost', port: 6379 };
}
