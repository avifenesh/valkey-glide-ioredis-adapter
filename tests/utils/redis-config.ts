// Removed PortDiscovery import to avoid problematic server discovery
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

export interface RedisTestConfig {
  host: string;
  port: number;
}

export async function getRedisTestConfig(): Promise<RedisTestConfig> {
  // Load .env.test if it exists to get dynamic test server configuration
  const envTestPath = path.join(process.cwd(), '.env.test');
  if (fs.existsSync(envTestPath)) {
    dotenv.config({ path: envTestPath, override: true });
  }

  // PRIORITY 1: Check for CI Valkey Bundle configuration (highest priority in CI environments)
  const valkeyBundleHost = process.env.VALKEY_BUNDLE_HOST?.trim();
  const valkeyBundlePort = process.env.VALKEY_BUNDLE_PORT ? Number(process.env.VALKEY_BUNDLE_PORT) : undefined;

  if (valkeyBundleHost && valkeyBundlePort) {
    console.log(`Using CI Valkey Bundle server: ${valkeyBundleHost}:${valkeyBundlePort}`);
    return { host: valkeyBundleHost, port: valkeyBundlePort };
  }

  // PRIORITY 2: Check for local Valkey standalone configuration (from test server script)
  const valkeyHost = process.env.VALKEY_STANDALONE_HOST?.trim();
  const valkeyPort = process.env.VALKEY_STANDALONE_PORT ? Number(process.env.VALKEY_STANDALONE_PORT) : undefined;

  if (valkeyHost && valkeyPort) {
    console.log(`Using local Valkey test server: ${valkeyHost}:${valkeyPort}`);
    return { host: valkeyHost, port: valkeyPort };
  }

  // PRIORITY 3: Check for legacy Redis configuration  
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
