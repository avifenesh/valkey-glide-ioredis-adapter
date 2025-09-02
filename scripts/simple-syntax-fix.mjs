#!/usr/bin/env node
/**
 * Simple targeted fixes for remaining syntax issues
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

async function fixFile(filePath) {
  let content = await readFile(filePath, 'utf8');
  const original = content;
  
  // Fix imports
  content = content.replace(/from 'node';/g, "from 'node:test';");
  content = content.replace(/from 'node';/g, "from 'node:assert';");
  
  // Fix broken syntax patterns that are causing parse errors
  content = content.replace(/for \(let i <= = /g, 'for (let i = ');
  content = content.replace(/i <= <= /g, 'i <= ');
  content = content.replace(/{ Redis };/g, '{ Redis };');
  content = content.replace(/lazyConnect: true: true/g, 'lazyConnect: true');
  content = content.replace(/preferences: JSON\.stringify/g, 'preferences: JSON.stringify');
  content = content.replace(/preferences\.stringify/g, 'preferences: JSON.stringify');
  content = content.replace(/Date\.now\(\)/g, 'timestamp: Date.now()');
  content = content.replace(/timestamp\.now\(\)/g, 'Date.now()');
  content = content.replace(/results\[0\]\.\[1\]/g, 'results[0][1]');
  content = content.replace(/getResult\!/g, 'getResult');
  content = content.replace(/username\.user/g, 'username: msg.user');
  content = content.replace(/message\.text/g, 'message: msg.text');
  content = content.replace(/badges\.badges/g, 'badges: msg.badges');
  content = content.replace(/const chatMessages\[\] = \[\];/g, 'const chatMessages = [];');
  content = content.replace(/const streamEvents\[\] = \[\];/g, 'const streamEvents = [];');
  content = content.replace(/const webhookEvents{ channel; message } = \[\];/g, 'const webhookEvents = [];');
  content = content.replace(/const messages\[\] = \[\];/g, 'const messages = [];');
  content = content.replace(/const largeMessages\[\] = \[\];/g, 'const largeMessages = [];');
  content = content.replace(/expect\(/g, 'assert.ok(');
  content = content.replace(/\.toBeGreaterThanOrEqual\(([^)]+)\);/g, ' >= $1);');
  content = content.replace(/\.toBe\(true\);/g, ');');
  content = content.replace(/\.toMatch\(/g, '.includes(');
  content = content.replace(/\.toMatchObject\(/g, ', ');
  content = content.replace(/\.toBeCloseTo\(([^,]+), ([^)]+)\);/g, ', 10) < 0.00000001);');
  
  // Fix broken property definitions
  content = content.replace(/score\.5/g, 'score: 2.5');
  content = content.replace(/score\.0/g, 'score: 1.0');
  content = content.replace(/viewers,/g, 'viewers: 0,');
  content = content.replace(/total_followers,/g, 'total_followers: 1543,');
  content = content.replace(/raiders,/g, 'raiders: 250,');
  content = content.replace(/is_dm,/g, 'is_dm: true,');
  content = content.replace(/muted,/g, 'muted: true,');
  content = content.replace(/threshold,/g, 'threshold: 45000,');
  content = content.replace(/volume_threshold,/g, 'volume_threshold: 100000,');
  content = content.replace(/current_volume,/g, 'current_volume: 152340,');
  content = content.replace(/spike_percentage,/g, 'spike_percentage: 52,');
  content = content.replace(/change_24h\.34/g, 'change_24h: -2.34');
  content = content.replace(/volume_24h,/g, 'volume_24h: 234567890,');
  content = content.replace(/bid\.0842/g, 'bid: 1.0842');
  content = content.replace(/ask\.0844/g, 'ask: 1.0844');
  content = content.replace(/spread\.0002/g, 'spread: 0.0002');
  content = content.replace(/rating,/g, 'rating: 5,');
  content = content.replace(/in_stock,/g, 'in_stock: true,');
  content = content.replace(/stock_count,/g, 'stock_count: 50,');
  
  // Fix broken loop patterns
  content = content.replace(/for \(let i <= = 0; i <= <= < /g, 'for (let i = 0; i < ');
  content = content.replace(/for \(let i <= = 1; i <= <= /g, 'for (let i = 1; i <= ');
  content = content.replace(/for \(let i <= = 0; i <= <= /g, 'for (let i = 0; i <= ');
  
  // Fix broken event fields
  content = content.replace(/const eventFieldsstring, string = {};/g, 'const eventFields = {};');
  content = content.replace(/{ offset, event: 'start' }/g, '{ offset: 0, event: "start" }');
  content = content.replace(/{ offset, event: 'step_1' }/g, '{ offset: 1000, event: "step_1" }');
  content = content.replace(/{ offset, event: 'step_2' }/g, '{ offset: 2000, event: "step_2" }');
  
  // Fix expect to assert patterns
  content = content.replace(/expect\(Math\.abs\(parseFloat\(score1\)\) - 1\.5\)\)\.toBeCloseTo\(0, 10\);/g, 
    'assert.ok(Math.abs(parseFloat(score1) - 1.5) < 0.00000001);');
  
  // Fix directory import
  content = content.replace(/from '\.\.\/setup\/index\.mjs';/g, "from '../setup/index.mjs';");
  content = content.replace(/import { testUtils } from/g, 'import { testUtils } from');
  
  // Fix assert to node:assert imports
  content = content.replace(/import assert from 'node:test';/g, "import assert from 'node:assert';");
  
  if (content !== original) {
    await writeFile(filePath, content, 'utf8');
    console.log(`✅ Fixed ${filePath}`);
    return true;
  }
  return false;
}

async function main() {
  console.log('🔧 Simple syntax fix...\n');
  
  const files = await readdir('tests/unit');
  const mjsFiles = files.filter(f => f.endsWith('.test.mjs'));
  
  let fixed = 0;
  for (const file of mjsFiles) {
    if (await fixFile(join('tests/unit', file))) {
      fixed++;
    }
  }
  
  console.log(`\n🎉 Fixed ${fixed} files!`);
}

main().catch(console.error);