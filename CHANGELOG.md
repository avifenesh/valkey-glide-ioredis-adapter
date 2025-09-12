# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2025-01-27

### 🎯 **Production Release - Clean & Stable**
- **Complete Test Migration**: All tests converted from TypeScript to ES modules (.mjs)
- **Code Quality**: Fixed all linting and formatting issues across the codebase
- **Cleanup**: Removed all conversion scripts and leftover files
- **Documentation**: Updated and cleaned up all documentation for production readiness

### ✨ **Features Added**
- **ES Module Support**: Full ES module compatibility with proper import/export patterns
- **Clean Codebase**: Eliminated all technical debt from test conversion process
- **Production Ready**: Zero linting errors, consistent formatting, clean file structure

### 🐛 **Bug Fixes**
- **Import Issues**: Fixed missing Cluster import in fastify-redis integration tests
- **Formatting**: Resolved all Prettier formatting inconsistencies (26 files)
- **File Cleanup**: Removed all leftover TypeScript test files and conversion scripts

### 🔧 **Technical Improvements**
- **Test Infrastructure**: Streamlined test runner with pure ES modules
- **Code Quality**: 100% linting compliance and consistent formatting
- **File Organization**: Clean project structure with no leftover conversion artifacts
- **Type Safety**: Maintained full TypeScript support while using ES modules for tests

### 📚 **Documentation**
- **Release Notes**: Comprehensive 0.5.0 release documentation
- **Cleanup Plan**: Documented the complete cleanup process for future reference
- **Migration Guide**: Updated migration documentation for ES module compatibility

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