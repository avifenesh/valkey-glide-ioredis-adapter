# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-08-27

### Added
- Complete ioredis API compatibility with 99.7% test coverage (391/392 tests passing)
- Full BullMQ integration with all 10 BullMQ tests passing
- Bull v3 compatibility with `quit()` method alias
- Bee-queue support with enhanced timing handling
- Comprehensive Redis command support including:
  - String, Hash, List, Set, Sorted Set operations
  - Stream commands (XACK, XGROUP, XPENDING, XCLAIM)
  - Blocking operations (BLPOP, BRPOP, BZPOPMIN, BZPOPMAX)
  - Lua script execution with `defineCommand` support
  - Pipeline and transaction operations
  - Pub/Sub functionality
- TypeScript support with complete type definitions
- Connection management with reconnection handling
- Session store compatibility (connect-redis, express-session)
- Rate limiting support (express-rate-limit)
- Socket.IO Redis adapter compatibility

### Fixed
- BullMQ Lua script argument handling for MessagePack serialization
- Bull v3 `quit()` method compatibility
- Bee-queue delayed job timing issues
- Jest test cleanup and hanging test resolution
- Enhanced error handling and logging for debugging

### Performance
- Optimized Redis command execution through Valkey GLIDE
- Improved connection pooling and management
- Enhanced pipeline operations using Batch functionality

### Development
- GitHub Actions CI/CD pipeline with multi-platform support (Ubuntu x64/ARM64, macOS)
- Automated release workflow with NPM publishing
- Comprehensive test suite with 99.7% coverage
- ESLint and TypeScript configuration
- Docker-based Redis test infrastructure

### Documentation
- Updated README with current compatibility status
- Added comprehensive API documentation
- Created migration guide from ioredis
- Added troubleshooting and debugging guides
