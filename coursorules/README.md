# ioredis-adapter Development Rules

## Core Principles

### 1. Pure GLIDE Architecture (MANDATORY)
- **PURE GLIDE ONLY** - This project uses exclusively Valkey GLIDE
- **NO OTHER CLIENTS EVER** - No ioredis, no node-redis, no other Redis clients
- **Custom Logic Over External Dependencies** - If we need custom behavior, we build it ourselves
- **GLIDE-Native Solutions** - All functionality must be implemented using GLIDE APIs only

### 2. Research First, Never Assume
- **ALWAYS research and validate** before implementing any solution
- **NEVER assume** behavior, API contracts, or implementation details
- Use MCP tools to gather information from web sources and official documentation
- Examine local code in node_modules for built clients and actual implementations
- Custom commands are almost never the correct answer - prefer official APIs and documented methods

### 3. Glide API Validation
For each adaptation implemented:
- **Check Glide API from official URLs** first
- **Examine built client in node_modules** for actual implementation details
- **Validate API contracts** against official documentation
- **Test API behavior** with real examples before implementation

### 4. Testing Standards
- **100% test coverage** is mandatory for all code
- **NEVER skip tests** with warning messages
- **If tests don't work, fix them** - don't suppress failures
- **Fail fast** - if a test cannot be made to pass, the implementation is incomplete
- **Integration tests** required for all adapter functionality
- **Unit tests** for all utility functions and edge cases

### 5. Documentation Validation
- **Always validate documentation** using MCP tools for web research
- **Cross-reference** multiple sources when possible
- **Verify examples** work as documented
- **Check for breaking changes** in recent versions
- **Validate against actual implementations** in node_modules

### 6. Code Quality Standards
- **Type safety** - use TypeScript strictly, no `any` types without justification
- **Error handling** - comprehensive error handling for all external API calls
- **Logging** - meaningful logging for debugging and monitoring
- **Performance** - consider performance implications of all implementations
- **Security** - validate all inputs and handle sensitive data appropriately

### 7. Implementation Process
1. **Research** the official API documentation
2. **Examine** existing implementations in node_modules
3. **Design** the adapter interface
4. **Implement** with comprehensive error handling
5. **Test** with real scenarios
6. **Document** usage examples and edge cases
7. **Validate** against official documentation again

### 8. Never Skip These Steps
- **API validation** against official sources
- **Real-world testing** with actual data
- **Error scenario testing** - test failure modes
- **Performance testing** for critical paths
- **Documentation updates** for any API changes

### 9. Quality Gates
- All tests must pass
- All linting rules must pass
- All TypeScript compilation must succeed
- All documentation must be up-to-date
- All examples must work as documented

## File Naming and Structure
- Use descriptive names for all files and functions
- Follow existing project structure and conventions
- Group related functionality logically
- Maintain clear separation of concerns

## Commit Standards
- **Meaningful commit messages** that explain the "why"
- **Atomic commits** - one logical change per commit
- **Test coverage** must not decrease
- **Documentation updates** included with code changes

## When in Doubt
1. **Research more** - there's always more to learn
2. **Check the source** - examine actual implementations
3. **Test thoroughly** - don't assume it works
4. **Document everything** - future developers will thank you
5. **Ask for review** - fresh eyes catch issues

Remember: **Stable, tested, and documented code is more valuable than quick, untested solutions.**

## Special Considerations

### Pub/Sub Implementation
Due to GLIDE's pub/sub execution context sensitivity, we implement **two distinct pub/sub patterns**:

1. **General Usage Pub/Sub**: Direct GLIDE pattern for user applications
2. **Internal Library Pub/Sub**: Custom encapsulated pattern for Bull/BullMQ integration

Both patterns are **pure GLIDE** implementations with different architectural approaches to handle GLIDE's limitations while maintaining full compatibility.