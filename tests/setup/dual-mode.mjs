// Dual-mode testing utilities for running suites against standalone and cluster
// Usage:
//   import { describeForEachMode, createClient, flushAll, keyTag } from '../setup/dual-mode.mjs';
//   describeForEachMode('My Suite', (mode) => { ... })

import { describe } from 'node:test';

export const MODES = ['standalone', 'cluster'];

export function describeForEachMode(name, suite) {
  const disableStandalone = process.env.DISABLE_STANDALONE_TESTS === 'true';
  const disableCluster = process.env.DISABLE_CLUSTER_TESTS === 'true';

  for (const mode of MODES) {
    if (mode === 'standalone' && disableStandalone) continue;
    if (mode === 'cluster' && disableCluster) continue;

    describe(`${name} (${mode})`, () => suite(mode));
  }
}

export async function createClient(mode) {
  const pkg = await import('../../dist/index.js');
  const { Redis, Cluster } = pkg;
  const cfg = await import('../utils/test-config.mjs');

  if (mode === 'cluster') {
    const nodes = cfg.getClusterConfig();
    return new Cluster(nodes, { lazyConnect: true });
  }
  const opts = cfg.getStandaloneConfig();
  return new Redis(opts);
}

// Consistent hash-tag for multi-key operations in cluster mode
export function keyTag(prefix = 'dm') {
  const salt = Math.random().toString(36).slice(2);
  return `{${prefix}:${salt}}`;
}

export async function flushAll(client) {
  try {
    await client.flushall();
  } catch {
    // ignore
  }
}

