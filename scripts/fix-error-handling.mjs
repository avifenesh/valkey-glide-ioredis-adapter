#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';

async function fixFile() {
  let content = await readFile('tests/unit/error-handling.test.mjs', 'utf8');
  const original = content;
  
  // Fix Jest assertions to Node.js assert
  content = content.replace(/assert\.ok\(([^)]+)\)\.toBe\(([^)]+)\);/g, 'assert.strictEqual($1, $2);');
  content = content.replace(/assert\.ok\(([^)]+)\)\.toEqual\(\[\]\);/g, 'assert.deepStrictEqual($1, []);');
  content = content.replace(/assert\.ok\(([^)]+)\)\.toEqual\(\{\}\);/g, 'assert.deepStrictEqual($1, {});');
  content = content.replace(/assert\.ok\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\);/g, 'assert.ok($1 > $2);');
  content = content.replace(/assert\.ok\(([^)]+)\)\.includes\(/g, 'assert.ok($1.includes(');
  content = content.replace(/assert\.ok\(parseInt\(finalValue\)\)\.toBe\(10\);/g, 'assert.strictEqual(parseInt(finalValue), 10);');
  
  // Fix error message assertion
  content = content.replace(/assert\.ok\(\(error\)\.message\)\.includes\(\/memory\|space\|limit\/i\);/g, 'assert.ok(/memory|space|limit/i.test(error.message));');
  
  if (content !== original) {
    await writeFile('tests/unit/error-handling.test.mjs', content, 'utf8');
    console.log('✅ Fixed error-handling.test.mjs');
  }
}

fixFile().catch(console.error);