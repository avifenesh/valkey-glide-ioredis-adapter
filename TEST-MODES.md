# Test Modes Documentation

## Overview

The test suite now runs in **dual-mode by default**, testing both standalone and cluster configurations to ensure complete compatibility across deployment types.

## Test Scripts

### Default Dual-Mode Testing

```bash
# Run all tests in both standalone and cluster modes (DEFAULT)
npm test

# Run unit tests in both modes
npm run test:unit

# Run with coverage in both modes
npm run test:cov
```

### Mode-Specific Testing

```bash
# Standalone mode only
npm run test:standalone
npm run test:unit:standalone
npm run test:cov:standalone

# Cluster mode only
npm run test:cluster
npm run test:unit:cluster
npm run test:cov:cluster
```

## Environment Variables

Tests respect the following environment variables:

- `DISABLE_STANDALONE_TESTS=true` - Skip standalone mode tests
- `DISABLE_CLUSTER_TESTS=true` - Skip cluster mode tests  
- `ENABLE_CLUSTER_TESTS=true` - Explicitly enable cluster tests
- `VALKEY_HOST` - Override default host (default: localhost)
- `VALKEY_PORT` - Override default standalone port (default: 6383)
- `VALKEY_CLUSTER_NODES` - Override cluster nodes (default: localhost:17000,localhost:17001,localhost:17002)
- `KEEP_INFRA=1` - Keep test infrastructure running after tests complete

## Test Infrastructure

### Docker Compose Setup

The `docker-compose.test.yml` provides complete test infrastructure:

```bash
# Start all test infrastructure
docker compose -f docker-compose.test.yml up -d

# Initialize cluster
docker compose -f docker-compose.test.yml --profile cluster up -d cluster-init
```

This creates:
- **Standalone**: Port 6383 with JSON/Search modules
- **Cluster**: Ports 17000-17005 (6 nodes, 3 masters + 3 replicas)

### Local Testing

For local development without Docker:

```bash
# Start local Valkey on custom port
valkey-server --port 6390 --daemonize yes

# Run tests with local instance
VALKEY_PORT=6390 npm test:standalone
```

## Test File Configuration

Test files automatically detect and run in appropriate modes based on environment:

```javascript
// Tests run in both modes by default
const testModes = [];

// Add standalone unless disabled
if (process.env.DISABLE_STANDALONE_TESTS !== 'true') {
  testModes.push({
    name: 'standalone',
    createClient: () => new Redis(getStandaloneConfig())
  });
}

// Add cluster if enabled or not explicitly disabled
if (process.env.ENABLE_CLUSTER_TESTS === 'true' || 
    (process.env.DISABLE_CLUSTER_TESTS !== 'true' && 
     process.env.DISABLE_STANDALONE_TESTS === 'true')) {
  testModes.push({
    name: 'cluster',
    createClient: () => new Cluster(getClusterConfig())
  });
}
```

## Priority and Philosophy

1. **Dual-mode is the default** - All tests must pass in both standalone and cluster modes
2. **No graceful skipping** - If infrastructure isn't available, tests fail (not skip)
3. **Cluster is prioritized** - We ensure cluster compatibility as it's more complex
4. **100% compatibility** - Every feature must work identically in both modes

## Troubleshooting

### GLIDE Connection Issues

If experiencing connection issues with Docker containers:

1. Ensure Docker containers are healthy:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep valkey
```

2. Test connectivity directly:
```bash
docker exec test-valkey-standalone valkey-cli ping
docker exec test-valkey-cluster-1 valkey-cli cluster info
```

3. Use local Valkey instance as fallback:
```bash
valkey-server --port 6390 --daemonize yes
VALKEY_PORT=6390 npm test:standalone
```

### Running Specific Test Files

```bash
# Run specific test in both modes
npm test tests/unit/stream-commands.test.mjs

# Run specific test in standalone only
npm run test:standalone tests/unit/stream-commands.test.mjs

# Run specific test in cluster only
npm run test:cluster tests/unit/stream-commands.test.mjs
```

## CI/CD Integration

For CI environments, ensure:

1. Docker/Docker Compose is available
2. Run infrastructure setup before tests:
```bash
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.test.yml --profile cluster up -d cluster-init
npm test
```

3. Clean up after tests:
```bash
docker compose -f docker-compose.test.yml down
```