# Contributing to Valkey GLIDE ioredis Adapter

🎉 Thank you for your interest in contributing! This project aims to provide 100% ioredis compatibility with Valkey GLIDE's high-performance backend.

## 🚀 Quick Start

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/valkey-glide-ioredis-adapter.git
   cd valkey-glide-ioredis-adapter
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development Environment**
   ```bash
   ./scripts/start-test-servers.sh  # Start Redis/Valkey servers
   npm run dev                       # Watch mode for builds and tests
   ```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm test -- --testPathPatterns="bull"
npm test -- --testPathPatterns="integration"

# Lint and format
npm run lint
npm run format
```

## 📋 Development Guidelines

### Pure GLIDE Architecture
- ✅ **Use only Valkey GLIDE APIs** - No direct Redis protocol implementation
- ✅ **Maintain ioredis compatibility** through parameter/result translation  
- ✅ **Leverage GLIDE's TypeScript interfaces** for type safety
- ❌ **Avoid generic Redis commands** when GLIDE provides specific methods

### Code Quality Standards
- **100% Test Coverage** - All new code must include comprehensive tests
- **TypeScript First** - Full type safety required
- **Performance Focus** - Benchmark against ioredis where applicable
- **Documentation** - Update API docs and examples for new features

### Commit Message Format
We use [Conventional Commits](https://conventionalcommits.org/) for automated versioning:

```
feat: add Redis Streams support
fix: resolve Bull job processing timeout
docs: update migration guide
test: add cluster adapter integration tests
perf: optimize connection pooling
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

## 🎯 Feature Development Workflow

### 1. Create Feature Branch
```bash
git checkout -b feat/redis-streams-support
```

### 2. Implement with Tests
- Add failing tests first (TDD approach)
- Implement feature using only GLIDE APIs
- Ensure 100% coverage for new code
- Update documentation and examples

### 3. Integration Testing
- Test with supported libraries (Bull, BullMQ, Socket.IO, etc.)
- Validate performance vs ioredis baseline
- Run full test suite to prevent regressions

### 4. Pull Request
- Fill out the PR template completely
- Link related issues
- Include performance benchmarks if applicable
- Wait for CI checks and review approval

## 🐛 Bug Reports

When reporting bugs, please include:

- **Environment**: Node.js version, OS, Redis/Valkey version
- **Code Example**: Minimal reproduction case
- **Expected vs Actual Behavior**
- **Library Integration**: Which library you're using (Bull, BullMQ, etc.)
- **Error Messages**: Full stack traces

## 🆕 Feature Requests

Before requesting features:

1. Check existing issues and discussions
2. Verify the feature is not already available in GLIDE
3. Consider if it maintains ioredis compatibility
4. Provide use cases and implementation ideas

## 📊 Performance Contributions

When contributing performance improvements:

- Include before/after benchmarks
- Test with realistic workloads
- Measure memory usage and CPU performance
- Validate against ioredis baseline

## 🔧 Library Integration

Adding support for new Redis-dependent libraries:

1. **Research**: Understand the library's Redis usage patterns
2. **Test Suite**: Create comprehensive integration tests
3. **Compatibility Layer**: Implement necessary ioredis compatibility methods
4. **Documentation**: Add migration guide and examples
5. **Performance Validation**: Ensure no significant performance regression

## 📝 Documentation

- **API Changes**: Update JSDoc comments and type definitions
- **Examples**: Add practical usage examples
- **Migration Guides**: Help users transition from ioredis
- **Architecture Docs**: Explain complex implementations

## 🚀 Release Process

This project uses automated releases via semantic-release:

1. **Develop**: Work on feature branches
2. **Pull Request**: Merge to `main` after review
3. **Automated Release**: semantic-release handles versioning and publishing
4. **Changelog**: Automatically generated from commit messages

## 💡 Getting Help

- **Discussions**: Use GitHub Discussions for questions
- **Issues**: Report bugs and feature requests
- **Documentation**: Check existing docs and examples
- **Code Review**: Learn from PR feedback

## 🎖️ Recognition

Contributors are automatically recognized in:
- Generated release notes
- GitHub contributor graphs
- Project documentation

Thank you for making Valkey GLIDE ioredis Adapter better! 🙏