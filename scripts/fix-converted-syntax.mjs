#!/usr/bin/env node
/**
 * Fix TypeScript syntax issues in converted .mjs files
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

async function fixMjsFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf8');
    let fixed = false;
    
    // Fix TypeScript casting syntax
    const originalContent = content;
    content = content.replace(/\s+as\s+(string|number|boolean|any|Buffer)/g, '');
    content = content.replace(/\s+as\s+[A-Za-z\[\]]+/g, '');
    
    // Fix interface/type references
    content = content.replace(/: [A-Za-z]+\[\]/g, '');
    content = content.replace(/: [A-Za-z]+</g, '');
    content = content.replace(/>\s*=/g, ' =');
    
    // Fix generic type syntax
    content = content.replace(/<[^>]+>/g, '');
    
    // Fix optional chaining and nullish coalescing that might be problematic
    content = content.replace(/\?\?\s*\[\]/g, ' || []');
    content = content.replace(/\?\?\s*\{\}/g, ' || {}');
    
    // Remove remaining type annotations
    content = content.replace(/:\s*\w+(?:\[\])?/g, '');
    
    // Fix leftover TypeScript-specific patterns
    content = content.replace(/\!\s*\./g, '.');
    content = content.replace(/\?\s*\./g, '.');
    
    // Clean up whitespace
    content = content.replace(/\s+,/g, ',');
    content = content.replace(/,\s+\)/g, ')');
    
    if (content !== originalContent) {
      await writeFile(filePath, content, 'utf8');
      console.log(`✅ Fixed syntax in ${filePath}`);
      fixed = true;
    } else {
      console.log(`⏭️  No changes needed in ${filePath}`);
    }
    
    return fixed;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing TypeScript syntax in converted .mjs files...\n');
  
  const testFiles = [];
  const testDirs = ['tests/unit', 'tests/integration'];
  
  for (const dir of testDirs) {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (file.endsWith('.test.mjs')) {
          testFiles.push(join(dir, file));
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  }
  
  console.log(`Found ${testFiles.length} .mjs test files to check\n`);
  
  let fixed = 0;
  for (const filePath of testFiles) {
    const wasFixed = await fixMjsFile(filePath);
    if (wasFixed) fixed++;
  }
  
  console.log(`\n🎉 Syntax cleanup complete! Fixed ${fixed} files.`);
}

main().catch(console.error);