#!/usr/bin/env node

/**
 * Fix Node.js test runner imports
 * Node.js test runner doesn't export beforeAll/afterAll
 */

const fs = require('fs').promises;
const path = require('path');

async function fixTestFile(filePath) {
  console.log(`Fixing imports in: ${filePath}`);
  
  try {
    let content = await fs.readFile(filePath, 'utf8');
    
    // Fix the import statement - Node.js test runner doesn't have beforeAll/afterAll
    content = content.replace(
      /import\s*{\s*describe,\s*it,\s*test,\s*beforeEach,\s*afterEach,\s*beforeAll,\s*afterAll\s*}\s*from\s*'node:test';/g,
      "import { describe, it, test, beforeEach, afterEach, before, after } from 'node:test';"
    );
    
    // Replace beforeAll with before
    content = content.replace(/\bbeforeAll\(/g, 'before(');
    
    // Replace afterAll with after
    content = content.replace(/\bafterAll\(/g, 'after(');
    
    await fs.writeFile(filePath, content);
    console.log(`✓ Fixed: ${filePath}`);
    
  } catch (error) {
    console.error(`✗ Error fixing ${filePath}:`, error.message);
    throw error;
  }
}

async function findTestFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...await findTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.mjs')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function main() {
  console.log('Fixing Node.js test runner imports');
  console.log('===================================\n');
  
  const testsDir = path.join(process.cwd(), 'tests');
  
  try {
    const testFiles = await findTestFiles(testsDir);
    console.log(`Found ${testFiles.length} test files to fix\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of testFiles) {
      try {
        await fixTestFile(file);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }
    
    console.log('\n===================================');
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

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fixTestFile, findTestFiles };