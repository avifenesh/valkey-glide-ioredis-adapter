# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run build:watch` - Compile with watch mode for development
- `npm run dev` - Run both build:watch and test:watch concurrently

### Testing
- `npm test` - Run all tests using isolated test runner script
- `npm run test:single` - Run single test with Node.js built-in test runner
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ci` - Run tests for CI with coverage and no watch

### Code Quality
- `npm run lint` - Run ESLint on src/ and tests/
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Specific Test Commands
- `npm test tests/unit/` - Run unit tests only
- `npm test tests/integration/` - Run integration tests only
- `npm test tests/cluster/` - Run cluster-specific tests
- `npm test -- tests/unit/json-commands.test.ts` - Run specific test file
- `npm test -- --testNamePattern="pattern"` - Run tests matching pattern
- `npm run test:json` - Run JSON module tests specifically
- `npm run test:search` - Run Search module tests specifically
- `npm run test:modules` - Run both JSON and Search module tests

### Node.js Native Test Commands
- `VALKEY_HOST=localhost VALKEY_PORT=6381 timeout 30 node --test tests/unit/smoke.test.mjs` - Run specific native test
- `./scripts/test-isolated.sh` - Run tests in isolated environment with proper cleanup

### Build & Release
- `npm run clean` - Remove dist/ directory
- `npm run prepublishOnly` - Clean, build, and test before publishing
- `npm run release` - Create semantic release
- `npm run release:dry` - Test release without publishing
- `npm run release:patch|minor|major` - Create specific version releases

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

### Current Implementation Status

**✅ Production Ready Features:**
- All Valkey data types (String, Hash, List, Set, ZSet) - 100% functional
- ValkeyJSON module support - 31 commands implemented
- Valkey Search module support - 21 commands implemented  
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
- Search module: Full-text and vector search working
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
- 31 complete JSON commands (jsonSet, jsonGet, jsonDel, etc.)
- Full JSONPath support for complex document operations
- Array and object manipulation methods

**Valkey Search (RediSearch compatible)**:
- 21 complete search commands (ftCreate, ftSearch, ftAggregate, etc.)
- Full-text search, vector similarity, aggregations
- AI/ML ready with vector embeddings support

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
- Coverage threshold: 80% (branches, functions, lines, statements)
- Special module testing with valkey-bundle Docker setup

### Key Implementation Notes
- ZSET operations require special `WITHSCORES` result handling
- JSON and Search modules are optional (graceful fallbacks)
- Connection validation prevents cluster/standalone mismatches
- Dual pub/sub architecture: Direct GLIDE callbacks (high-performance) + ioredis-compatible TCP (binary support)
- Transaction support through MultiAdapter/PipelineAdapter

## Configuration Files

- `jest.config.js` - Jest test configuration with 20s timeout, maxWorkers: 1 for stability
- `tsconfig.json` - TypeScript config targeting ES2020/CommonJS
- `eslint.config.js` - ESLint with TypeScript and Prettier integration
- Test setup in `tests/setup/` with global setup and teardown
- `scripts/` - Shell scripts for test environment management and releases
- `docker-compose.valkey-bundle.yml` - Docker configuration for module testing

## Testing Environment Requirements

### For Standard Tests
- Valkey/Redis server running on localhost:6379 (or use environment variables)
- Tests automatically use `VALKEY_BUNDLE_HOST=localhost VALKEY_BUNDLE_PORT=6380` when available

### For Module Tests (JSON/Search)
- Use valkey-bundle Docker container: `npm run valkey:start`
- Or manually: `docker-compose -f docker-compose.valkey-bundle.yml up -d`
- JSON and Search modules must be loaded on the server for full functionality

### Test Execution Patterns
- **Sequential execution**: Jest configured with maxWorkers: 1 for connection stability
- **Timeout handling**: 20s timeout for integration tests with Docker setup
- **Environment detection**: Tests automatically detect available Valkey modules

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