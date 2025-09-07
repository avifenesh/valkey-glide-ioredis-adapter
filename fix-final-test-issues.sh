#!/bin/bash

echo "Fixing final test syntax issues..."

# Fix all test files
find tests -name "*.mjs" -type f | while read file; do
  # Apply fixes
  sed -i '' -E '
    # Fix broken assert.ok patterns
    s/assert\.ok\(([^)]+)\)\.toBe\(/assert.strictEqual(\1, /g
    s/assert\.ok\(([^)]+)\)\.toEqual\(/assert.deepStrictEqual(\1, /g
    s/assert\.ok\(([^)]+)\)\.toBeTruthy\(\)/assert.ok(\1)/g
    s/assert\.ok\(([^)]+)\)\.toBeFalsy\(\)/assert.ok(!\1)/g
    s/assert\.ok\(([^)]+)\)\.toBeNull\(\)/assert.strictEqual(\1, null)/g
    s/assert\.ok\(([^)]+)\)\.toBeUndefined\(\)/assert.strictEqual(\1, undefined)/g
    s/assert\.ok\(([^)]+)\)\.toBeGreaterThan\(/assert.ok(\1 > /g
    s/assert\.ok\(([^)]+)\)\.toBeGreaterThanOrEqual\(/assert.ok(\1 >= /g
    s/assert\.ok\(([^)]+)\)\.toBeLessThan\(/assert.ok(\1 < /g
    s/assert\.ok\(([^)]+)\)\.toBeLessThanOrEqual\(/assert.ok(\1 <= /g
    s/assert\.ok\(([^)]+)\)\.toBeCloseTo\(/assert.ok(Math.abs(\1 - /g
    s/assert\.ok\(([^)]+)\)\.toHaveLength\(/assert.strictEqual(\1.length, /g
    s/assert\.ok\(([^)]+)\)\.toBeInstanceOf\(/assert.ok(\1 instanceof /g
    s/assert\.ok\(([^)]+)\)\.toContainEqual\(/assert.ok(\1.some(item => JSON.stringify(item) === JSON.stringify(/g
    s/assert\.ok\(([^)]+)\)\.toMatchObject\(/assert.ok(Object.keys(\2).every(key => \1[key] === \2[key])/g
    s/assert\.ok\(([^)]+)\)\.toMatch\(/assert.ok(\1.match(/g
    s/assert\.ok\(([^)]+)\)\.not\.toMatch\(/assert.ok(!\1.match(/g
    
    # Fix rejects patterns
    s/await assert\.ok\(([^)]+)\)\.rejects\.toThrow\(\)/await assert.rejects(\1)/g
    s/assert\.ok\(async \(\) => ([^}]+)\)\.rejects\.toThrow\(\)/await assert.rejects(async () => \1)/g
    
    # Fix JSON parse issues
    s/JSONJSON\.parse/JSON.parse/g
    s/JSONJSON:/JSON.stringify/g
    
    # Fix Date.now() issues
    s/Date\.now\(\)/Date.now()/g
    s/, Date\.now\(\)/, timestamp: Date.now()/g
    s/lastLogin\.now\(\)/Date.now()/g
    
    # Fix array syntax
    s/const largeMessages\[\]/const largeMessages/g
    
    # Fix incorrect method calls
    s/redis\.xthis\.skip/redis.xpending/g
    
    # Remove duplicate assertions
    s/assert\.ok\(assert\./assert./g
  ' "$file"
done

echo "Fixing complete!"