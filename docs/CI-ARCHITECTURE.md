# CI Architecture

This document describes the continuous integration (CI) architecture for the Valkey GLIDE ioredis adapter.

## Overview

The CI system is designed with separate jobs to optimize performance and reliability:

- **Non-Docker Valkey testing** for core functionality (standalone + cluster)
- **Docker-based JSON module testing** for specialized features requiring valkey-bundle

## CI Jobs

### 1. `test-valkey-standalone`
**Purpose**: Test core functionality against a standalone Valkey/Redis instance

**Infrastructure**:
- Installs `redis-server` package directly on Ubuntu runner
- Runs single Redis instance on port 6379
- Uses Valkey-compatible configuration

**Tests**:
- 28 unit test files (excluding JSON tests)
- 13 integration test files
- Libraries: Bull, BullMQ, Socket.IO, Express sessions, etc.

**Environment**:
```bash
VALKEY_HOST=127.0.0.1
VALKEY_PORT=6379
SKIP_MODULE_TESTS=true
```

### 2. `test-valkey-cluster` 
**Purpose**: Test cluster-specific functionality

**Infrastructure**:
- Installs `redis-server` package directly on Ubuntu runner
- Creates 6-node Redis cluster (ports 17000-17005)
- 3 masters + 3 replicas configuration

**Tests**:
- 2 cluster-specific test files
- Tests cluster operations and sharded pub/sub

**Environment**:
```bash
VALKEY_CLUSTER_NODES=127.0.0.1:17000,127.0.0.1:17001,127.0.0.1:17002
ENABLE_CLUSTER_TESTS=true
SKIP_MODULE_TESTS=true
```

### 3. `test-json-modules`
**Purpose**: Test JSON module functionality (requires valkey-bundle)

**Infrastructure**:
- Uses Docker service: `valkey/valkey-bundle:8.1-bookworm`
- Includes JSON, Search, and Bloom modules
- Exposed on port 6383

**Tests**:
- 1 JSON module test file (`json-commands.test.mjs`)
- Full JSONPath and document operations

**Environment**:
```bash
VALKEY_HOST=127.0.0.1
VALKEY_PORT=6383
VALKEY_BUNDLE_HOST=127.0.0.1
VALKEY_BUNDLE_PORT=6383
```

### 4. `lint`
**Purpose**: Code quality and type checking

**Tasks**:
- ESLint validation
- TypeScript compilation check

### 5. `test-macos`
**Purpose**: Cross-platform compatibility validation

**Infrastructure**:
- Uses Homebrew to install actual Valkey on macOS
- Runs subset of core tests

## Test Filtering

### Non-JSON Tests
The main CI jobs exclude JSON-related tests using:
```bash
find tests/unit -name "*.test.mjs" ! -name "*json*"
```

### JSON Tests
The JSON module job runs only:
```bash
tests/unit/json-commands.test.mjs
```

## Benefits

### Performance
- **Faster startup**: Non-Docker setup is quicker than containers
- **Parallel execution**: Independent jobs run simultaneously
- **Resource optimization**: Each job uses appropriate infrastructure

### Reliability
- **Stable packages**: Uses Ubuntu's maintained Redis package
- **Isolation**: JSON module issues don't affect core functionality
- **Proper cleanup**: Each job handles connection and server cleanup

### Maintainability
- **Clear separation**: Core vs. module functionality testing
- **Focused failures**: Easy to identify which area has issues
- **Scalable**: Easy to add new module testing jobs

## Local Development

### Running Core Tests
```bash
# Install Redis locally
sudo apt-get install redis-server  # Ubuntu
brew install redis                 # macOS

# Start Redis
redis-server --port 6379

# Run sample tests
./scripts/run-ci-tests-locally.sh
```

### Running JSON Tests
```bash
# Start valkey-bundle with Docker
docker run -d -p 6383:6379 valkey/valkey-bundle:8.1-bookworm

# Run JSON tests
VALKEY_BUNDLE_HOST=localhost VALKEY_BUNDLE_PORT=6383 \
  ./scripts/test-runner.sh tests/unit/json-commands.test.mjs
```

## Migration from Previous CI

### Before
- Single Docker-based job for all tests
- Used `valkey-bundle` service for everything
- Slower startup times
- Module dependencies affected all tests

### After
- Separate jobs for different test types
- Non-Docker for core functionality
- Docker only for module-specific features
- Faster and more reliable execution

## Test Coverage

| Category | Count | Job | Infrastructure |
|----------|-------|-----|----------------|
| Unit Tests (Core) | 28 | `test-valkey-standalone` | Non-Docker Redis |
| Integration Tests | 13 | `test-valkey-standalone` | Non-Docker Redis |
| Cluster Tests | 2 | `test-valkey-cluster` | Non-Docker Redis Cluster |
| JSON Module Tests | 1 | `test-json-modules` | Docker valkey-bundle |
| **Total** | **44** | | |

This architecture ensures comprehensive testing while optimizing for speed and reliability.