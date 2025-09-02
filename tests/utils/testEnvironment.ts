/**
 * Centralized Test Environment Manager
 *
 * Handles validation and configuration of test servers
 * - No mock connections - real servers only
 * - Fail fast if required servers aren't available
 * - Centralized configuration management
 * - Health checking and status reporting
 */

import { Redis } from '../../src/Redis';
import { Cluster } from '../../src/Cluster';

export interface TestRequirements {
  standalone?: boolean;
  cluster?: boolean;
  modules?: string[];
}

export interface TestConfig {
  standalone: {
    host: string;
    port: number;
  };
  cluster: {
    nodes: Array<{ host: string; port: number }>;
  };
}

export interface HealthStatus {
  available: boolean;
  responsive: boolean;
  modules?: string[];
  version?: string | undefined;
  error?: string;
}

export interface ClusterHealthStatus {
  available: boolean;
  nodes: Array<{
    host: string;
    port: number;
    responsive: boolean;
    role?: 'master' | 'slave';
  }>;
  clusterState?: 'ok' | 'fail' | undefined;
  error?: string;
}

export class TestEnvironment {
  private static instance: TestEnvironment;
  private config: TestConfig;

  private constructor() {
    this.config = {
      standalone: {
        host: process.env.VALKEY_HOST || process.env.REDIS_HOST || 'localhost',
        port: parseInt(
          process.env.VALKEY_PORT || process.env.REDIS_PORT || '6379',
          10
        ),
      },
      cluster: {
        nodes: [
          { host: 'localhost', port: 17000 },
          { host: 'localhost', port: 17001 },
          { host: 'localhost', port: 17002 },
          { host: 'localhost', port: 17003 },
          { host: 'localhost', port: 17004 },
          { host: 'localhost', port: 17005 },
        ],
      },
    };
  }

  static getInstance(): TestEnvironment {
    if (!TestEnvironment.instance) {
      TestEnvironment.instance = new TestEnvironment();
    }
    return TestEnvironment.instance;
  }

  /**
   * Validate that all required servers are available and ready
   */
  async validate(requirements: TestRequirements): Promise<void> {
    const errors: string[] = [];

    if (requirements.standalone) {
      try {
        await this.validateStandalone(requirements.modules);
      } catch (error) {
        errors.push(
          `Standalone server: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (requirements.cluster) {
      try {
        await this.validateCluster();
      } catch (error) {
        errors.push(
          `Cluster: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Test environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n\nTo start test servers: npm run test:start`
      );
    }
  }

  /**
   * Validate standalone server is available and responsive
   */
  async validateStandalone(requiredModules?: string[]): Promise<void> {
    const health = await this.checkStandaloneHealth();

    if (!health.available) {
      throw new Error(
        `Standalone server not available at ${this.config.standalone.host}:${this.config.standalone.port}`
      );
    }

    if (!health.responsive) {
      throw new Error(
        `Standalone server not responsive: ${health.error || 'Unknown error'}`
      );
    }

    if (requiredModules && requiredModules.length > 0) {
      const missingModules = requiredModules.filter(
        mod =>
          !health.modules?.some(available =>
            available.toLowerCase().includes(mod.toLowerCase())
          )
      );

      if (missingModules.length > 0) {
        throw new Error(
          `Required modules not available: ${missingModules.join(', ')}. Available: ${health.modules?.join(', ') || 'none'}`
        );
      }
    }
  }

  /**
   * Validate cluster is available and properly configured
   */
  async validateCluster(): Promise<void> {
    const health = await this.checkClusterHealth();

    if (!health.available) {
      throw new Error(
        `Cluster not available. Missing nodes: ${health.nodes
          .filter(n => !n.responsive)
          .map(n => `${n.host}:${n.port}`)
          .join(', ')}`
      );
    }

    if (health.clusterState !== 'ok') {
      throw new Error(
        `Cluster state is not OK: ${health.clusterState || 'unknown'}`
      );
    }
  }

  /**
   * Check standalone server health
   */
  async checkStandaloneHealth(): Promise<HealthStatus> {
    // Wrap entire health check in timeout protection
    const healthCheckPromise = this.doStandaloneHealthCheck();
    const timeoutPromise = new Promise<HealthStatus>((_, reject) =>
      setTimeout(
        () => reject(new Error('Health check timeout after 10 seconds')),
        10000
      )
    );

    try {
      return await Promise.race([healthCheckPromise, timeoutPromise]);
    } catch (error) {
      return {
        available: false,
        responsive: false,
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  private async doStandaloneHealthCheck(): Promise<HealthStatus> {
    try {
      const client = new Redis({
        host: this.config.standalone.host,
        port: this.config.standalone.port,
        lazyConnect: true,
      });

      // Test connection
      await client.connect();

      // Test basic operation
      const pingResult = await client.ping();
      if (pingResult !== 'PONG') {
        throw new Error('Server not responding to PING');
      }

      // Get server info and modules
      let version: string | undefined;
      let modules: string[] = [];

      try {
        const info = await client.info('server');
        const versionMatch = info.match(/(redis|valkey)_version:([^\r\n]+)/);
        version = versionMatch ? versionMatch[2] : undefined;

        // Check for modules using Docker exec approach (most reliable)
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          const { stdout } = await execAsync(
            'docker exec test-valkey-standalone valkey-cli INFO modules'
          );

          if (stdout && stdout.includes('# Modules')) {
            const moduleLines = stdout
              .split('\n')
              .filter(line => line.startsWith('module:'));

            for (const line of moduleLines) {
              const nameMatch = line.match(/name=([^,]+)/);
              if (nameMatch && nameMatch[1]) {
                modules.push(nameMatch[1]);
              }
            }

            console.log(`✓ Modules detected via Docker: ${modules.join(', ')}`);
          }
        } catch (dockerError) {
          // Fallback to client INFO approach if Docker exec fails
          try {
            const moduleInfo = await client.info('modules');
            if (moduleInfo && moduleInfo.includes('# Modules')) {
              const moduleLines = moduleInfo
                .split('\n')
                .filter(line => line.startsWith('module:'));

              for (const line of moduleLines) {
                const nameMatch = line.match(/name=([^,]+)/);
                if (nameMatch && nameMatch[1]) {
                  modules.push(nameMatch[1]);
                }
              }

              console.log(
                `✓ Modules detected via client: ${modules.join(', ')}`
              );
            }
          } catch {
            // No modules detected
          }
        }
      } catch {
        // Info commands failed, but basic connection works
      }

      await client.disconnect();

      return {
        available: true,
        responsive: true,
        modules,
        version,
      };
    } catch (error) {
      return {
        available: false,
        responsive: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check cluster health
   */
  async checkClusterHealth(): Promise<ClusterHealthStatus> {
    // For cluster health, we need to connect to cluster nodes individually
    // but use raw TCP connections since cluster nodes reject standalone Redis connections
    const nodeStatuses = await Promise.all(
      this.config.cluster.nodes.map(async node => {
        try {
          // Use simple TCP connection test instead of Redis client
          const net = await import('net');
          const socket = new net.Socket();

          return new Promise<{
            host: string;
            port: number;
            responsive: boolean;
          }>(resolve => {
            const timeout = setTimeout(() => {
              socket.destroy();
              resolve({ host: node.host, port: node.port, responsive: false });
            }, 3000);

            socket.on('connect', () => {
              clearTimeout(timeout);
              socket.destroy();
              resolve({ host: node.host, port: node.port, responsive: true });
            });

            socket.on('error', () => {
              clearTimeout(timeout);
              socket.destroy();
              resolve({ host: node.host, port: node.port, responsive: false });
            });

            socket.connect(node.port, node.host);
          });
        } catch {
          return {
            host: node.host,
            port: node.port,
            responsive: false,
          };
        }
      })
    );

    const responsiveNodes = nodeStatuses.filter(n => n.responsive);

    if (responsiveNodes.length === 0) {
      return {
        available: false,
        nodes: nodeStatuses,
        error: 'No cluster nodes are responsive',
      };
    }

    // Check cluster state using the cluster connection
    let clusterState: 'ok' | 'fail' | undefined;
    if (responsiveNodes.length >= 3) {
      try {
        // For Docker-based testing, assume cluster is OK if we have enough responsive nodes
        // The cluster initialization in Docker Compose handles cluster setup properly
        const { execSync } = await import('child_process');

        try {
          // Check if cluster state is OK via Docker exec
          const result = execSync(
            'docker exec test-valkey-cluster-1 valkey-cli -p 6379 cluster info',
            {
              encoding: 'utf8',
              timeout: 5000,
            }
          );

          if (result.includes('cluster_state:ok')) {
            clusterState = 'ok';
          } else {
            clusterState = 'fail';
          }
        } catch (dockerError) {
          // Fall back to external cluster connection test
          const cluster = new Cluster(responsiveNodes, {
            lazyConnect: true,
            connectTimeout: 5000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 1,
          });

          await cluster.connect();

          // Check cluster info using proper cluster command
          const info = await (cluster as any).customCommand([
            'CLUSTER',
            'INFO',
          ]);
          const infoStr = String(info);

          if (infoStr.includes('cluster_state:ok')) {
            clusterState = 'ok';
          } else if (infoStr.includes('cluster_state:fail')) {
            clusterState = 'fail';
          }

          await cluster.disconnect();
        }
      } catch {
        clusterState = 'fail';
      }
    } else {
      clusterState = 'fail';
    }

    return {
      available: responsiveNodes.length >= 3, // Need at least 3 nodes for a functional cluster
      nodes: nodeStatuses,
      clusterState,
    };
  }

  /**
   * Get configuration for standalone tests
   */
  getStandaloneConfig() {
    return {
      host: this.config.standalone.host,
      port: this.config.standalone.port,
      lazyConnect: true,
    };
  }

  /**
   * Get configuration for cluster tests
   */
  getClusterConfig() {
    return {
      nodes: this.config.cluster.nodes,
      lazyConnect: true,
    };
  }

  /**
   * Wait for servers to become healthy with timeout
   */
  async waitForHealthy(
    requirements: TestRequirements,
    timeout: number = 30000
  ): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeout) {
      try {
        await this.validate(requirements);
        return; // Success!
      } catch (error) {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }

    // Final attempt to get detailed error
    await this.validate(requirements);
  }

  /**
   * Get detailed status report
   */
  async getStatusReport(): Promise<string> {
    const lines: string[] = [];

    lines.push('🔍 Test Environment Status Report');
    lines.push('================================');

    // Standalone server
    const standaloneHealth = await this.checkStandaloneHealth();
    lines.push(
      `\n📡 Standalone Server (${this.config.standalone.host}:${this.config.standalone.port})`
    );
    lines.push(
      `   Status: ${standaloneHealth.responsive ? '✅ Responsive' : '❌ Not responsive'}`
    );

    if (standaloneHealth.version) {
      lines.push(`   Version: ${standaloneHealth.version}`);
    }

    if (standaloneHealth.modules && standaloneHealth.modules.length > 0) {
      lines.push(`   Modules: ${standaloneHealth.modules.join(', ')}`);
    }

    if (standaloneHealth.error) {
      lines.push(`   Error: ${standaloneHealth.error}`);
    }

    // Cluster
    const clusterHealth = await this.checkClusterHealth();
    lines.push(`\n🔗 Cluster (6 nodes)`);
    lines.push(
      `   State: ${clusterHealth.clusterState === 'ok' ? '✅ OK' : '❌ ' + (clusterHealth.clusterState || 'Unknown')}`
    );
    lines.push(
      `   Responsive nodes: ${clusterHealth.nodes.filter(n => n.responsive).length}/${clusterHealth.nodes.length}`
    );

    const unresponsiveNodes = clusterHealth.nodes.filter(n => !n.responsive);
    if (unresponsiveNodes.length > 0) {
      lines.push(
        `   Unresponsive: ${unresponsiveNodes.map(n => `${n.host}:${n.port}`).join(', ')}`
      );
    }

    lines.push('');
    return lines.join('\n');
  }
}

// Export singleton instance
export const testEnvironment = TestEnvironment.getInstance();
