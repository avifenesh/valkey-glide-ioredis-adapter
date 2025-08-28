import { PortDiscovery } from '../utils/port-discovery';

module.exports = async () => {
  // If already provided via env, keep them
  if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
    return;
  }

  // Discover responsive server
  try {
    const servers = await PortDiscovery.discoverRedisServers();
    const responsive = servers.find(s => s.responsive);
    if (responsive) {
      process.env.REDIS_HOST = responsive.host;
      process.env.REDIS_PORT = String(responsive.port);
      return;
    }
  } catch {}

  // Fallback to defaults
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
};
