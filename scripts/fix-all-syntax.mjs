#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';

async function fixFile(filePath) {
  let content = await readFile(filePath, 'utf8');
  const original = content;
  
  // Fix broken template literals
  content = content.replace(/const ([a-zA-Z_][a-zA-Z0-9_]*Key) = `\$\{([a-zA-Z_][a-zA-Z0-9_]*Key)\}`;/g, 'const $1 = `${$2}:queue`;');
  content = content.replace(/const permitKey = `\$\{semaphoreKey\}`;/g, 'const permitKey = `${semaphoreKey}:permits`;');
  
  // Fix other broken patterns
  content = content.replace(/throw new Error\('Invalid operation: '\)/g, "throw new Error('Invalid operation: ' + operation)");
  
  // Fix incomplete conditionals that might exist
  content = content.replace(/if \(lockInfo\.count\s*\{/g, 'if (lockInfo.count <= 0) {');
  
  if (content !== original) {
    await writeFile(filePath, content, 'utf8');
    console.log(`✅ Fixed ${filePath}`);
    return true;
  }
  return false;
}

// Fix the distributed locking file
await fixFile('tests/unit/distributed-locking.test.mjs');