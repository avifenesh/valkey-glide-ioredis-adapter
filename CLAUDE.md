# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run build:watch` - Compile with watch mode for development
- `npm run dev` - Run both build:watch and test:watch concurrently

### Testing
- `npm test` - Run all tests using dual-mode test runner (tests both standalone and cluster)
- `npm run test:standalone` - Run tests in standalone mode only
- `npm run test:cluster` - Run tests in cluster mode only
- `npm run test:cov` - Run tests with code coverage (c8)
- `npm run test:cov:standalone` - Coverage for standalone mode only
- `npm run test:cov:cluster` - Coverage for cluster mode only
- `npm run test:junit` - Run tests with JUnit XML output
- `npm run test:unit` - Run unit tests only (both modes)
- `npm run test:unit:standalone` - Unit tests in standalone mode
- `npm run test:unit:cluster` - Unit tests in cluster mode
- `npm run test:types` - Type-check test TypeScript files
- `npm run test:single` - Run single test with Node.js built-in test runner

### Direct Test Commands (bypass npm scripts)
- `./scripts/test-dual-mode.sh` - Run dual-mode tests (standalone + cluster)
- `./scripts/test-runner.sh` - Single mode test runner with infrastructure management
- `ENABLE_CLUSTER_TESTS=true ./scripts/test-dual-mode.sh` - Enable cluster testing
- `COVERAGE=1 ./scripts/test-dual-mode.sh` - Run with coverage
- `JUNIT=1 ./scripts/test-dual-mode.sh` - Generate JUnit XML reports

### Code Quality
- `npm run lint` - Run ESLint on src/ and tests/
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Specific Test Patterns
- `npm test tests/unit/` - Run unit tests only
- `npm test tests/integration/` - Run integration tests only
- `npm test tests/cluster/` - Run cluster-specific tests
- `npm test tests/unit/json-commands.test.mjs` - Run specific test file
- `npm run test:json` - Run JSON module tests specifically
- `npm run test:modules` - Run both JSON and Search module tests

### Node.js Native Test Commands
- `VALKEY_HOST=localhost VALKEY_PORT=6383 timeout 30 node --test tests/unit/smoke.test.mjs` - Run specific test with timeout
- `VALKEY_HOST=localhost VALKEY_PORT=6383 node --test --test-reporter=spec tests/unit/*.test.mjs` - Run with spec reporter
- `ENABLE_CLUSTER_TESTS=true node --test tests/cluster/*.test.mjs` - Run cluster tests directly

### Build & Release
- `npm run clean` - Remove dist/ directory
- `npm run prepublishOnly` - Clean, build, and test before publishing
- `npm run release` - Create semantic release
- `npm run release:dry` - Test release without publishing
- `npm run release:patch|minor|major` - Create specific version releases
- `npm run version:patch|minor|major` - Update version without git tag

### Docker Infrastructure
- `npm run valkey:start` - Start valkey-bundle Docker container with JSON/Search modules
- `npm run valkey:stop` - Stop valkey-bundle Docker container
- `npm run valkey:test` - Start valkey-bundle in test mode
- `docker-compose -f docker-compose.test.yml up -d` - Start test infrastructure
- `docker-compose -f docker-compose.cluster.yml up -d` - Start cluster infrastructure

## Architecture

This is a **Valkey GLIDE ioredis adapter** - a true drop-in replacement for ioredis that uses Valkey GLIDE's high-performance Rust core while maintaining full ioredis API compatibility.

### Core Architecture
```
Application Code (ioredis API)
       ↓
ioredis-compatible Classes (Redis/Cluster)
       ↓
Base/Standalone/Cluster Clients
       ↓
Parameter Translation Layer
       ↓
Valkey GLIDE Native Methods (@valkey/valkey-glide)
       ↓
Result Translation Layer
       ↓
ioredis-compatible Results
```

### Key Components

**Core Clients** (`src/`):
- `BaseClient.ts` - Core GLIDE client wrapper with all common database operations (~1000 lines)
- `StandaloneClient.ts` - Standalone-specific implementation extending BaseClient  
- `ClusterClient.ts` - Cluster-specific implementation extending BaseClient
- `Redis.ts` - ioredis-compatible Redis class wrapper around StandaloneClient
- `Cluster.ts` - ioredis-compatible Cluster class wrapper around ClusterClient
- `index.ts` - Main exports (Redis, Cluster, types)

**Command Modules** (`src/commands/`):
- `strings.ts`, `hashes.ts`, `lists.ts`, `sets.ts`, `zsets.ts` - Data type operations
- `streams.ts` - Stream operations (XADD, XREAD, etc.)
- `geo.ts`, `hll.ts`, `bitmaps.ts` - Specialized data structures
- `scripting.ts` - Lua scripting support
- `server.ts` - Server management commands
- `keys.ts` - Key management operations

**Utilities** (`src/utils/`):
- `ParameterTranslator.ts` - Converts ioredis parameters to GLIDE format
- `ResultTranslator.ts` - Converts GLIDE results to ioredis format
- `OptionsMapper.ts` - Maps connection options between ioredis and GLIDE
- `IoredisPubSubClient.ts` - Binary-compatible pub/sub client using RESP protocol

**Types** (`src/types/`):
- `index.ts` - Complete TypeScript type definitions matching ioredis interfaces
- Connection options, command parameters, result types

**Testing Infrastructure** (`tests/`):
- `utils/test-modes.mjs` - Dual-mode testing framework for standalone/cluster test execution
- `utils/test-config.mjs` - Configuration helpers
- `global-setup.mjs` - Minimal global test setup
- `unit/` - Comprehensive unit tests for all commands
- `integration/` - Real-world integration tests (Bull, Socket.IO, Express sessions)
- `cluster/` - Cluster-specific tests

### Current Implementation Status

**✅ Production Ready Features:**
- All Valkey data types (String, Hash, List, Set, ZSet) - 100% functional
- ValkeyJSON module support - 29 commands implemented and tested
- Bull/BullMQ integration - Complete compatibility with createClient factory pattern
- Express sessions (connect-redis), Socket.IO adapter, rate limiting - All validated
- Transaction support (MULTI/EXEC, WATCH/UNWATCH) with proper pipeline handling
- Stream operations (XADD, XREAD, XRANGE, XGROUP, etc.) - Full support
- Pub/Sub - Dual architecture (native GLIDE + binary-compatible RESP)
- Cluster operations - Core database commands with sharded pub/sub support
- Lua scripting - EVAL, EVALSHA, defineCommand support
- Connection management - Pipelines, lazy connect, auto-reconnect

**Test Coverage:**
- **Unit Tests:** 40+ test files covering all command modules
- **Integration Tests:** Real-world patterns validated (Bull, Socket.IO, sessions)
- **Dual-Mode Testing:** Same tests run against both standalone and cluster modes
- **Node.js 18+ built-in test runner:** 100% pass rate achieved

### Production Readiness

- **Drop-in replacement**: Zero code changes for most applications
- **Battle-tested**: 19 real-world patterns validated from GitHub/Stack Overflow
- **Performance**: Leverages GLIDE's Rust core for optimal throughput
- **Type safety**: Full TypeScript support with comprehensive interfaces
- **100% test pass rate**: All 648 tests passing

### Module Support

**ValkeyJSON (RedisJSON v2 compatible)**:
- ✅ 29 complete JSON commands (jsonSet, jsonGet, jsonDel, jsonType, jsonNumIncrBy, jsonArrAppend, etc.)
- ✅ Full JSONPath support for complex document operations
- ✅ Array and object manipulation methods
- ✅ Atomic operations on JSON documents
- ✅ Requires valkey-bundle Docker container or server with JSON module loaded

**ValkeySearch (RediSearch v2 compatible)**:
- ⚠️ Not yet implemented - Pending GLIDE support for valkey-bundle module command syntax

## Development Patterns

### Critical Development Rules
- **NEVER ASSUME API OR BEHAVIOR** - Always check and research both GLIDE and ioredis APIs
- **Verify behavior through documentation, testing, or implementation inspection**
- **Do not guess parameter mappings, connection semantics, or method signatures**
- **Always validate assumptions against actual GLIDE and ioredis implementations**
- **Never work in a methodology of fail and retry - understand first, then implement**

### Pure GLIDE Architecture
- **Only use Valkey GLIDE APIs** - no direct server commands or Redis protocol manipulation
- **Custom logic implemented when GLIDE doesn't have direct equivalents**
- **Maintain ioredis compatibility through translation layers**
- **All server communication goes through GLIDE client methods**

### Code Structure Patterns
- Commands organized into modules by data type (`src/commands/*.ts`)
- Each command module exports functions that operate on client instances
- Parameter translation happens in `ParameterTranslator.ts`
- Result translation happens in `ResultTranslator.ts`
- Connection management centralized in BaseClient/StandaloneClient/ClusterClient
- Type definitions in `src/types/index.ts` match ioredis interfaces exactly

### Testing Requirements
- **Unit tests** for each command module (`tests/unit/*.test.mjs`)
- **Integration tests** for real-world patterns (`tests/integration/*.test.mjs`)
- **Dual-mode tests** automatically run against both standalone and cluster
- **Module testing** requires valkey-bundle Docker container
- **All tests use Node.js built-in test runner** (no Jest)
- **Sequential test execution** (`--test-concurrency=1`) for connection stability

### Key Implementation Patterns
- **ZSET operations**: Special `WITHSCORES` result handling to match ioredis format
- **JSON module**: Optional with graceful fallback when not available
- **Connection validation**: Prevents cluster/standalone configuration mismatches
- **Dual pub/sub architecture**: 
  - Direct GLIDE callbacks for high-performance text messages
  - TCP-based IoredisPubSubClient for binary compatibility (Socket.IO)
- **Transaction support**: Multi/Pipeline adapters wrap GLIDE transaction objects
- **Error handling**: Map GLIDE errors to ioredis-compatible error types

## Configuration Files

### Build Configuration
- `tsconfig.json` - TypeScript config targeting ES2020/CommonJS
  - Strict mode enabled with all strict checks
  - Source maps and declarations generated
  - Compiles `src/` to `dist/`
- `eslint.config.js` - ESLint with TypeScript and Prettier integration
  - Lenient rules for release stability
  - Separate configs for TypeScript and JavaScript test files
- `.c8rc.json` - Code coverage configuration for c8
  - Reports: text, lcov, html
  - Covers `dist/**/*.js` files

### Test Infrastructure
- `tests/global-setup.mjs` - Minimal global test setup for Node.js test runner
- `tests/utils/test-modes.mjs` - Dual-mode testing framework (standalone/cluster)
- `tests/utils/test-config.mjs` - Test configuration helpers

### Shell Scripts (`scripts/`)
- `test-runner.sh` - Main test runner with infrastructure management
  - Auto-starts Docker containers if needed
  - Supports coverage, JUnit output, specific test paths
  - Handles both standalone and cluster modes
- `test-dual-mode.sh` - Runs tests in both standalone and cluster modes
  - Sequential execution: standalone first, then cluster
  - Automatic infrastructure setup and teardown
  - Combined exit status reporting
- `start-valkey-bundle.sh` / `stop-valkey-bundle.sh` - Module container management
- `start-test-cluster.sh` / `stop-test-cluster.sh` - Local cluster setup
- `release.sh` - Semantic release management

### Docker Configurations
- `docker-compose.valkey-bundle.yml` - Valkey with JSON/Search modules (port 6380)
- `docker-compose.test.yml` - Complete test infrastructure
  - Standalone server with modules (port 6383)
  - 3-node cluster setup (ports 17000-17002)
- `docker-compose.cluster.yml` - Simplified all-in-one cluster container

## Testing Environment

### Standard Test Setup
- **Default ports**: Standalone on 6383, Cluster on 17000-17002
- **Auto-infrastructure**: Test scripts automatically start Docker containers if needed
- **Environment variables**:
  - `VALKEY_HOST` / `VALKEY_PORT` - Override standalone connection
  - `VALKEY_CLUSTER_NODES` - Override cluster nodes (comma-separated)
  - `ENABLE_CLUSTER_TESTS=true` - Enable cluster mode testing
  - `DISABLE_STANDALONE_TESTS=true` - Skip standalone tests
  - `DISABLE_CLUSTER_TESTS=true` - Skip cluster tests
  - `SKIP_INFRA_MANAGEMENT=true` - Don't auto-start infrastructure
  - `KEEP_INFRA=1` - Don't stop infrastructure after tests

### Module Testing (JSON/Search)
- **valkey-bundle required**: Docker container with modules pre-loaded
- **Start**: `npm run valkey:start` or `docker-compose -f docker-compose.valkey-bundle.yml up -d`
- **Port**: 6380 (separate from standard test port 6383)
- **Health checks**: Ensures modules are loaded before tests run
- **Module detection**: Tests automatically detect if JSON module is available

### Test Execution Patterns
- **Sequential execution**: `--test-concurrency=1` for connection stability
- **Coverage reports**: `npm run test:cov` generates text, lcov, html
- **JUnit output**: `JUNIT=1 npm test` generates XML reports
- **Timeout handling**: 30-60s timeouts for different test types
- **Dual-mode testing**: Automatically runs tests in both modes
- **Node.js 18+ required**: Uses built-in test runner

### Quick Test Commands
```bash
# Run all tests (both modes)
npm test

# Run with coverage
npm run test:cov

# Run standalone only
npm run test:standalone

# Run cluster only
npm run test:cluster

# Run specific test file
npm test tests/unit/string-commands.test.mjs

# Run with custom server
VALKEY_HOST=myserver VALKEY_PORT=6379 npm test
```

## Compatibility Matrix

The adapter maintains **complete compatibility** with:
- Bull/BullMQ job queues
- Express sessions (connect-redis)  
- Socket.IO server adapter
- Rate limiting (express-rate-limit)
- All major ioredis usage patterns

**19 real-world patterns validated** from GitHub/Stack Overflow production code.

## Critical Architecture Rules

### Method Implementation Placement
**BaseClient** contains methods that:
- Have identical signatures in both GlideClient and GlideClusterClient
- Behave the same way in standalone and cluster modes
- Example: `watch(keys)` - same signature in both GLIDE clients

**StandaloneClient/ClusterClient** contain methods that:
- Have different signatures between GlideClient and GlideClusterClient
- Require mode-specific behavior or parameters
- Examples:
  - `unwatch()` - Standalone has no params, Cluster has optional RouteOption
  - `publish()` - Standalone has 2 params, Cluster has optional 3rd for sharded pub/sub
  - Pub/Sub subscriptions - Cluster supports sharded channels, standalone doesn't

### GLIDE API Differences to Remember
- **Pub/Sub Modes**:
  - Standalone: Regular channels and patterns only
  - Cluster: Regular, patterns, AND sharded channels (Valkey 7.0+)
- **Transaction Context**:
  - Some commands behave differently inside MULTI/EXEC blocks
  - WATCH/UNWATCH have special transaction semantics
- **Routing in Cluster**:
  - Cluster commands may need RouteOption for targeting specific nodes
  - Standalone never needs routing options

### Development Methodology
1. **Research First**: Check both GLIDE and ioredis documentation/source
2. **Understand Semantics**: Know what the command does and its options
3. **Check Signatures**: Verify GLIDE method signatures for both client types
4. **Implement with Knowledge**: Write code based on understanding, not guessing
5. **Test Both Modes**: Ensure it works in standalone AND cluster

## Dual-Mode Testing Framework

### Overview
The codebase uses a dual-mode testing system that runs identical tests against both standalone and cluster deployments, ensuring complete feature parity and compatibility.

### Test Mode Configuration
```javascript
// Import dual-mode utilities
import { getTestConfig, testBothModes } from '../utils/test-modes.mjs';

// Method 1: Manual mode selection
const config = getTestConfig('standalone'); // or 'cluster'
const client = config.createClient({ lazyConnect: true });
await client.connect();

// Method 2: Automatic dual-mode testing (recommended)
testBothModes('Feature Name', (getClient, mode) => {
  let client;
  
  beforeEach(async () => {
    client = getClient();
    await client.connect();
  });
  
  afterEach(async () => {
    await client.quit();
  });
  
  it('should work in both modes', async () => {
    // Test implementation - same code for both modes
    await client.set(`test:${mode}:key`, 'value');
    const result = await client.get(`test:${mode}:key`);
    assert.strictEqual(result, 'value');
  });
});
```

### Environment Control
```bash
# Run both modes (default for npm test)
npm test

# Run standalone only
DISABLE_CLUSTER_TESTS=true npm test

# Run cluster only
ENABLE_CLUSTER_TESTS=true DISABLE_STANDALONE_TESTS=true npm test

# Custom cluster nodes
VALKEY_CLUSTER_NODES="server1:7000,server2:7001" npm test
```

### Writing Dual-Mode Tests
1. **Use unique keys**: Include `mode` in key names to avoid conflicts
2. **Handle mode differences**: Some features are cluster-only (e.g., sharded pub/sub)
3. **Clean up properly**: Always quit clients in afterEach
4. **Test both success and failure**: Ensure error handling works in both modes

### Mode-Specific Behavior
```javascript
it('should handle mode-specific features', async () => {
  if (mode === 'cluster') {
    // Cluster-only: sharded pub/sub
    await client.spublish('shard-channel', 'message');
  } else {
    // Standalone-only: SELECT database
    await client.select(1);
  }
});
```

## Production Status

### Production Ready
- ✅ **Core data types**: All Valkey types fully implemented and tested
- ✅ **Library integrations**: Bull, BullMQ, Socket.IO, Express sessions validated
- ✅ **Cluster operations**: Sharded pub/sub, multi-node operations working
- ✅ **JSON module**: 29 commands with comprehensive test coverage
- ✅ **Performance**: Leveraging GLIDE's Rust core for optimal throughput
- ✅ **Type safety**: Complete TypeScript definitions matching ioredis

### Test Infrastructure
- **Dual-mode testing**: All tests run against both standalone and cluster
- **Automatic setup**: Test runner manages Docker containers
- **Coverage reports**: C8 integration for code coverage
- **JUnit output**: XML reports for CI/CD integration
- **Environment flexibility**: Easy configuration via env vars

## Important File Locations

### Core Implementation (`src/`)
- **Client Classes**:
  - `BaseClient.ts` - Core implementation with common operations (~1000 lines)
  - `StandaloneClient.ts` - Standalone-specific methods
  - `ClusterClient.ts` - Cluster-specific methods with sharded pub/sub
  - `Redis.ts` - ioredis-compatible wrapper for standalone
  - `Cluster.ts` - ioredis-compatible wrapper for cluster
  - `index.ts` - Main exports

- **Command Modules** (`commands/`):
  - Data types: `strings.ts`, `hashes.ts`, `lists.ts`, `sets.ts`, `zsets.ts`
  - Specialized: `streams.ts`, `geo.ts`, `hll.ts`, `bitmaps.ts`
  - Operations: `keys.ts`, `scripting.ts`, `server.ts`

- **Utilities** (`utils/`):
  - `ParameterTranslator.ts` - ioredis → GLIDE parameter conversion
  - `ResultTranslator.ts` - GLIDE → ioredis result conversion
  - `OptionsMapper.ts` - Connection option mapping
  - `IoredisPubSubClient.ts` - Binary-compatible pub/sub

- **Types** (`types/`):
  - `index.ts` - Complete ioredis-compatible TypeScript definitions

### Test Suite (`tests/`)
- **Utilities** (`utils/`):
  - `test-modes.mjs` - Dual-mode testing framework
  - `test-config.mjs` - Configuration helpers
  - `valkey-bundle-config.mjs` - Module testing config

- **Test Files**:
  - `unit/*.test.mjs` - Command module tests
  - `integration/*.test.mjs` - Library integration tests
  - `cluster/*.test.mjs` - Cluster-specific tests

### Infrastructure
- **Scripts** (`scripts/`):
  - `test-runner.sh` - Main test runner with auto-infrastructure
  - `test-dual-mode.sh` - Dual-mode test orchestrator
  - `start-valkey-bundle.sh` - Module container management
  - `release.sh` - Semantic release helper

- **Docker Configs**:
  - `docker-compose.test.yml` - Main test infrastructure
  - `docker-compose.cluster.yml` - Simplified cluster setup
  - `docker-compose.valkey-bundle.yml` - JSON/Search modules