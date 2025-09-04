/**
 * Global Test Setup
 *
 * Manages the complete test infrastructure:
 * - Docker Compose based server management
 * - Standalone server with modules (JSON, Search)
 * - Full cluster (6 nodes properly configured)
 * - Health validation and status reporting
 * - Fail fast if servers aren't available
 */

import { execSync } from 'child_process';
// @ts-ignore
import * as testEnvironment from '../utils/testEnvironment';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'blue') {
  console.log(`${colors[color]}🔧 ${message}${colors.reset}`);
}

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

async function checkDockerAvailability(): Promise<boolean> {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    execSync('docker info', { stdio: 'ignore' });

    // Check for docker compose
    try {
      execSync('docker compose version', { stdio: 'ignore' });
      return true;
    } catch {
      try {
        execSync('docker-compose --version', { stdio: 'ignore' });
        return true;
      } catch {
        logError('Docker Compose not available (neither V2 nor V1)');
        return false;
      }
    }
  } catch {
    logError('Docker not available or not running');
    return false;
  }
}

function getDockerComposeCommand(): string {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return 'docker compose';
  } catch {
    return 'docker-compose';
  }
}

async function startTestServers(): Promise<void> {
  const composeCmd = getDockerComposeCommand();

  log('Starting test infrastructure with Docker Compose...');

  try {
    // Start standalone server (always needed)
    execSync(
      `${composeCmd} -f docker-compose.test.yml up -d valkey-standalone`,
      {
        stdio: 'inherit',
        timeout: 120000,
      }
    );

    logSuccess('Standalone server started');

    // Start cluster nodes
    log('Starting cluster nodes...');
    execSync(
      `${composeCmd} -f docker-compose.test.yml up -d valkey-cluster-1 valkey-cluster-2 valkey-cluster-3 valkey-cluster-4 valkey-cluster-5 valkey-cluster-6`,
      {
        stdio: 'inherit',
        timeout: 120000,
      }
    );

    logSuccess('Cluster nodes started');

    // Initialize cluster
    log('Initializing cluster...');
    execSync(
      `${composeCmd} -f docker-compose.test.yml --profile cluster up -d cluster-init`,
      {
        stdio: 'inherit',
        timeout: 60000,
      }
    );

    logSuccess('Cluster initialized');
  } catch (error) {
    logError('Failed to start test servers with Docker Compose');
    throw error;
  }
}

async function checkExistingServers(): Promise<boolean> {
  try {
    // Quick check if our containers are running
    const composeCmd = getDockerComposeCommand();
    const result = execSync(
      `${composeCmd} -f docker-compose.test.yml ps --services --filter "status=running"`,
      {
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );

    const runningServices = result.trim().split('\n').filter(Boolean);

    // Check if essential services are running
    const hasStandalone = runningServices.includes('valkey-standalone');
    const hasClusterNodes = [
      'valkey-cluster-1',
      'valkey-cluster-2',
      'valkey-cluster-3',
    ].every(node => runningServices.includes(node));

    if (hasStandalone && hasClusterNodes) {
      log('Found existing test servers running');
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function waitForServersReady(requirements: any): Promise<void> {
  log('Waiting for servers to be ready...');

  try {
    // Wait for servers with timeout
    await testEnvironment.waitForHealthy(requirements, 60000); // 60 second timeout

    logSuccess('All servers are ready and healthy');
  } catch (error) {
    logError('Servers failed to become ready in time');

    // Get detailed status for debugging
    const status = await testEnvironment.getStatusReport();
    console.log(status);

    throw error;
  }
}

module.exports = async () => {
  console.log(
    `${colors.cyan}${colors.bright}🚀 Setting up test infrastructure...${colors.reset}\n`
  );

  // Determine what modules are needed based on test patterns
  const testArgs = process.argv.slice(2);
  const needsJSON = testArgs.some(
    arg => arg.includes('json') || arg.includes('JSON')
  );
  // const needsSearch = testArgs.some(arg => arg.includes('search') || arg.includes('Search'));
  const isClusterTest = testArgs.some(arg => arg.includes('cluster'));

  const requiredModules = [];
  if (needsJSON) requiredModules.push('json');
  // Re-enable search module requirement with better detection
  if (testArgs.some(arg => arg.includes('search') || arg.includes('Search'))) {
    requiredModules.push('search');
  }

  log(
    `Test requirements: ${isClusterTest ? 'cluster + standalone' : 'standalone'}, modules: ${requiredModules.length ? requiredModules.join(', ') : 'none'}`
  );

  // PRIORITY 1: If CI environment variables are set, use them
  if (process.env.VALKEY_BUNDLE_HOST && process.env.VALKEY_BUNDLE_PORT) {
    log(
      `Using CI Valkey Bundle: ${process.env.VALKEY_BUNDLE_HOST}:${process.env.VALKEY_BUNDLE_PORT}`
    );

    // Set compatibility env vars
    process.env.REDIS_HOST = process.env.VALKEY_BUNDLE_HOST;
    process.env.REDIS_PORT = process.env.VALKEY_BUNDLE_PORT;
    process.env.VALKEY_HOST = process.env.VALKEY_BUNDLE_HOST;
    process.env.VALKEY_PORT = process.env.VALKEY_BUNDLE_PORT;

    // Validate the CI environment works
    try {
      await testEnvironment.validate({
        standalone: true,
        modules: requiredModules,
      });
      logSuccess('CI environment validated successfully');
      return;
    } catch (error) {
      logError(`CI environment validation failed: ${error}`);
      throw error;
    }
  }

  // PRIORITY 2: Check if servers are already running
  if (await checkExistingServers()) {
    try {
      const requirements: any = { standalone: true };
      if (isClusterTest) requirements.cluster = true;
      if (requiredModules.length > 0) requirements.modules = requiredModules;

      await testEnvironment.validate(requirements);
      logSuccess('Using existing test servers (already validated)');

      // Set environment variables for compatibility
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6379';
      process.env.VALKEY_HOST = 'localhost';
      process.env.VALKEY_PORT = '6379';

      return;
    } catch (error) {
      logWarning('Existing servers found but not healthy, will restart them');
    }
  }

  // PRIORITY 3: Start servers with Docker Compose
  if (!(await checkDockerAvailability())) {
    logError('Docker not available - cannot start test servers');
    logError(
      'Please install Docker and Docker Compose, or provide CI environment variables'
    );
    throw new Error('Test infrastructure unavailable');
  }

  try {
    await startTestServers();

    // Prepare requirements for validation
    const requirements: any = { standalone: true };
    if (isClusterTest) requirements.cluster = true;
    if (requiredModules.length > 0) requirements.modules = requiredModules;

    await waitForServersReady(requirements);

    // Set environment variables for tests
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.VALKEY_HOST = 'localhost';
    process.env.VALKEY_PORT = '6379';

    // Set cluster ports
    process.env.VALKEY_CLUSTER_PORT_1 = '17000';
    process.env.VALKEY_CLUSTER_PORT_2 = '17001';
    process.env.VALKEY_CLUSTER_PORT_3 = '17002';
    process.env.VALKEY_CLUSTER_PORT_4 = '17003';
    process.env.VALKEY_CLUSTER_PORT_5 = '17004';
    process.env.VALKEY_CLUSTER_PORT_6 = '17005';

    logSuccess('Test infrastructure ready! 🎉');

    // Show status report
    const status = await testEnvironment.getStatusReport();
    console.log(`\n${status}`);
  } catch (error) {
    logError('Failed to set up test infrastructure');
    console.error(error);

    // Try to get status even if setup failed
    try {
      const status = await testEnvironment.getStatusReport();
      console.log(`\n${status}`);
    } catch {
      // Ignore status errors if setup completely failed
    }

    throw error;
  }
};
