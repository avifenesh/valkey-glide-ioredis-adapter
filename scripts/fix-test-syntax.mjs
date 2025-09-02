#!/usr/bin/env node
/**
 * Script to fix common syntax issues in .mjs test files
 */

import fs from 'fs';
import path from 'path';

const testFiles = [
  'tests/unit/string-commands.test.mjs',
  'tests/unit/scan-operations.test.mjs', 
  'tests/unit/script-commands.test.mjs',
  'tests/unit/set-commands.test.mjs',
  'tests/unit/stream-commands.test.mjs',
  'tests/unit/transaction-commands.test.mjs',
  'tests/unit/zset-commands.test.mjs',
  'tests/unit/list-commands.test.mjs',
  'tests/unit/pubsub-patterns.test.mjs',
  'tests/unit/nestjs-cache-patterns.test.mjs',
  'tests/unit/search-commands.test.mjs'
];

function fixTestFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Fix 1: Add missing imports if missing
  if (!content.includes('import { describe, it,')) {
    content = content.replace(
      /^(\/\*\*[\s\S]*?\*\/\s*)?/,
      `$1\nimport { describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'node:test';\nimport assert from 'node:assert';\n`
    );
    modified = true;
  }

  // Fix 2: Add testUtils import if missing and has references to getStandaloneConfig etc
  if ((content.includes('getStandaloneConfig') || content.includes('getValkeyBundleTestConfig')) && !content.includes('testUtils')) {
    content = content.replace(
      /(import.*from.*dist\/index\.js.*;\n)/,
      `$1import { testUtils } from '../setup/index.mjs';\n`
    );
    modified = true;
  }

  // Fix 3: Replace undefined function calls with testUtils versions
  content = content.replace(/getStandaloneConfig\(\)/g, 'testUtils.getStandaloneConfig()');
  content = content.replace(/await getStandaloneConfig\(\)/g, 'await testUtils.getStandaloneConfig()');
  content = content.replace(/getValkeyBundleTestConfig\(\)/g, 'testUtils.getValkeyBundleTestConfig()');
  content = content.replace(/await getValkeyBundleTestConfig\(\)/g, 'await testUtils.getValkeyBundleTestConfig()');
  content = content.replace(/waitForValkeyBundle\(/g, 'testUtils.waitForValkeyBundle(');
  content = content.replace(/checkAvailableModules\(/g, 'testUtils.checkAvailableModules(');

  // Fix 4: Add setTimeout global declaration
  if (content.includes('setTimeout') && !content.includes('/* global setTimeout */')) {
    content = content.replace(
      /(import.*from.*node:assert.*;\n)/,
      `$1\n// Global declarations for Node.js built-in APIs\n/* global setTimeout */\n`
    );
    modified = true;
  }

  // Fix 5: Remove unused imports in import statements
  content = content.replace(/import \{ ([^}]*), before, ([^}]*) \}/, 'import { $1, $2 }');
  content = content.replace(/import \{ ([^}]*), after, ([^}]*) \}/, 'import { $1, $2 }');
  content = content.replace(/import \{ before, ([^}]*) \}/, 'import { $1 }');
  content = content.replace(/import \{ ([^}]*), before \}/, 'import { $1 }');
  content = content.replace(/import \{ after, ([^}]*) \}/, 'import { $1 }');
  content = content.replace(/import \{ ([^}]*), after \}/, 'import { $1 }');

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
}

// Process all test files
testFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    fixTestFile(filePath);
  }
});

console.log('Test file syntax fixes completed!');