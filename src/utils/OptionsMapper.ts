import {
  GlideClientConfiguration,
  GlideClusterClientConfiguration,
} from '@valkey/valkey-glide';
import { RedisOptions } from '../types';
import type { ClusterNode, ClusterOptions } from '../ClusterClient';

export function toGlideStandaloneConfig(
  options: RedisOptions
): GlideClientConfiguration {
  const host = options.host || 'localhost';
  const port = options.port || 6379;

  const config: GlideClientConfiguration = {
    addresses: [
      {
        host,
        port,
      },
    ],
    ...(options.clientName && { clientName: options.clientName }),
    ...((options.tls || options.useTLS) && { useTLS: true }),
    ...(options.db !== undefined && { databaseId: options.db }),
    ...(options.lazyConnect !== undefined && {
      lazyConnect: options.lazyConnect,
    }),
    ...(options.username && options.password
      ? {
          credentials: {
            username: options.username,
            password: options.password,
          },
        }
      : {}),
    ...(options.requestTimeout
      ? { requestTimeout: options.requestTimeout }
      : options.commandTimeout
        ? { requestTimeout: options.commandTimeout }
        : {}),
    ...(options.readFrom && { readFrom: options.readFrom }),
    ...(options.clientAz && { clientAz: options.clientAz }),
  } as GlideClientConfiguration;

  // Advanced configuration - only pass if user explicitly sets values
  const advancedConfiguration: Record<string, unknown> = {};
  if (options.connectTimeout !== undefined) {
    advancedConfiguration.connectionTimeout = options.connectTimeout;
  }
  // Only add advancedConfiguration if user provided values
  if (Object.keys(advancedConfiguration).length > 0) {
    (config as any).advancedConfiguration = advancedConfiguration;
  }

  // Connection backoff
  const connectionBackoff: Record<string, unknown> = {};
  if (options.maxRetriesPerRequest !== undefined) {
    const retries =
      options.maxRetriesPerRequest === null ? 50 : options.maxRetriesPerRequest;
    connectionBackoff.numberOfRetries = retries;
  }
  if (options.retryDelayOnFailover !== undefined) {
    const jitterPercent = Math.min(
      100,
      Math.max(5, Math.round(options.retryDelayOnFailover / 5))
    );
    connectionBackoff.jitterPercent = jitterPercent;
  }
  if (Object.keys(connectionBackoff).length > 0) {
    (config as any).connectionBackoff = connectionBackoff;
  }

  // Inflight requests limit / offline queue behavior
  if (options.enableOfflineQueue === false) {
    (config as any).inflightRequestsLimit = 100;
  } else if (options.inflightRequestsLimit !== undefined) {
    (config as any).inflightRequestsLimit = options.inflightRequestsLimit;
  }

  return config;
}

export function toGlideClusterConfig(
  nodes: ClusterNode[],
  options: ClusterOptions
): GlideClusterClientConfiguration {
  const config: GlideClusterClientConfiguration = {
    addresses: nodes.map(n => ({ host: n.host, port: n.port })),
    ...(options.clientName && { clientName: options.clientName }),
    ...((options.tls || (options as any).useTLS) && { useTLS: true }),
    ...(options.lazyConnect !== undefined && {
      lazyConnect: options.lazyConnect,
    }),
    ...(options.username && options.password
      ? {
          credentials: {
            username: options.username,
            password: options.password,
          },
        }
      : {}),
    ...(options.requestTimeout
      ? { requestTimeout: options.requestTimeout }
      : options.commandTimeout
        ? { requestTimeout: options.commandTimeout }
        : {}),
    readFrom:
      options.readFrom ||
      (options.enableReadFromReplicas ? 'preferReplica' : 'primary'),
    ...(options.clientAz && { clientAz: options.clientAz }),
  } as GlideClusterClientConfiguration;

  // Advanced configuration - only pass if user explicitly sets values
  const advancedConfiguration: Record<string, unknown> = {};
  if (options.connectTimeout !== undefined) {
    advancedConfiguration.connectionTimeout = options.connectTimeout;
  }
  // Only add advancedConfiguration if user provided values
  if (Object.keys(advancedConfiguration).length > 0) {
    (config as any).advancedConfiguration = advancedConfiguration;
  }

  // Connection backoff - only pass if user explicitly sets values
  const connectionBackoff: Record<string, unknown> = {};
  if (options.maxRetriesPerRequest !== undefined) {
    const retries =
      options.maxRetriesPerRequest === null ? 50 : options.maxRetriesPerRequest;
    connectionBackoff.numberOfRetries = retries;
  }
  if (options.retryDelayOnFailover !== undefined) {
    const jitterPercent = Math.min(
      100,
      Math.max(5, Math.round(options.retryDelayOnFailover / 5))
    );
    connectionBackoff.jitterPercent = jitterPercent;
  }
  // Only add connectionBackoff if user provided values
  if (Object.keys(connectionBackoff).length > 0) {
    (config as any).connectionBackoff = connectionBackoff;
  }

  // Inflight requests limit / offline queue behavior
  if (options.enableOfflineQueue === false) {
    (config as any).inflightRequestsLimit = 0;
  } else if ((options as any).inflightRequestsLimit !== undefined) {
    (config as any).inflightRequestsLimit = (
      options as any
    ).inflightRequestsLimit;
  }

  return config;
}
