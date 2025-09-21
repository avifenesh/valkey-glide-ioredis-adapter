# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Most Common Commands
```bash
# Build the project
npm run build

# Run all tests (standalone → cluster → JSON)
npm test

# Run quick test (standalone only)
npm run test:quick

# Run a single test file
node --test tests/unit/string-commands.test.mjs

# Lint and format
npm run lint:fix
npm run format
```

### Test Commands
```bash
# Run all tests in sequence
npm test

# Run specific test suites
npm run test:standalone   # Standalone tests only (port 6383)
npm run test:cluster      # Cluster tests only (ports 17000-17002)
npm run test:json         # JSON module tests only (port 6380)

# Quick test (standalone only)
npm run test:quick

# Generate JUnit reports
npm run test:junit
```

### Development Commands
```bash
# Watch mode for development
npm run build:watch

# Clean build directory
npm run clean

# Release commands
npm run release:dry    # Dry run
npm run release:patch  # Patch release
npm run release:minor  # Minor release
npm run release:major  # Major release
```

## Architecture

This is a **Valkey GLIDE ioredis adapter** - a drop-in replacement for ioredis that uses Valkey GLIDE's high-performance Rust core while maintaining full ioredis API compatibility.

### Core Architecture Flow
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
- `BaseClient.ts` - Core GLIDE wrapper with common database operations (~1000 lines)
- `StandaloneClient.ts` - Standalone-specific implementation
- `ClusterClient.ts` - Cluster-specific implementation
- `Redis.ts` - ioredis-compatible wrapper for StandaloneClient
- `Cluster.ts` - ioredis-compatible wrapper for ClusterClient
- `index.ts` - Main exports

**Command Modules** (`src/commands/`):
- `strings.ts`, `hashes.ts`, `lists.ts`, `sets.ts`, `zsets.ts` - Data type operations
- `streams.ts` - Stream operations (XADD, XREAD, etc.)
- `geo.ts`, `hll.ts`, `bitmaps.ts` - Specialized data structures
- `scripting.ts` - Lua scripting support
- `server.ts` - Server management
- `keys.ts` - Key management

**Utilities** (`src/utils/`):
- `ParameterTranslator.ts` - Converts ioredis parameters to GLIDE format
- `ResultTranslator.ts` - Converts GLIDE results to ioredis format
- `OptionsMapper.ts` - Maps connection options between ioredis and GLIDE
- `IoredisPubSubClient.ts` - Binary-compatible pub/sub client using RESP protocol

**Testing** (`tests/`):
- `unit/` - Command module tests (40+ test files)
- `integration/` - Real-world integration tests (Bull, Socket.IO, sessions)
- `cluster/` - Cluster-specific tests
- `utils/test-config.mjs` - Test configuration helpers
- Uses Node.js built-in test runner (no Jest)

### Critical Development Rules

1. **NEVER ASSUME API OR BEHAVIOR** - Always check both GLIDE and ioredis APIs
2. **Pure GLIDE Architecture** - Only use Valkey GLIDE APIs, no direct server commands
3. **Method Placement**:
   - `BaseClient`: Methods with identical signatures in GlideClient and GlideClusterClient
   - `StandaloneClient/ClusterClient`: Methods with different signatures or mode-specific behavior
   - Example: `watch(keys)` in BaseClient, `unwatch()` in Standalone/Cluster (different signatures)
4. **Dual-Mode Testing** - All tests must work in both standalone AND cluster modes
5. **Sequential Test Execution** - Use `--test-concurrency=1` to prevent connection issues

### Implementation Patterns

**ZSET Operations**: Special WITHSCORES handling to match ioredis format
```typescript
// GLIDE returns: Map { 'member1' => 1, 'member2' => 2 }
// Convert to ioredis format: ['member1', '1', 'member2', '2']
```

**Pub/Sub Architecture**: Dual implementation
- Direct GLIDE callbacks for text messages
- TCP-based IoredisPubSubClient for binary compatibility (Socket.IO)

**Transaction Support**: Multi/Pipeline adapters wrap GLIDE transaction objects

**Connection Validation**: Prevents cluster/standalone configuration mismatches

**Error Handling**: Map GLIDE errors to ioredis-compatible error types

## Configuration

### TypeScript Configuration
- Target: ES2020/CommonJS
- Strict mode with all checks enabled
- Source maps and declarations generated
- Compiles `src/` to `dist/`

### Test Environment
- Standalone tests: localhost:6383
- Cluster tests: localhost:17000-17002
- JSON module tests: localhost:6380
- Environment variables:
  - `VALKEY_HOST` / `VALKEY_PORT` - Override standalone connection
  - `VALKEY_CLUSTER_NODES` - Override cluster nodes (comma-separated)
  - `ENABLE_CLUSTER_TESTS=true` - Enable cluster testing
  - `DISABLE_STANDALONE_TESTS=true` / `DISABLE_CLUSTER_TESTS=true` - Skip specific modes

## Production Readiness

### Validated Integrations
- ✅ Bull/BullMQ job queues - Complete compatibility with createClient factory
- ✅ Express sessions (connect-redis) - Zero code changes required
- ✅ Socket.IO adapter - Binary pub/sub support
- ✅ Rate limiting (express-rate-limit) - Full compatibility
- ✅ ValkeyJSON module - 29 commands implemented (requires JSON module)

### Test Suite
- 40+ unit test files covering all command modules
- Integration tests for real-world patterns
- Three test modes: standalone, cluster, and JSON module
- Uses Node.js 18+ built-in test runner

## Module Support

### ValkeyJSON (RedisJSON v2 compatible)
- 29 complete JSON commands implemented
- Full JSONPath support
- Atomic operations on JSON documents
- Requires Valkey server with JSON module loaded
- Start test servers: `./scripts/valkey.sh start {standalone|cluster|bundle}`

### ValkeySearch (Not Yet Implemented)
- Pending GLIDE support for valkey-bundle module command syntax

## Development Workflow

### Making Changes
1. Check existing implementations in similar command modules
2. Verify GLIDE API signatures for both StandaloneClient and ClusterClient
3. Place method in appropriate client (BaseClient vs Standalone/Cluster)
4. Add parameter translation if needed (ParameterTranslator.ts)
5. Add result translation if needed (ResultTranslator.ts)
6. Write tests that work in both standalone and cluster modes

### Testing Changes
```bash
# Run specific test file during development
node --test tests/unit/your-command.test.mjs

# Run quick test (standalone only)
npm run test:quick

# Run full test suite before committing
npm test

# Check linting
npm run lint:fix

# Build and verify TypeScript
npm run build
```

### Common Pitfalls
- Assuming GLIDE and ioredis APIs are identical (they're not)
- Not testing both standalone and cluster modes
- Forgetting to handle parameter/result translation
- Not checking for mode-specific method signatures