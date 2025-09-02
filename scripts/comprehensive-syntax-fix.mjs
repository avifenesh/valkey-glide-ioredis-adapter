#!/usr/bin/env node
/**
 * Comprehensive syntax fixes for all converted .mjs files
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

async function fixFile(filePath) {
  let content = await readFile(filePath, 'utf8');
  const original = content;
  
  // Fix broken imports first
  content = content.replace(/from 'node';/g, "from 'node:test';");
  content = content.replace(/from 'node';/g, "from 'node:assert';");
  content = content.replace(/import { describe, it, before, after, beforeEach, afterEach } from 'node:test';\nimport assert from 'node:test';/g, 
    "import { describe, it, before, after, beforeEach, afterEach } from 'node:test';\nimport assert from 'node:assert';");
  
  // Fix TypeScript non-null assertions
  content = content.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\!/g, '$1');
  content = content.replace(/JSON\.parse\(([^)]+)!\)/g, 'JSON.parse($1)');
  content = content.replace(/getResult\!/g, 'getResult');
  content = content.replace(/result\!/g, 'result');
  
  // Fix broken property syntax
  content = content.replace(/score\./g, 'score: ');
  content = content.replace(/price\./g, 'price: ');
  content = content.replace(/quantity,/g, 'quantity: 1,');
  content = content.replace(/port\.port/g, 'port: config.port');
  content = content.replace(/host\.host/g, 'host: config.host');
  content = content.replace(/lazyConnect/g, 'lazyConnect: true');
  content = content.replace(/element\./g, 'element: Buffer.');
  content = content.replace(/score\./g, 'score: Number.');
  content = content.replace(/score }/g, 'score: 0 }');
  content = content.replace(/preferences\./g, 'preferences: JSON.');
  content = content.replace(/{ theme: 'dark', notifications }/g, '{ theme: "dark", notifications: true }');
  
  // Fix broken loop syntax  
  content = content.replace(/for \(let i <= = /g, 'for (let i = ');
  content = content.replace(/; i <= /g, '; i <= ');
  content = content.replace(/for \(let ([a-zA-Z_][a-zA-Z0-9_]*) <= = ([^;]+); \1 <= ([^;]+);/g, 'for (let $1 = $2; $1 <= $3;');
  
  // Fix broken property access
  content = content.replace(/\.([a-zA-Z_][a-zA-Z0-9_]*)\.\[/g, '.$1[');
  content = content.replace(/results\[0\]\.\[1\]/g, 'results[0][1]');
  content = content.replace(/timestamp\.now\(\)/g, 'Date.now()');
  content = content.replace(/Number\.MAX_SAFE_INTEGER/g, 'Number.MAX_SAFE_INTEGER');
  content = content.replace(/Number\.MIN_SAFE_INTEGER/g, 'Number.MIN_SAFE_INTEGER');
  
  // Fix broken JSON property access
  content = content.replace(/preferences: JSON\.([a-zA-Z_][a-zA-Z0-9_]*)/g, 'preferences.$1');
  content = content.replace(/assert\.strictEqual\(preferences: JSON\.theme/g, 'assert.strictEqual(preferences.theme');
  
  // Fix broken function calls and syntax
  content = content.replace(/ < 0\.1, true\);/g, ' < 0.1, true);');
  content = content.replace(/ userId  key\.includes\(''\)\)/g, ' userId <= 20; userId++) {\n        await redis.set(`${prefix}user:${userId}`, `recommendation_${userId}`);\n      }\n\n      // Scan for recommendation keys\n      let cursor = "0";\n      let allKeys = [];\n\n      do {\n        const [newCursor, keys] = await redis.scan(cursor, "MATCH", prefix + "*");\n        cursor = newCursor;\n        allKeys = allKeys.concat(keys);\n      } while (cursor !== "0");\n\n      assert.ok(allKeys.some(key => key.includes(prefix)));');
  content = content.replace(/ i  0\);\n        assert\.ok\(ttl /g, ' i <= 3; i++) {\n        const key = `${prefix}session:${i}`;\n        await redis.setex(key, 2, `session_data_${i}`);\n      }\n\n      // Scan for temporary keys\n      const [, keys] = await redis.scan("0", "MATCH", prefix + "*");\n      \n      for (const key of keys) {\n        const ttl = await redis.ttl(key);\n        assert.ok(ttl > 0);\n        assert.ok(ttl ');
  content = content.replace(/ user\.startsWith\('verified_'\)\)\);/g, ' user.startsWith("verified_"));');
  content = content.replace(/ player\.startsWith\('pro_'\)\)\);/g, ' player.startsWith("pro_"));');
  content = content.replace(/ i /g, ' i <= ');
  content = content.replace(/followers\.push\(`user_\$\{i\}`\);/g, 'followers.push(`user_${i}`);');
  content = content.replace(/followers\.push\(`verified_user_\$\{i\}`\);/g, 'followers.push(`verified_user_${i}`);');
  content = content.replace(/redis\.zadd\(leaderboardKey, i \* 100, `player_\$\{i\}`\);/g, 'redis.zadd(leaderboardKey, i * 100, `player_${i}`);');
  content = content.replace(/redis\.zadd\(leaderboardKey, \(i \+ 50\) \* 100, `pro_player_\$\{i\}`\);/g, 'redis.zadd(leaderboardKey, (i + 50) * 100, `pro_player_${i}`);');
  
  // Fix incomplete lines and syntax issues
  content = content.replace(/assert\.strictEqual\(Math\.abs\(parseFloat\(newCpuUsage\.toString\(\)\) - 47\.8\) {/g, 
    'assert.strictEqual(Math.abs(parseFloat(newCpuUsage.toString()) - 47.8) < 0.1, true);\n    });\n\n    it("should handle conditional field setting with HSETNX", async () =>');
    
  content = content.replace(/assert\.strictEqual\(Math\.abs\(parseFloat\(result1\) - 0\.3\) {/g,
    'assert.strictEqual(Math.abs(parseFloat(result1) - 0.3) < 0.0000000001, true);');
  
  // Fix directory imports
  content = content.replace(/from '\.\.\/setup';/g, "from '../setup/index.mjs';");
  content = content.replace(/from '\.\.\/\.\.\/setup';/g, "from '../../setup/index.mjs';");
  
  // Fix broken pattern matches
  content = content.replace(/allKeys\.some\(key => key\.includes\(prefix\)\);\);/g, 'allKeys.some(key => key.includes(prefix)));');
  content = content.replace(/verifiedUsers\.some\(user => user\.startsWith\("verified_"\)\);\);/g, 'verifiedUsers.some(user => user.startsWith("verified_")));');
  content = content.replace(/proPlayers\.some\(player => player\.startsWith\("pro_"\)\);\);/g, 'proPlayers.some(player => player.startsWith("pro_")));');
  
  // Fix other broken patterns
  content = content.replace(/it\("should format string array when withScores is false", \(\) => \{[\s\S]*?element: 'string_member', score\.5/g, 
    'it("should format string array when withScores is false", () => {\n      const glideResult = ["member1", "member2", "member3"];\n\n      const result = ResultTranslator.formatRangeResult(glideResult, false);\n\n      assert.deepStrictEqual(result, ["member1", "member2", "member3"]);\n    });\n\n    it("should handle non-array input", () => {\n      const result1 = ResultTranslator.formatRangeResult(null, true);\n      assert.deepStrictEqual(result1, []);\n\n      const result2 = ResultTranslator.formatRangeResult(undefined, false);\n      assert.deepStrictEqual(result2, []);\n    });\n\n    it("should handle empty arrays", () => {\n      const result1 = ResultTranslator.formatRangeResult([], true);\n      assert.deepStrictEqual(result1, []);\n\n      const result2 = ResultTranslator.formatRangeResult([], false);\n      assert.deepStrictEqual(result2, []);\n    });\n\n    it("should handle Buffer elements when withScores is false", () => {\n      const glideResult = [\n        Buffer.from("binary1"),\n        "string1",\n        Buffer.from("binary2"),\n      ];\n\n      const result = ResultTranslator.formatRangeResult(glideResult, false);\n\n      assert.deepStrictEqual(result, ["binary1", "string1", "binary2"]);\n    });\n\n    it("should handle SortedSetDataType with Buffer elements when withScores is true", () => {\n      const glideResult = [\n        { element: Buffer.from("buffer_member"), score: 1.5 },\n        { element: "string_member", score: 2.5');
  
  if (content !== original) {
    await writeFile(filePath, content, 'utf8');
    console.log(`✅ Fixed ${filePath}`);
    return true;
  }
  return false;
}

async function main() {
  console.log('🔧 Comprehensive syntax fix...\n');
  
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