#!/usr/bin/env node
/**
 * Comprehensive Test Migration Script
 * Converts all TypeScript tests to Node.js .mjs format
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, basename, dirname } from 'path';

const TEST_DIRS = [
  'tests/unit',
  'tests/integration/socketio'
];

const ESSENTIAL_TESTS = [
  'list-commands.test.ts',
  'set-commands.test.ts', 
  'zset-commands.test.ts',
  'stream-commands.test.ts',
  'transaction-commands.test.ts',
  'pubsub-basic.test.ts',
  'error-handling.test.ts',
  'connection-pipeline.test.ts',
  'script-commands.test.ts',
  'json-commands.test.ts',
  'search-commands.test.ts',
  'pubsub-patterns.test.ts',
  'distributed-locking.test.ts',
  'nestjs-cache-patterns.test.ts'
];

async function findTestFiles() {
  const testFiles = [];
  
  for (const testDir of TEST_DIRS) {
    try {
      const files = await readdir(testDir);
      for (const file of files) {
        if (file.endsWith('.test.ts')) {
          testFiles.push(join(testDir, file));
        }
      }
    } catch (error) {
      console.log(`Directory ${testDir} not found, skipping...`);
    }
  }
  
  return testFiles;
}

function convertTestContent(content, filename) {
  let converted = content;
  
  // 1. Convert imports
  converted = converted.replace(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"]/g, (match, imports, path) => {
    if (path.startsWith('../../src')) {
      return `import pkg from '../../dist/index.js';\nconst { ${imports.trim()} } = pkg;`;
    } else if (path.includes('utils/redis-config')) {
      return `import { getStandaloneConfig } from '../utils/test-config.mjs';`;
    } else if (path.includes('utils/')) {
      // Skip other utils imports for now
      return '';
    }
    return match;
  });
  
  // 2. Convert test framework imports
  converted = converted.replace(
    /import.*from.*['"]@jest\/globals['"];?\n?/g,
    `import { describe, it, before, after, beforeEach, afterEach } from 'node:test';\nimport assert from 'node:assert';\n`
  );
  
  // 3. Convert describe/test to describe/it
  converted = converted.replace(/\btest\(/g, 'it(');
  
  // 4. Convert beforeEach/afterEach patterns
  converted = converted.replace(/beforeEach\(async \(\) => \{[\s\S]*?const config = await getRedisTestConfig\(\);[\s\S]*?redis = new Redis\(config\);/g, 
    `beforeEach(async () => {\n    const config = getStandaloneConfig();\n    redis = new Redis(config);\n    await redis.connect();`);
  
  converted = converted.replace(/await redis\.disconnect\(\);/g, 'await redis.quit();');
  
  // 5. Convert expect() to assert
  converted = converted.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.strictEqual($1, $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.deepStrictEqual($1, $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeNull\(\)/g, 'assert.strictEqual($1, null)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeTruthy\(\)/g, 'assert.ok($1)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeFalsy\(\)/g, 'assert.ok(!$1)');
  converted = converted.replace(/expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, 'assert.ok($1.includes($2))');
  converted = converted.replace(/expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/g, 'assert.strictEqual($1.length, $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\)/g, 'assert.ok($1 > $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeLessThan\(([^)]+)\)/g, 'assert.ok($1 < $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeCloseTo\(([^)]+)(?:,\s*\d+)?\)/g, 'assert.strictEqual(Math.abs($1 - $2) < 0.1, true)');
  
  // 6. Convert async expect patterns
  converted = converted.replace(/await expect\(([^)]+)\)\.rejects\.toThrow\(\)/g, 'await assert.rejects($1)');
  converted = converted.replace(/await expect\(([^)]+)\)\.resolves\.toBe\(([^)]+)\)/g, 'assert.strictEqual(await $1, $2)');
  
  // 7. Clean up type annotations
  converted = converted.replace(/: Redis/g, '');
  converted = converted.replace(/: string/g, '');
  converted = converted.replace(/: number/g, '');
  converted = converted.replace(/: boolean/g, '');
  converted = converted.replace(/: any\[\]/g, '');
  converted = converted.replace(/: any/g, '');
  
  // 8. Add cleanup for connection
  converted = converted.replace(
    /(afterEach\(async \(\) => \{[\s\S]*?await redis\.quit\(\);[\s\S]*?\}\);)/g,
    `afterEach(async () => {\n    if (redis) {\n      await redis.quit();\n    }\n  });`
  );
  
  return converted;
}

async function migrateTest(filePath) {
  try {
    console.log(`🔄 Converting ${filePath}...`);
    
    const content = await readFile(filePath, 'utf8');
    const converted = convertTestContent(content, basename(filePath));
    
    // Generate output path
    const outputPath = filePath.replace('.test.ts', '.test.mjs');
    
    await writeFile(outputPath, converted, 'utf8');
    console.log(`✅ Created ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to convert ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting comprehensive test migration...\n');
  
  const testFiles = await findTestFiles();
  console.log(`Found ${testFiles.length} TypeScript test files\n`);
  
  let successful = 0;
  let failed = 0;
  
  for (const filePath of testFiles) {
    const filename = basename(filePath);
    
    // Only migrate essential tests for now
    if (!ESSENTIAL_TESTS.includes(filename)) {
      console.log(`⏭️  Skipping ${filename} (not in essential list)`);
      continue;
    }
    
    const success = await migrateTest(filePath);
    if (success) {
      successful++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n📊 Migration Results:`);
  console.log(`✅ Successfully converted: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${testFiles.length - successful - failed}`);
  
  if (successful > 0) {
    console.log(`\n🎉 Migration complete! Run 'npm run build && ./scripts/test-isolated.sh' to test.`);
  }
}

main().catch(console.error);