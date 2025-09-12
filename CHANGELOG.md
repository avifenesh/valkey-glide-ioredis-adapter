# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2025-01-27

### 🎯 **Major Architecture Refactor - Production Ready**
- **Complete Architecture Overhaul**: Rebuilt core client architecture for better GLIDE integration
- **Enhanced Connection Management**: Improved connection handling, auto-connect logic, and cleanup
- **Binary Pub/Sub Support**: Added support for binary and pattern message events
- **Test Infrastructure Overhaul**: Complete test migration to ES modules with 35+ test improvements

### ✨ **Features Added**
- **Enhanced Geo Commands**: Improved geosearch and georadius methods with token-based syntax and structured options
- **Binary Pub/Sub Events**: Full support for binary data in pub/sub operations
- **Auto-Connect Logic**: Duplicate instances now auto-connect automatically
- **Dynamic Key Tagging**: Implemented dynamic tagging for keys in scripting and set command tests
- **ES Module Support**: Complete test migration from TypeScript to ES modules (.mjs)
- **Sequential Test Runner**: New test runner for better test isolation and reliability

### 🐛 **Bug Fixes**
- **Connection Handling**: Fixed connection cleanup and disconnect handling issues
- **Test Infrastructure**: Resolved 35+ test-related issues including hanging promises and cleanup
- **GLIDE API Usage**: Fixed deprecation warnings and improved GLIDE API integration
- **Import Issues**: Fixed missing Cluster import in fastify-redis integration tests
- **Session Store**: Resolved session store test cleanup issues
- **BullMQ Integration**: Improved test isolation and cleanup in BullMQ integration tests

### 🔧 **Technical Improvements**
- **Code Quality**: Eliminated code duplication and improved type safety across the codebase
- **Test Reliability**: Enhanced test infrastructure with better setup, cleanup, and error handling
- **Connection Management**: Improved auto-connection logic and connection state handling
- **Error Handling**: Enhanced error handling and cleanup throughout the codebase
- **Performance**: Optimized GLIDE API usage and reduced deprecation warnings

### 📚 **Documentation & Infrastructure**
- **Comprehensive Documentation**: Enhanced CLAUDE.md, AGENTS.md, and migration guides
- **CI/CD Improvements**: Updated GitHub workflows and dependency management
- **Code Quality Tools**: Added ESLint configuration and improved code formatting
- **Test Documentation**: Added comprehensive testing guides and command references
- **Architecture Documentation**: Enhanced architecture and command mapping documentation

### 🧹 **Cleanup & Maintenance**
- **File Organization**: Cleaned up project structure and removed conversion artifacts
- **Code Formatting**: Applied consistent Prettier formatting across all files
- **Linting**: Achieved 100% linting compliance with zero errors
- **Type Safety**: Maintained full TypeScript support while using ES modules for tests

## [0.4.0] - 2025-08-31

### ✨ Features Added
- **Complete JSON Module Support**: Full ValkeyJSON/RedisJSON v2 compatibility with 31 commands
  
- **Advanced Error Handling**: Comprehensive error handling for GLIDE Map response limitations
- **Code Quality Improvements**: Eliminated 20 code duplication issues and reduced complexity
- **CI/CD Automation**: Complete release automation with semantic versioning and npm publishing
- **Parameter Translation Layer**: Centralized utility for ZSET operations and complex parameter handling

### 🐛 Bug Fixes
- **Script Error Messages**: Compatible error message format for both Valkey and Redis
- **CI Test Failures**: Resolved all 9 failing tests to achieve 100% CI success (539/539 tests)
- **Dependency Compatibility**: Updated to Node.js 20/22 for modern package requirements
- **Connection Stability**: Fixed valkey-bundle service integration in CI pipeline

### 🔄 CI/CD Improvements
- **Node Version Updates**: Migrated from Node 18 to Node 20/22 for dependency compatibility
- **Valkey-Bundle Integration**: Complete CI integration with JSON module
- **Release Automation**: Semantic versioning with automated npm publishing and GitHub releases
- **Test Infrastructure**: Docker-based valkey-bundle setup for reliable module testing
- **Coverage Reporting**: Maintained 80%+ test coverage across all new features

### 📚 Documentation
- **Conventional Commits**: Added commit message templates for better release notes
- **Release Process**: Automated changelog generation from commit history
- **API Documentation**: Enhanced documentation for JSON module usage

### 🔧 Technical Improvements
- **100% Test Success**: Achieved complete CI success rate (539/539 tests passing)
- **Deterministic Behavior**: Eliminated fallback patterns for production stability
- **Performance Optimizations**: Reduced code duplication and improved method complexity
- **Type Safety**: Enhanced TypeScript support for all new command modules

## [0.3.0] - 2024-XX-XX

### Added
- Initial implementation of valkey-glide-ioredis-adapter
- Basic Redis command compatibility
- Connection management and clustering support
- Initial test infrastructure

[0.4.0]: https://github.com/avifenesh/valkey-glide-ioredis-adapter/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/avifenesh/valkey-glide-ioredis-adapter/releases/tag/v0.3.0