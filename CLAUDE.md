# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run build:watch` - Compile with watch mode for development
- `npm run dev` - Run both build:watch and test:watch concurrently

### Testing
- `npm test` - Run all tests using test runner script (./scripts/test-runner.sh)
- `npm run test:cov` - Run tests with code coverage (c8)
- `npm run test:single` - Run single test with Node.js built-in test runner
- `npm run test:types` - Type-check test TypeScript files
- `./scripts/test-dual-mode.sh` - Run dual-mode tests (standalone + cluster)
- `ENABLE_CLUSTER_TESTS=true ./scripts/test-dual-mode.sh` - Run both standalone and cluster tests

### Code Quality
- `npm run lint` - Run ESLint on src/ and tests/
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Specific Test Commands
- `npm test tests/unit/` - Run unit tests only
- `npm test tests/integration/` - Run integration tests only
- `npm test tests/cluster/` - Run cluster-specific tests
- `npm test tests/unit/json-commands.test.mjs` - Run specific test file
- `npm test -- --testNamePattern="pattern"` - Run tests matching pattern
- `npm run test:json` - Run JSON module tests specifically
- `npm run test:modules` - Run both JSON and Search module tests

### Node.js Native Test Commands
- `VALKEY_HOST=localhost VALKEY_PORT=6383 timeout 30 node --test tests/unit/smoke.test.mjs` - Run specific native test
- `node --test tests/unit/dual-mode-*.test.mjs` - Run dual-mode tests using Node.js test runner
- `VALKEY_HOST=localhost VALKEY_PORT=6383 timeout 30 node --test tests/unit/string-commands.test.mjs` - Run string command tests
- `VALKEY_HOST=localhost VALKEY_PORT=6383 timeout 30 node --test tests/unit/hash-commands.test.mjs` - Run hash command tests
- `VALKEY_HOST=localhost VALKEY_PORT=6383 timeout 30 node --test tests/unit/json-commands.test.mjs` - Run JSON module tests with valkey-bundle

### Build & Release
- `npm run clean` - Remove dist/ directory
- `npm run prepublishOnly` - Clean, build, and test before publishing
- `npm run release` - Create semantic release
- `npm run release:dry` - Test release without publishing
- `npm run release:patch|minor|major` - Create specific version releases
- `npm run version:patch|minor|major` - Update version without git tag

### Valkey Module Testing Environment
- `npm run valkey:start` - Start valkey-bundle Docker container with all modules
- `npm run valkey:stop` - Stop valkey-bundle Docker container
- `npm run valkey:test` - Start valkey-bundle for testing environment

## Architecture

This is a **Valkey GLIDE ioredis adapter** - a true drop-in replacement for ioredis that uses Valkey GLIDE's high-performance Rust core while maintaining full ioredis API compatibility.

### Core Architecture
```
Application Code (ioredis API)
       ↓
Parameter Translation Layer
       ↓
Valkey GLIDE Native Methods
       ↓
Result Translation Layer
       ↓
ioredis-compatible Results
```

### Key Components

**Core Clients** (`src/`):
- `BaseClient.ts` - Core GLIDE client wrapper with all common database operations
- `StandaloneClient.ts` - Standalone-specific implementation extending BaseClient  
- `ClusterClient.ts` - Cluster-specific implementation extending BaseClient
- `Redis.ts` - ioredis-compatible Redis class wrapper around StandaloneClient
- `Cluster.ts` - ioredis-compatible Cluster class wrapper around ClusterClient

**Utilities** (`src/utils/`):
- `ParameterTranslator.ts` - Converts ioredis parameters to GLIDE format
- `ResultTranslator.ts` - Converts GLIDE results to ioredis format
- `IoredisPubSubClient.ts` - Binary-compatible pub/sub client using RESP protocol

**Types** (`src/types/`):
- Complete TypeScript type definitions matching ioredis interfaces
- Connection options, command parameters, result types

**Testing Utilities** (`tests/utils/`):
- `test-modes.mjs` - Dual-mode testing framework for standalone/cluster test execution
- Configuration helpers for both deployment types

### Current Implementation Status

**✅ Production Ready Features:**
- All Valkey data types (String, Hash, List, Set, ZSet) - 100% functional
- ValkeyJSON module support - 29 commands implemented
- Bull/BullMQ integration - Complete compatibility with createClient factory
- Express sessions, Socket.IO, rate limiting - All validated
- Transaction support (MULTI/EXEC, WATCH/UNWATCH)
- Stream operations (XADD, XREAD, XRANGE, etc.)
- System commands (CONFIG, INFO, DBSIZE, etc.)
- Cluster operations - Core database commands working

**Test Coverage: Production-ready with all critical features validated**

### **Development Status & Priorities**

**✅ COMPLETE (Production Ready)**
- All Valkey data types: String, Hash, List, Set, ZSet - fully functional
- JSON module: 29 commands fully implemented and tested
- Integration libraries: Bull/BullMQ, Socket.IO, Express Sessions - all validated
- Connection management: Pipelines, transactions, connection lifecycle
- Core cluster operations: All database commands work in cluster mode

**🔧 IN PROGRESS (Minor refinements)**
- Enhanced ZSET WITHSCORES result formatting edge cases
- Cluster TypeScript sendCommand method signature
- Complex Lua script execution patterns  
- Advanced stream operations result parsing
- Connection error handling in edge scenarios

**📈 IMPACT ASSESSMENT**
- **Most applications**: Can migrate immediately with zero code changes
- **Advanced use cases**: Minor limitations in some scenarios, workarounds available
- **Critical production patterns**: Validated and working

### Module Support

**ValkeyJSON (RedisJSON v2 compatible)**:
- 29 complete JSON commands (jsonSet, jsonGet, jsonDel, etc.)
- Full JSONPath support for complex document operations
- Array and object manipulation methods

**ValkeySearch (RediSearch v2 compatible)**:
- ⚠️ TEMPORARILY REMOVED - Search functionality removed in commit abae1d8 until GLIDE supports valkey-bundle syntax
- Previously had 18/20 tests passing with comprehensive FT command coverage
- Will be re-enabled when GLIDE adds proper valkey-bundle module support

## Development Patterns

### Critical Development Rule
- **NEVER ASSUME API OR BEHAVIOR** - Always check and research both GLIDE and ioredis APIs
- Verify behavior through documentation, testing, or implementation inspection
- Do not guess parameter mappings, connection semantics, or method signatures
- Always validate assumptions against actual GLIDE and ioredis implementations

### Pure GLIDE Architecture
- **Only use Valkey GLIDE APIs** - no direct server commands
- Custom logic implemented when GLIDE doesn't have direct equivalents
- Maintain ioredis compatibility through translation layers

### Code Structure
- Commands are organized into modules by data type
- Each command module extends base adapter functionality  
- Parameter/result translation happens at module boundaries
- Connection management centralized in base adapters

### Testing Requirements
- Unit tests for each command module (`tests/unit/`)
- Integration tests for real-world patterns (`tests/integration/`)
- Dual-mode tests for standalone/cluster compatibility (`tests/unit/dual-mode-*.test.mjs`)
- Special module testing with valkey-bundle Docker setup

### Key Implementation Notes
- ZSET operations require special `WITHSCORES` result handling
- JSON module is optional (graceful fallback)
- Connection validation prevents cluster/standalone mismatches
- Dual pub/sub architecture: Direct GLIDE callbacks (high-performance) + ioredis-compatible TCP (binary support)
- Transaction support through MultiAdapter/PipelineAdapter

## Configuration Files

- `tsconfig.json` - TypeScript config targeting ES2020/CommonJS
- `eslint.config.js` - ESLint with TypeScript and Prettier integration  
- `.c8rc.json` - Code coverage configuration for c8
- Test setup in `tests/setup/` with global setup and teardown
- `tests/global-setup.mjs` - Global test setup for Node.js test runner
- `scripts/` - Shell scripts for test environment management and releases
  - `test-runner.sh` - Unified test runner with optional coverage
  - `test-dual-mode.sh` - Dual-mode testing (standalone + cluster)
  - `start-valkey-bundle.sh` / `stop-valkey-bundle.sh` - Valkey module container management
  - `release.sh` - Semantic release management
- `docker-compose.valkey-bundle.yml` - Docker configuration for module testing with JSON/Search modules
- `docker-compose.test.yml` - Additional test environment configuration
- `tests/utils/test-modes.mjs` - Dual-mode testing configuration utilities

## Testing Environment Requirements

### For Standard Tests
- Valkey/Redis server running on localhost:6379 (or use environment variables)
- Tests automatically use `VALKEY_BUNDLE_HOST=localhost VALKEY_BUNDLE_PORT=6380` when available

### For Module Tests (JSON)
- Use valkey-bundle Docker container: `npm run valkey:start`
- Or manually: `docker-compose -f docker-compose.valkey-bundle.yml up -d`
- JSON module must be loaded on the server for full functionality
- Container exposes port 6380 for module testing (separate from regular testing on 6379)
- Container includes health checks to ensure modules are loaded before tests run
- Use `npm run valkey:test` to start container in test mode with proper environment configuration

### Test Execution Patterns
- **Sequential execution**: Tests run with `--test-concurrency=1` for connection stability
- **Coverage**: Run `npm run test:cov` to generate coverage reports (text, lcov, html)
- **Timeout handling**: 60s timeout for integration tests with Docker setup
- **Environment detection**: Tests automatically detect available Valkey modules
- **Dual-mode testing**: Same tests run against both standalone and cluster modes
- **Cluster testing**: Enable with `ENABLE_CLUSTER_TESTS=true` environment variable
- **Node.js requirement**: Tests require Node.js 18+ for built-in test runner

## Compatibility Matrix

The adapter maintains **complete compatibility** with:
- Bull/BullMQ job queues
- Express sessions (connect-redis)  
- Socket.IO server adapter
- Rate limiting (express-rate-limit)
- All major ioredis usage patterns

**19 real-world patterns validated** from GitHub/Stack Overflow production code.

## Critical Architecture Rules

### Method Implementation Pattern
- **BaseClient**: Contains methods that work identically for both standalone and cluster
- **StandaloneClient/ClusterClient**: Contains methods with different behavior between standalone and cluster
- **WATCH**: Implemented in BaseClient because both `GlideClient` and `GlideClusterClient` have the same `watch(keys: GlideString[])` signature
- **UNWATCH**: Implemented in specific clients because signatures differ:
  - GlideClient: `unwatch(): Promise<"OK">` (no parameters)
  - GlideClusterClient: `unwatch(options?: RouteOption): Promise<"OK">` (optional RouteOption)
- **PUBLISH**: Implemented in specific clients because signatures differ:
  - GlideClient (Standalone): `publish(message, channel)` - 2 parameters, no sharded pub/sub support
  - GlideClusterClient (Cluster): `publish(message, channel, sharded?)` - optional 3rd parameter for sharded pub/sub
- **Pub/Sub Subscription Modes**: Cluster clients support sharded channels, standalone clients don't:
  - Standalone: Exact, Pattern channels only
  - Cluster: Exact, Pattern, and Sharded channels (sharded available since Valkey 7.0)
- When method signatures differ between standalone and cluster, implement in the specific client classes, not BaseClient

### Development Methodology
- Never work in a methodology of fail and retry
- Always check GLIDE implementation AND ioredis implementation first
- Then fix with knowledge, not trial and error

## Dual-Mode Testing Framework

### Overview
The codebase implements a sophisticated dual-mode testing system that runs identical tests against both standalone and cluster deployments to ensure feature parity.

### Usage Patterns
```javascript
// Import dual-mode utilities
import { getTestConfig, testBothModes } from './utils/test-modes.mjs';

// Method 1: Manual mode configuration
const config = getTestConfig('standalone'); // or 'cluster'
const client = config.createClient();

// Method 2: Automatic dual-mode testing
testBothModes('String Commands', (getClient, mode) => {
  let client;
  beforeEach(async () => {
    client = getClient();
    await client.connect();
  });
  
  it('should work in both modes', async () => {
    // Same test logic works for both modes
    await client.set(`test:${mode}:key`, 'value');
    const result = await client.get(`test:${mode}:key`);
    assert.strictEqual(result, 'value');
  });
});
```

### Environment Variables
- `ENABLE_CLUSTER_TESTS=true` - Enable cluster mode testing
- `VALKEY_CLUSTER_NODES=localhost:17000,localhost:17001,localhost:17002` - Cluster node configuration
- Tests run in standalone mode by default, cluster mode only when explicitly enabled

### Dual-Mode Test Files
- Create tests with `dual-mode-*.test.mjs` naming pattern
- Use `testBothModes()` helper for automatic mode switching
- Tests automatically skip cluster mode if infrastructure unavailable

## Recent Changes & Status

### Current Development Focus
- **Internal naming updated to Valkey consistently** across the codebase
- **Dual-mode testing framework implemented** - Tests can run against both standalone and cluster modes
- **Node.js built-in test runner migration completed** - 100% test pass rate achieved
- **All core Valkey data types fully functional** - String, Hash, List, Set, ZSet operations production-ready
- **JSON module remains fully functional** with 29 commands implemented
- **Search functionality temporarily removed** due to GLIDE not supporting valkey-bundle syntax

### Test Framework Migration & Enhancement  
- Successfully migrated from Jest to Node.js built-in test runner
- All tests now use native Node.js testing capabilities
- Isolated test execution with proper cleanup via `./scripts/test-isolated.sh`
- **New dual-mode testing framework** enables running same tests against standalone and cluster
- Environment variable support: `VALKEY_HOST`, `VALKEY_PORT`, `VALKEY_BUNDLE_HOST`, `VALKEY_BUNDLE_PORT`, `ENABLE_CLUSTER_TESTS`

## Key File Locations

### Core Source Structure  
- `src/BaseClient.ts` - Core client implementation with all common database operations (1000+ lines)
- `src/StandaloneClient.ts` / `src/ClusterClient.ts` - Mode-specific implementations
- `src/Redis.ts` / `src/Cluster.ts` - ioredis-compatible wrapper classes  
- `src/index.ts` - Main export file for the adapter
- `src/commands/` - Command modules organized by data type (strings, hashes, lists, etc.)
- `src/utils/ParameterTranslator.ts` - Converts ioredis parameters to GLIDE format
- `src/utils/ResultTranslator.ts` - Converts GLIDE results to ioredis format
- `src/utils/OptionsMapper.ts` - Maps connection options between ioredis and GLIDE
- `src/utils/IoredisPubSubClient.ts` - Binary-compatible pub/sub using RESP protocol
- `src/types/index.ts` - Complete TypeScript interfaces matching ioredis

### Testing Infrastructure  
- `tests/utils/test-modes.mjs` - Dual-mode testing utilities for running same tests against standalone/cluster
- `tests/setup/` - Global test setup and teardown for Node.js test runner
- `tests/unit/` - Comprehensive unit tests for all command modules and features
- `tests/integration/` - Real-world integration tests (Bull/BullMQ, Socket.IO, Express sessions)
- `tests/global-setup.mjs` - Global setup for Node.js built-in test runner

### Scripts & Infrastructure
- `scripts/test-runner.sh` - Main test execution script with coverage support
- `scripts/test-dual-mode.sh` - Runs tests in both standalone and cluster modes
- `scripts/start-valkey-bundle.sh` / `scripts/stop-valkey-bundle.sh` - Docker module testing
- `docker-compose.valkey-bundle.yml` - Container config for JSON/Search module testing
- `docker-compose.test.yml` - Additional test environment configuration