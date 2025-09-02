#!/usr/bin/env node
/**
 * Jest to Node.js Built-in Test Converter
 * Converts Jest test files to Node.js built-in test format
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';

const conversions = [
  // Import conversions
  { from: /import\s+\{\s*([^}]*)\s*\}\s+from\s+['"]\.\.\/\.\.\/src['"];?/, to: "import pkg from '../../dist/index.js';\nconst { $1 } = pkg;" },
  { from: /import\s+\{\s*([^}]*)\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/src['"];?/, to: "import pkg from '../../../dist/index.js';\nconst { $1 } = pkg;" },
  
  // Test framework imports
  { from: /^(?!.*node:test)/, to: "import { describe, it, before, after, beforeEach, afterEach } from 'node:test';\nimport assert from 'node:assert';\n", atStart: true },
  
  // Hook name conversions
  { from: /beforeAll\s*\(/g, to: 'before(' },
  { from: /afterAll\s*\(/g, to: 'after(' },
  
  // Test name conversions
  { from: /\btest\s*\(/g, to: 'it(' },
  
  // Assertion conversions
  { from: /expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, to: 'assert.strictEqual($1, $2)' },
  { from: /expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, to: 'assert.deepStrictEqual($1, $2)' },
  { from: /expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/g, to: 'assert.ok($1 instanceof $2)' },
  { from: /expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/g, to: 'assert.strictEqual($1.length, $2)' },
  { from: /expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, to: 'assert.ok($1.includes($2))' },
  { from: /expect\(([^)]+)\)\.toBeNull\(\)/g, to: 'assert.strictEqual($1, null)' },
  { from: /expect\(([^)]+)\)\.toBeUndefined\(\)/g, to: 'assert.strictEqual($1, undefined)' },
  { from: /expect\(([^)]+)\)\.toBeTruthy\(\)/g, to: 'assert.ok($1)' },
  { from: /expect\(([^)]+)\)\.toBeFalsy\(\)/g, to: 'assert.ok(!$1)' },
  { from: /expect\(([^)]+)\)\.not\.toThrow\(\)/g, to: 'assert.doesNotThrow(() => $1)' },
  { from: /expect\(([^)]+)\)\.toThrow\(\)/g, to: 'assert.throws(() => $1)' },
  { from: /expect\(typeof\s+([^)]+)\)\.toBe\(['"]([^'"]+)['"]\)/g, to: "assert.strictEqual(typeof $1, '$2')" },
];

async function convertTestFile(filePath) {
  console.log(`Converting ${filePath}...`);
  
  try {
    let content = await readFile(filePath, 'utf8');
    
    // Apply conversions
    let hasImports = false;
    for (const conv of conversions) {
      if (conv.atStart && !hasImports) {
        content = conv.to + content;
        hasImports = true;
      } else {
        content = content.replace(conv.from, conv.to);
      }
    }
    
    // Write to .mjs file
    const outputPath = filePath.replace('.test.ts', '.test.mjs');
    await writeFile(outputPath, content);
    console.log(`✅ Converted to ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to convert ${filePath}:`, error.message);
    return false;
  }
}

async function findTestFiles(dir, pattern = '.test.ts') {
  const files = [];
  
  async function scanDir(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith(pattern)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Skipping ${currentDir}: ${error.message}`);
    }
  }
  
  await scanDir(dir);
  return files;
}

async function main() {
  console.log('🔄 Jest to Node.js Test Converter\n');
  
  // Find simple unit test files (avoid integration tests for now)
  const unitTests = await findTestFiles('tests/unit');
  
  // Filter for simple tests (avoid complex ones with database setup)
  const simpleTests = unitTests.filter(file => {
    const name = basename(file);
    return [
      'smoke.test.ts',
      'result-translator.test.ts', 
      'hash-commands.test.ts',
      'string-commands.test.ts',
      'scan-operations.test.ts'
    ].some(simple => name === simple);
  });
  
  console.log(`Found ${simpleTests.length} simple test files to convert:`);
  simpleTests.forEach(file => console.log(`  - ${file}`));
  console.log('');
  
  let converted = 0;
  for (const file of simpleTests) {
    if (await convertTestFile(file)) {
      converted++;
    }
  }
  
  console.log(`\n✨ Conversion complete: ${converted}/${simpleTests.length} files converted`);
}

main().catch(console.error);