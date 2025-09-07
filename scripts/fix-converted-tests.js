#!/usr/bin/env node

/**
 * Fix Converted Test Files
 * Fixes issues in the converted .mjs test files
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Fix issues in a converted test file
 */
async function fixTestFile(filePath) {
  console.log(`Fixing: ${filePath}`);
  
  try {
    let content = await fs.readFile(filePath, 'utf8');
    
    // Fix common conversion issues
    
    // 1. Fix duplicate imports
    content = content.replace(/import pkg from '\.\.\/\.\.\/dist\/index\.js';\s*const { Redis\s*} = pkg;\s*import { Redis } from/g,
      "import pkg from '../../dist/index.js';\nconst { Redis } = pkg;\n// Fixed duplicate import");
    
    // 2. Fix remaining expect() patterns that weren't converted
    
    // expect(...).toBeDefined() → assert.ok(... !== undefined)
    content = content.replace(/expect\(([^)]+)\)\.toBeDefined\(\)/g, 'assert.ok($1 !== undefined)');
    
    // expect(...).toBeUndefined() → assert.strictEqual(..., undefined)
    content = content.replace(/expect\(([^)]+)\)\.toBeUndefined\(\)/g, 'assert.strictEqual($1, undefined)');
    
    // expect(...).toBe(...) → assert.strictEqual(..., ...)
    content = content.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.strictEqual($1, $2)');
    
    // expect(...).toEqual(...) → assert.deepStrictEqual(..., ...)
    content = content.replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.deepStrictEqual($1, $2)');
    
    // expect(...).toBeNull() → assert.strictEqual(..., null)
    content = content.replace(/expect\(([^)]+)\)\.toBeNull\(\)/g, 'assert.strictEqual($1, null)');
    
    // expect(...).toBeTruthy() → assert.ok(...)
    content = content.replace(/expect\(([^)]+)\)\.toBeTruthy\(\)/g, 'assert.ok($1)');
    
    // expect(...).toBeFalsy() → assert.ok(!(...))
    content = content.replace(/expect\(([^)]+)\)\.toBeFalsy\(\)/g, 'assert.ok(!($1))');
    
    // expect(...).toHaveLength(...) → assert.strictEqual(...length, ...)
    content = content.replace(/expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/g, 'assert.strictEqual($1.length, $2)');
    
    // expect(...).toContain(...) → assert.ok(...includes(...))
    content = content.replace(/expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, 'assert.ok($1.includes($2))');
    
    // expect(...).toBeInstanceOf(...) → assert.ok(... instanceof ...)
    content = content.replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/g, 'assert.ok($1 instanceof $2)');
    
    // expect(...).toBeGreaterThan(...) → assert.ok(... > ...)
    content = content.replace(/expect\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\)/g, 'assert.ok($1 > $2)');
    
    // expect(...).toBeGreaterThanOrEqual(...) → assert.ok(... >= ...)
    content = content.replace(/expect\(([^)]+)\)\.toBeGreaterThanOrEqual\(([^)]+)\)/g, 'assert.ok($1 >= $2)');
    
    // expect(...).toBeLessThan(...) → assert.ok(... < ...)
    content = content.replace(/expect\(([^)]+)\)\.toBeLessThan\(([^)]+)\)/g, 'assert.ok($1 < $2)');
    
    // expect(...).toBeLessThanOrEqual(...) → assert.ok(... <= ...)
    content = content.replace(/expect\(([^)]+)\)\.toBeLessThanOrEqual\(([^)]+)\)/g, 'assert.ok($1 <= $2)');
    
    // expect(...).toMatch(...) → assert.match(..., ...)
    content = content.replace(/expect\(([^)]+)\)\.toMatch\(([^)]+)\)/g, 'assert.match($1, $2)');
    
    // expect(...).toBeCloseTo(..., ...) → Math.abs(... - ...) < threshold
    content = content.replace(/expect\(([^)]+)\)\.toBeCloseTo\(([^)]+),\s*([^)]+)\)/g, 
      'assert.ok(Math.abs($1 - $2) < Math.pow(10, -$3))');
    
    // expect.arrayContaining([...]) → array pattern (needs manual fix)
    content = content.replace(/expect\.arrayContaining\(\[([^\]]+)\]\)/g, '[$1]');
    
    // expect(() => ...).not.toThrow() → assert.doesNotThrow(() => ...)
    content = content.replace(/expect\(\(\)\s*=>\s*{([^}]+)}\)\.not\.toThrow\(\)/g, 'assert.doesNotThrow(() => {$1})');
    
    // expect(async () => ...).rejects.toThrow() → assert.rejects(async () => ...)
    content = content.replace(/expect\(async\s*\(\)\s*=>\s*([^)]+)\)\.rejects\.toThrow\(\)/g, 'assert.rejects(async () => $1)');
    
    // await expect(...).rejects.toThrow() → await assert.rejects(async () => ...)
    content = content.replace(/await\s+expect\(([^)]+)\)\.rejects\.toThrow\(\)/g, 'await assert.rejects(async () => $1)');
    
    // 3. Fix TypeScript type annotations that weren't removed
    content = content.replace(/:\s*any/g, '');
    content = content.replace(/:\s*string/g, '');
    content = content.replace(/:\s*number/g, '');
    content = content.replace(/:\s*boolean/g, '');
    content = content.replace(/:\s*void/g, '');
    content = content.replace(/:\s*Promise<[^>]+>/g, '');
    content = content.replace(/\bas\s+any\b/g, '');
    
    // 4. Fix import issues for Cluster and other exports
    content = content.replace(/import { Cluster } from '\.\.\/\.\.\/\.\.\/src';/g,
      "import pkg from '../../../dist/index.js';\nconst { Cluster } = pkg;");
    
    // 5. Fix testUtils usage
    content = content.replace(/import { testUtils } from '\.\.\/setup';/g,
      "import { getStandaloneConfig, checkTestServers, delay } from '../utils/test-config.mjs';");
    
    content = content.replace(/await testUtils\.checkTestServers\(\)/g, 'await checkTestServers()');
    content = content.replace(/testUtils\.checkTestServers\(\)/g, 'checkTestServers()');
    content = content.replace(/await testUtils\.getStandaloneConfig\(\)/g, 'getStandaloneConfig()');
    content = content.replace(/testUtils\.getStandaloneConfig\(\)/g, 'getStandaloneConfig()');
    content = content.replace(/testUtils\.delay\(/g, 'delay(');
    
    // 6. Fix pending() calls for skipped tests
    content = content.replace(/pending\(/g, 'this.skip(');
    
    // 7. Fix JSON methods that might have issues
    content = content.replace(/JSON\.stringify\(/g, 'JSON.stringify(');
    content = content.replace(/Date\.now\(\)/g, 'Date.now()');
    content = content.replace(/Math\.random\(\)/g, 'Math.random()');
    
    // 8. Fix improper method calls
    content = content.replace(/\.toString\(\)/g, '.toString()');
    content = content.replace(/\.stringify\(/g, 'JSON.stringify(');
    content = content.replace(/\.parse\(/g, 'JSON.parse(');
    
    // 9. Fix timestamps
    content = content.replace(/timestamp\.now\(\)/g, 'Date.now()');
    
    // 10. Fix duplicate await redis.connect()
    content = content.replace(/(await redis\.connect\(\);)\s*\1/g, '$1');
    
    // 11. Fix malformed lines
    content = content.replace(/\n\s*await redis\.connect\(\);([a-zA-Z])/g, '\n    await redis.connect();\n    $1');
    
    // 12. Fix describe without content
    content = content.replace(/^describe\s*$/gm, '');
    
    // 13. Fix incorrectly placed error handling
    content = content.replace(/error\.message\(error\)/g, 'error.message || String(error)');
    
    // 14. Fix preferences JSON stringify
    content = content.replace(/preferences\.stringify\(/g, 'preferences: JSON.stringify(');
    
    // 15. Fix other property stringify calls
    content = content.replace(/(\w+)\.stringify\(/g, '$1: JSON.stringify(');
    content = content.replace(/: :\s*JSON/g, ': JSON');
    
    // 16. Remove extra spaces in destructuring
    content = content.replace(/const\s*{\s*Redis\s+}/g, 'const { Redis }');
    
    // 17. Fix double colons from previous fix
    content = content.replace(/:\s*:\s*/g, ': ');
    
    // 18. Clean up any remaining type annotations in function params
    content = content.replace(/\((\w+)\s*:\s*['"]?[\w\s|]+['"]?\)/g, '($1)');
    
    // Write the fixed file
    await fs.writeFile(filePath, content);
    console.log(`✓ Fixed: ${filePath}`);
    
  } catch (error) {
    console.error(`✗ Error fixing ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Find all .mjs test files
 */
async function findMjsTestFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...await findMjsTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.mjs')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Main function
 */
async function main() {
  console.log('Fixing Converted Test Files');
  console.log('============================\n');
  
  const testsDir = path.join(process.cwd(), 'tests');
  
  try {
    // Find all .mjs test files
    const mjsFiles = await findMjsTestFiles(testsDir);
    console.log(`Found ${mjsFiles.length} .mjs test files to fix\n`);
    
    // Fix each file
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of mjsFiles) {
      try {
        await fixTestFile(file);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }
    
    console.log('\n============================');
    console.log(`Fixing complete!`);
    console.log(`✓ Successfully fixed: ${successCount} files`);
    if (errorCount > 0) {
      console.log(`✗ Failed: ${errorCount} files`);
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the fixer
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fixTestFile, findMjsTestFiles };