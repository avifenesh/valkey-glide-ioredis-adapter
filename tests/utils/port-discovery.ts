/**
 * Dynamic Port Discovery Utility for Test Infrastructure
 *
 * This module provides utilities for:
 * - Finding available ports dynamically
 * - Discovering running Redis/Valkey servers
 * - Managing port allocation for concurrent tests
 */

import * as net from 'net';

export interface ServerConfig {
  host: string;
  port: number;
}

export interface DiscoveredServer extends ServerConfig {
  type: 'redis' | 'valkey' | 'unknown';
  version?: string | undefined;
  responsive: boolean;
}

export class PortDiscovery {
  private static readonly DEFAULT_HOST = 'localhost';
  private static readonly PORT_RANGE_START = 10000;
  private static readonly PORT_RANGE_END = 65535;
  private static readonly DISCOVERY_TIMEOUT = 1000;

  /**
   * Find an available port in the specified range
   */
  static async findAvailablePort(
    startPort: number = PortDiscovery.PORT_RANGE_START,
    endPort: number = PortDiscovery.PORT_RANGE_END,
    host: string = PortDiscovery.DEFAULT_HOST
  ): Promise<number> {
    for (let port = startPort; port <= endPort; port++) {
      if (await PortDiscovery.isPortAvailable(port, host)) {
        return port;
      }
    }
    throw new Error(
      `No available ports found in range ${startPort}-${endPort}`
    );
  }

  /**
   * Find multiple available ports
   */
  static async findAvailablePorts(
    count: number,
    startPort: number = PortDiscovery.PORT_RANGE_START,
    host: string = PortDiscovery.DEFAULT_HOST
  ): Promise<number[]> {
    const ports: number[] = [];
    let currentPort = startPort;

    while (
      ports.length < count &&
      currentPort <= PortDiscovery.PORT_RANGE_END
    ) {
      if (await PortDiscovery.isPortAvailable(currentPort, host)) {
        ports.push(currentPort);
      }
      currentPort++;
    }

    if (ports.length < count) {
      throw new Error(`Could not find ${count} available ports`);
    }

    return ports;
  }

  /**
   * Check if a specific port is available
   */
  static async isPortAvailable(
    port: number,
    host: string = PortDiscovery.DEFAULT_HOST
  ): Promise<boolean> {
    return new Promise(resolve => {
      const socket = new net.Socket();

      socket.setTimeout(PortDiscovery.DISCOVERY_TIMEOUT);

      socket.on('connect', () => {
        socket.destroy();
        resolve(false); // Port is in use
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(true); // Port is available
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(true); // Port is available
      });

      socket.connect(port, host);
    });
  }

  /**
   * Scan for running Redis/Valkey servers on common ports
   */
  static async discoverRedisServers(
    portRange: number[] = [
      6379, 6380, 6381, 7000, 7001, 7002, 7003, 7004, 7005,
    ],
    host: string = PortDiscovery.DEFAULT_HOST
  ): Promise<DiscoveredServer[]> {
    const servers: DiscoveredServer[] = [];

    const scanPromises = portRange.map(async port => {
      try {
        const isRunning = !(await PortDiscovery.isPortAvailable(port, host));
        if (isRunning) {
          const serverInfo = await PortDiscovery.validateRedisServer({
            host,
            port,
          });
          if (serverInfo) {
            servers.push(serverInfo);
          }
        }
      } catch (error) {
        // Ignore errors for individual port scans
      }
    });

    await Promise.allSettled(scanPromises);
    return servers;
  }

  /**
   * Auto-discover available Redis servers in a broader port range
   */
  static async autoDiscoverRedisServers(
    startPort: number = 6000,
    endPort: number = 8000,
    host: string = PortDiscovery.DEFAULT_HOST
  ): Promise<DiscoveredServer[]> {
    const servers: DiscoveredServer[] = [];
    const batchSize = 100; // Scan ports in batches to avoid overwhelming the system

    for (let start = startPort; start <= endPort; start += batchSize) {
      const end = Math.min(start + batchSize - 1, endPort);
      const portRange = Array.from(
        { length: end - start + 1 },
        (_, i) => start + i
      );

      const batchServers = await PortDiscovery.discoverRedisServers(
        portRange,
        host
      );
      servers.push(...batchServers);
    }

    return servers;
  }

  /**
   * Validate if a server is a Redis/Valkey instance and get its info
   */
  static async validateRedisServer(
    config: ServerConfig
  ): Promise<DiscoveredServer | null> {
    try {
      // Dynamic import to avoid circular dependency
      const { default: Redis } = await import('../../src/Redis');

      const testAdapter = new Redis(config);

      // Test connection with timeout
      const connectionPromise = testAdapter.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 2000)
      );

      await Promise.race([connectionPromise, timeoutPromise]);

      // Test PING command
      const pingResult = await testAdapter.ping();
      const responsive = pingResult === 'PONG';

      let serverType: 'redis' | 'valkey' | 'unknown' = 'unknown';
      let version: string | undefined;

      try {
        // Try to get server info - check if method exists first
        if (typeof (testAdapter as any).info === 'function') {
          const info = await (testAdapter as any).info('server');
          if (typeof info === 'string') {
            if (info.includes('redis_version')) {
              serverType = 'redis';
              const versionMatch = info.match(/redis_version:([^\r\n]+)/);
              version = versionMatch ? versionMatch[1] : undefined;
            } else if (info.includes('valkey_version')) {
              serverType = 'valkey';
              const versionMatch = info.match(/valkey_version:([^\r\n]+)/);
              version = versionMatch ? versionMatch[1] : undefined;
            }
          }
        }
      } catch {
        // If info command fails, still consider it a valid server if PING worked
      }

      await testAdapter.disconnect();

      return {
        host: config.host,
        port: config.port,
        type: serverType,
        version,
        responsive,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the first available Redis server, or create configuration for a new one
   */
  static async getOrAllocateRedisServer(
    preferredPort?: number
  ): Promise<ServerConfig> {
    // First, try to discover existing servers
    const discoveredServers = await PortDiscovery.discoverRedisServers();

    if (discoveredServers.length > 0) {
      const responsiveServer = discoveredServers.find(s => s.responsive);
      if (responsiveServer) {
        return { host: responsiveServer.host, port: responsiveServer.port };
      }
    }

    // If preferred port is specified and available, use it
    if (preferredPort && (await PortDiscovery.isPortAvailable(preferredPort))) {
      return { host: PortDiscovery.DEFAULT_HOST, port: preferredPort };
    }

    // Otherwise, find any available port
    const availablePort = await PortDiscovery.findAvailablePort();
    return { host: PortDiscovery.DEFAULT_HOST, port: availablePort };
  }

  /**
   * Generate a random port in the dynamic/ephemeral range
   */
  static generateRandomPort(): number {
    const min = 49152; // Start of dynamic/ephemeral port range
    const max = 65535; // End of port range
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Check if any Redis server is available on standard ports
   */
  static async hasAnyRedisServer(): Promise<boolean> {
    const standardPorts = [6379, 6380, 6381];

    for (const port of standardPorts) {
      const serverInfo = await PortDiscovery.validateRedisServer({
        host: PortDiscovery.DEFAULT_HOST,
        port,
      });

      if (serverInfo && serverInfo.responsive) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Utility functions for common port discovery scenarios
 */
export const portUtils = {
  /**
   * Quick check for Redis on default port
   */
  async isDefaultRedisAvailable(): Promise<boolean> {
    return PortDiscovery.validateRedisServer({
      host: 'localhost',
      port: 6379,
    }).then(server => server?.responsive ?? false);
  },

  /**
   * Find Redis server or suggest port for new instance
   */
  async findRedisServerOrPort(): Promise<{
    server?: DiscoveredServer;
    suggestedPort?: number;
  }> {
    const servers = await PortDiscovery.discoverRedisServers();
    const responsiveServer = servers.find(s => s.responsive);

    if (responsiveServer) {
      return { server: responsiveServer };
    }

    const suggestedPort = await PortDiscovery.findAvailablePort(6379, 6400);
    return { suggestedPort };
  },

  /**
   * Generate test server configuration with unique ports
   */
  async generateTestConfig(includeCluster: boolean = false): Promise<{
    standalone: ServerConfig;
    cluster?: ServerConfig[];
  }> {
    const standalone = await PortDiscovery.getOrAllocateRedisServer(6379);

    if (!includeCluster) {
      return { standalone };
    }

    const clusterPorts = await PortDiscovery.findAvailablePorts(6, 7000);
    const cluster = clusterPorts.map(port => ({
      host: 'localhost',
      port,
    }));

    return { standalone, cluster };
  },
};
