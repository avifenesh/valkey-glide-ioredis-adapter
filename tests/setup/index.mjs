import { afterEach } from 'node:test';
import {
  getStandaloneConfig,
  getClusterConfig,
  checkTestServers,
} from '../utils/test-config.mjs';
import pkg from '../../dist/index.js';

export const testUtils = {
  getStandaloneConfig,
  checkTestServers,
};

// DISABLED: Aggressive global cleanup was causing hanging tests
// Individual tests should handle their own cleanup as needed
//
// // Global cleanup after each test: flush databases and close clients
// // Skip if a global setup is already handling this.
// if (process.env.GLOBAL_TEST_SETUP !== '1') afterEach(async () => {
//   try {
//     const { Redis, Cluster } = pkg;
//     // Standalone cleanup
//     try {
//       const cfg = { ...getStandaloneConfig(), connectTimeout: 200, requestTimeout: 1000 };
//       if (cfg && cfg.host) {
//         const client = new Redis(cfg);
//         try { await client.flushall(); } catch {}
//         try { await client.quit(); } catch {}
//         await new Promise(res => setTimeout(res, 20));
//       }
//     } catch {}

//     // Cluster cleanup (if cluster nodes are configured)
//     try {
//       const nodes = getClusterConfig();
//       if (Array.isArray(nodes) && nodes.length > 0) {
//         const cluster = new Cluster(nodes, { connectTimeout: 200, requestTimeout: 1000 });
//         try { await cluster.flushall(); } catch {}
//         try { await cluster.quit(); } catch {}
//         await new Promise(res => setTimeout(res, 20));
//       }
//     } catch {}
//   } catch {}
// });
