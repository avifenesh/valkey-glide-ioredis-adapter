#!/usr/bin/env node

/**
 * TypeScript to ES Module Test Converter
 * Converts TypeScript test files to ES modules (.mjs) for the ioredis-adapter project
 * 
 * Key conversions:
 * - Jest → Node.js built-in test runner
 * - TypeScript imports → ES module imports from dist/
 * - expect() assertions → Node.js assert
 * - Removes TypeScript type annotations
 */

const fs = require('fs').promises;
const path = require('path');

// Files to skip (already converted or not needed)
const SKIP_FILES = new Set([
  'tests/types/usage.ts', // Type definition file, not a test
  'tests/integration/shared/test-helpers.ts', // Helper file
]);

/**
 * Convert a single TypeScript test file to ES module
 */
async function convertTestFile(inputPath, outputPath) {
  console.log(`Converting: ${inputPath}`);
  
  try {
    let content = await fs.readFile(inputPath, 'utf8');
    
    // 1. Convert imports from Node.js test runner
    content = content.replace(
      /import\s*{\s*expect\s*}\s*from\s*['"]@jest\/globals['"];?/g,
      ''
    );
    
    // Add Node.js test runner imports at the top
    if (content.includes('describe(') || content.includes('test(') || content.includes('it(')) {
      const nodeTestImports = `import { describe, it, test, beforeEach, afterEach, beforeAll, afterAll } from 'node:test';
import assert from 'node:assert';`;
      
      // Find the first import or the start of the file after comments
      const firstImportMatch = content.match(/^import\s+/m);
      if (firstImportMatch) {
        const insertPos = content.indexOf(firstImportMatch[0]);
        content = content.slice(0, insertPos) + nodeTestImports + '\n' + content.slice(insertPos);
      } else {
        // No imports found, add after initial comments
        const lines = content.split('\n');
        let insertIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].startsWith('/**') && !lines[i].startsWith(' *') && !lines[i].startsWith('//') && lines[i].trim() !== '') {
            insertIndex = i;
            break;
          }
        }
        lines.splice(insertIndex, 0, nodeTestImports, '');
        content = lines.join('\n');
      }
    }
    
    // 2. Convert src imports to dist imports
    // Handle named imports from src/index
    content = content.replace(
      /import\s*{\s*([^}]+)\s*}\s*from\s*['"]\.\.\/\.\.\/src(?:\/index)?['"];?/g,
      (match, imports) => {
        return `import pkg from '../../dist/index.js';
const { ${imports} } = pkg;`;
      }
    );
    
    // Handle default imports from src
    content = content.replace(
      /import\s+(\w+)\s+from\s*['"]\.\.\/\.\.\/src(?:\/index)?['"];?/g,
      `import $1 from '../../dist/index.js';`
    );
    
    // Handle other src imports (like types)
    content = content.replace(
      /import\s*{\s*([^}]+)\s*}\s*from\s*['"]\.\.\/\.\.\/src\/types(?:\/index)?['"];?/g,
      ''  // Remove type imports as they're not needed in JS
    );
    
    // 3. Convert test utility imports
    // Convert testUtils imports
    content = content.replace(
      /import\s*{\s*testUtils\s*}\s*from\s*['"]\.\.\/setup['"];?/g,
      `import { getStandaloneConfig, checkTestServers, delay } from '../utils/test-config.mjs';`
    );
    
    // Convert direct config imports
    content = content.replace(
      /import\s*{\s*getRedisTestConfig\s*}\s*from\s*['"]\.\.\/utils\/redis-config['"];?/g,
      `import { getStandaloneConfig } from '../utils/test-config.mjs';`
    );
    
    // Convert valkey-bundle config imports
    content = content.replace(
      /import\s*{\s*getValkeyBundleConfig\s*}\s*from\s*['"]\.\.\/utils\/valkey-bundle-config['"];?/g,
      `import { getStandaloneConfig } from '../utils/test-config.mjs';`
    );
    
    // 4. Convert test utility usage
    content = content.replace(/testUtils\.checkTestServers\(\)/g, 'checkTestServers()');
    content = content.replace(/testUtils\.getStandaloneConfig\(\)/g, 'getStandaloneConfig()');
    content = content.replace(/testUtils\.delay\(/g, 'delay(');
    content = content.replace(/await\s+getRedisTestConfig\(\)/g, 'getStandaloneConfig()');
    content = content.replace(/await\s+getValkeyBundleConfig\(\)/g, 'getStandaloneConfig()');
    
    // 5. Convert Jest expect() assertions to Node.js assert
    
    // toBe → strictEqual
    content = content.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.strictEqual($1, $2)');
    
    // toEqual → deepStrictEqual
    content = content.replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.deepStrictEqual($1, $2)');
    
    // toBeNull → strictEqual(null)
    content = content.replace(/expect\(([^)]+)\)\.toBeNull\(\)/g, 'assert.strictEqual($1, null)');
    
    // toBeUndefined → strictEqual(undefined)
    content = content.replace(/expect\(([^)]+)\)\.toBeUndefined\(\)/g, 'assert.strictEqual($1, undefined)');
    
    // toBeTruthy → ok
    content = content.replace(/expect\(([^)]+)\)\.toBeTruthy\(\)/g, 'assert.ok($1)');
    
    // toBeFalsy → ok(!...)
    content = content.replace(/expect\(([^)]+)\)\.toBeFalsy\(\)/g, 'assert.ok(!($1))');
    
    // toBeGreaterThan → ok(> )
    content = content.replace(/expect\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\)/g, 'assert.ok($1 > $2)');
    
    // toBeGreaterThanOrEqual → ok(>= )
    content = content.replace(/expect\(([^)]+)\)\.toBeGreaterThanOrEqual\(([^)]+)\)/g, 'assert.ok($1 >= $2)');
    
    // toBeLessThan → ok(< )
    content = content.replace(/expect\(([^)]+)\)\.toBeLessThan\(([^)]+)\)/g, 'assert.ok($1 < $2)');
    
    // toBeLessThanOrEqual → ok(<= )
    content = content.replace(/expect\(([^)]+)\)\.toBeLessThanOrEqual\(([^)]+)\)/g, 'assert.ok($1 <= $2)');
    
    // toContain → ok(includes)
    content = content.replace(/expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, 'assert.ok($1.includes($2))');
    
    // toHaveLength → strictEqual(length)
    content = content.replace(/expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/g, 'assert.strictEqual($1.length, $2)');
    
    // toMatch → match
    content = content.replace(/expect\(([^)]+)\)\.toMatch\(([^)]+)\)/g, 'assert.match($1, $2)');
    
    // toThrow → throws/rejects
    content = content.replace(/expect\(async\s*\(\)\s*=>\s*([^}]+)\)\.rejects\.toThrow\(\)/g, 'await assert.rejects(async () => $1)');
    content = content.replace(/expect\(\(\)\s*=>\s*([^}]+)\)\.toThrow\(\)/g, 'assert.throws(() => $1)');
    
    // toBeInstanceOf → ok(instanceof)
    content = content.replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/g, 'assert.ok($1 instanceof $2)');
    
    // toHaveBeenCalled → ok(called) for spies
    content = content.replace(/expect\(([^)]+)\)\.toHaveBeenCalled\(\)/g, 'assert.ok($1.called)');
    
    // toHaveBeenCalledTimes → strictEqual(callCount)
    content = content.replace(/expect\(([^)]+)\)\.toHaveBeenCalledTimes\(([^)]+)\)/g, 'assert.strictEqual($1.callCount, $2)');
    
    // not.toBe → notStrictEqual
    content = content.replace(/expect\(([^)]+)\)\.not\.toBe\(([^)]+)\)/g, 'assert.notStrictEqual($1, $2)');
    
    // not.toEqual → notDeepStrictEqual
    content = content.replace(/expect\(([^)]+)\)\.not\.toEqual\(([^)]+)\)/g, 'assert.notDeepStrictEqual($1, $2)');
    
    // 6. Remove TypeScript type annotations
    // Remove type annotations from parameters
    content = content.replace(/(\w+)\s*:\s*[A-Z]\w+(?:<[^>]+>)?(?:\[\])?/g, '$1');
    
    // Remove function return types
    content = content.replace(/\)\s*:\s*Promise<[^>]+>/g, ')');
    content = content.replace(/\)\s*:\s*[A-Z]\w+(?:<[^>]+>)?/g, ')');
    
    // Remove variable type annotations (but keep the assignment)
    content = content.replace(/:\s*[A-Z]\w+(?:<[^>]+>)?(?:\[\])?\s*=/g, ' =');
    
    // Remove interface declarations
    content = content.replace(/interface\s+\w+\s*{[^}]*}/g, '');
    
    // Remove type declarations
    content = content.replace(/type\s+\w+\s*=\s*[^;]+;/g, '');
    
    // 7. Fix async/await patterns
    // Ensure async is present for functions using await
    content = content.replace(/test\(['"]([^'"]+)['"]\s*,\s*\(\s*\)/g, "test('$1', async ()");
    content = content.replace(/it\(['"]([^'"]+)['"]\s*,\s*\(\s*\)/g, "it('$1', async ()");
    
    // 8. Clean up Redis connection patterns
    // Convert redis.disconnect() to redis.quit()
    content = content.replace(/await\s+redis\.disconnect\(\)/g, 'await redis.quit()');
    
    // Add connect() after Redis instantiation if missing
    content = content.replace(
      /(redis\s*=\s*new\s+Redis\([^)]*\);?)(\s*)(?!.*await\s+redis\.connect)/g,
      '$1$2\n    await redis.connect();'
    );
    
    // 9. Fix any remaining import statements to use .mjs extension
    content = content.replace(/from\s+['"]([^'"]+)\.ts['"]/g, "from '$1.mjs'");
    
    // 10. Clean up double blank lines
    content = content.replace(/\n\n\n+/g, '\n\n');
    
    // Write the converted file
    await fs.writeFile(outputPath, content);
    console.log(`✓ Converted: ${outputPath}`);
    
  } catch (error) {
    console.error(`✗ Error converting ${inputPath}:`, error.message);
    throw error;
  }
}

/**
 * Find all TypeScript test files
 */
async function findTestFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...await findTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
      if (!SKIP_FILES.has(fullPath.replace(/\\/g, '/'))) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Main conversion function
 */
async function main() {
  console.log('TypeScript to ES Module Test Converter');
  console.log('=====================================\n');
  
  const testsDir = path.join(process.cwd(), 'tests');
  
  try {
    // Find all test files
    const testFiles = await findTestFiles(testsDir);
    console.log(`Found ${testFiles.length} TypeScript test files to convert\n`);
    
    // Convert each file
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of testFiles) {
      const outputPath = file.replace(/\.ts$/, '.mjs');
      
      try {
        await convertTestFile(file, outputPath);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }
    
    console.log('\n=====================================');
    console.log(`Conversion complete!`);
    console.log(`✓ Successfully converted: ${successCount} files`);
    if (errorCount > 0) {
      console.log(`✗ Failed: ${errorCount} files`);
    }
    
    // Optional: Remove original .ts files after successful conversion
    if (process.argv.includes('--remove-originals') && errorCount === 0) {
      console.log('\nRemoving original TypeScript files...');
      for (const file of testFiles) {
        await fs.unlink(file);
        console.log(`Removed: ${file}`);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the converter
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { convertTestFile, findTestFiles };