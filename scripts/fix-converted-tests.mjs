#!/usr/bin/env node
/**
 * Fix converted test files by removing TypeScript syntax
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

async function fixTestFile(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  try {
    let content = await readFile(filePath, 'utf8');
    
    // Remove TypeScript type annotations
    content = content
      // Remove variable type annotations: let redis: Redis; -> let redis;
      .replace(/:\s*\w+(\[\])?;/g, ';')
      // Remove parameter type annotations: (param: Type) -> (param)
      .replace(/:\s*\w+(\[\])?(?=\s*[,)])/g, '')
      // Remove const type annotations: const x: Type = -> const x =
      .replace(/:\s*\w+(\[\])?(?=\s*=)/g, '')
      // Remove array type annotations: Type[] -> 
      .replace(/:\s*\w+\[\]/g, '')
      // Remove generic type annotations: Array<Type> -> Array
      .replace(/<[^>]+>/g, '')
      // Remove 'as any' type assertions
      .replace(/\s+as\s+any/g, '')
      // Remove import statements for types
      .replace(/import\s+\{[^}]*\}\s+from\s+['"]@valkey\/valkey-glide['"];?\n?/g, '')
      // Fix remaining expect statements that weren't converted
      .replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.strictEqual($1, $2)')
      .replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.deepStrictEqual($1, $2)')
      .replace(/expect\(([^)]+)\)\.toBeCloseTo\(([^,]+),\s*(\d+)\)/g, 'assert.ok(Math.abs($1 - $2) < 1e-$3)')
      // Fix property access with type casting
      .replace(/expect\(\(([^)]+)\s+as\s+\w+\)\.(\w+)\)\.toBe\(([^)]+)\)/g, 'assert.strictEqual($1.$2, $3)');
    
    await writeFile(filePath, content);
    console.log(`✅ Fixed ${filePath}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to fix ${filePath}:`, error.message);
    return false;
  }
}

async function findMjsFiles() {
  const files = [];
  
  async function scanDir(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.test.mjs')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }
  }
  
  await scanDir('tests');
  return files;
}

async function main() {
  console.log('🔧 Fixing converted Node.js test files\n');
  
  const mjsFiles = await findMjsFiles();
  
  console.log(`Found ${mjsFiles.length} .mjs files to fix:`);
  mjsFiles.forEach(file => console.log(`  - ${file}`));
  console.log('');
  
  let fixed = 0;
  for (const file of mjsFiles) {
    if (await fixTestFile(file)) {
      fixed++;
    }
  }
  
  console.log(`\n✨ Fix complete: ${fixed}/${mjsFiles.length} files fixed`);
}

main().catch(console.error);