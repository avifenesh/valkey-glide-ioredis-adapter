# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Features Added
- **Complete JSON Module Support**: Full ValkeyJSON/RedisJSON v2 compatibility with 31 commands
- **Complete Search Module Support**: Full Valkey Search/RediSearch compatibility with 21 commands  
- **Advanced Error Handling**: Comprehensive error handling for GLIDE Map response limitations
- **Code Quality Improvements**: Eliminated 20 code duplication issues and reduced complexity
- **CI/CD Automation**: Complete release automation with semantic versioning and npm publishing
- **Parameter Translation Layer**: Centralized utility for ZSET operations and complex parameter handling

### 🐛 Bug Fixes
- **Search Filter Format**: Graceful handling of valkey-bundle filter format requirements
- **Script Error Messages**: Compatible error message format for both Valkey and Redis
- **FT.AGGREGATE Support**: Proper fallback handling for unsupported aggregation commands
- **CI Test Failures**: Resolved all 9 failing tests to achieve 100% CI success (539/539 tests)
- **Dependency Compatibility**: Updated to Node.js 20/22 for modern package requirements
- **Connection Stability**: Fixed valkey-bundle service integration in CI pipeline

### 🔄 CI/CD Improvements
- **Node Version Updates**: Migrated from Node 18 to Node 20/22 for dependency compatibility
- **Valkey-Bundle Integration**: Complete CI integration with JSON and Search modules
- **Release Automation**: Semantic versioning with automated npm publishing and GitHub releases
- **Test Infrastructure**: Docker-based valkey-bundle setup for reliable module testing
- **Coverage Reporting**: Maintained 80%+ test coverage across all new features

### 📚 Documentation
- **Conventional Commits**: Added commit message templates for better release notes
- **Release Process**: Automated changelog generation from commit history
- **API Documentation**: Enhanced documentation for JSON and Search module usage

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

[Unreleased]: https://github.com/avifenesh/valkey-glide-ioredis-adapter/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/avifenesh/valkey-glide-ioredis-adapter/releases/tag/v0.3.0