#!/bin/bash

# Fix remaining Jest expect() calls in test files

echo "Fixing remaining expect() calls..."

# Fix all test files with expect() calls
find tests -name "*.mjs" -type f | while read file; do
  if grep -q "expect(" "$file"; then
    echo "Fixing: $file"
    
    # Apply sed replacements
    sed -i '' -E '
      # Basic assertions
      s/expect\(([^)]+)\)\.toBe\(([^)]+)\)/assert.strictEqual(\1, \2)/g
      s/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/assert.deepStrictEqual(\1, \2)/g
      s/expect\(([^)]+)\)\.toBeTruthy\(\)/assert.ok(\1)/g
      s/expect\(([^)]+)\)\.toBeFalsy\(\)/assert.ok(!\1)/g
      s/expect\(([^)]+)\)\.toBeNull\(\)/assert.strictEqual(\1, null)/g
      s/expect\(([^)]+)\)\.toBeUndefined\(\)/assert.strictEqual(\1, undefined)/g
      
      # Array and string assertions
      s/expect\(([^)]+)\)\.toContain\(([^)]+)\)/assert.ok(\1.includes(\2))/g
      s/expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/assert.strictEqual(\1.length, \2)/g
      s/expect\(Array\.isArray\(([^)]+)\)\)\.toBe\(true\)/assert.ok(Array.isArray(\1))/g
      s/expect\(Array\.isArray\(([^)]+)\)\)\.toBe\(false\)/assert.ok(!Array.isArray(\1))/g
      
      # Type assertions
      s/expect\(typeof ([^)]+)\)\.toBe\('"'"'([^'"'"']+)'"'"'\)/assert.strictEqual(typeof \1, '"'"'\2'"'"')/g
      
      # Property assertions
      s/expect\(([^)]+)\)\.toHaveProperty\('"'"'([^'"'"']+)'"'"'\)/assert.ok('"'"'\2'"'"' in \1)/g
      s/expect\(([^)]+)\)\.toHaveProperty\('"'"'([^'"'"']+)'"'"', ([^)]+)\)/assert.strictEqual(\1['"'"'\2'"'"'], \3)/g
      
      # Number assertions
      s/expect\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\)/assert.ok(\1 > \2)/g
      s/expect\(([^)]+)\)\.toBeGreaterThanOrEqual\(([^)]+)\)/assert.ok(\1 >= \2)/g
      s/expect\(([^)]+)\)\.toBeLessThan\(([^)]+)\)/assert.ok(\1 < \2)/g
      s/expect\(([^)]+)\)\.toBeCloseTo\(([^)]+), ([^)]+)\)/assert.ok(Math.abs(\1 - \2) < Math.pow(10, -\3))/g
      
      # Not assertions
      s/expect\(([^)]+)\)\.not\.toBeNull\(\)/assert.ok(\1 !== null)/g
      s/expect\(([^)]+)\)\.not\.toContain\(([^)]+)\)/assert.ok(!\1.includes(\2))/g
      
      # Instance assertions
      s/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/assert.ok(\1 instanceof \2)/g
      
      # Mock/spy assertions (convert to simple checks)
      s/expect\(([^)]+)\)\.toHaveBeenCalled\(\)/assert.ok(\1.called || \1.callCount > 0)/g
      s/expect\(([^)]+)\)\.toHaveBeenCalledWith\(([^)]+)\)/assert.ok(\1.calledWith && \1.calledWith(\2))/g
      
      # Error assertions
      s/await expect\(([^)]+)\)\.rejects\.toThrow\(\)/await assert.rejects(\1)/g
      s/expect\(\(\) => ([^}]+)\)\.toThrow\(\)/assert.throws(() => \1)/g
      s/expect\(async \(\) => ([^}]+)\)\.rejects\.toThrow\(\)/await assert.rejects(async () => \1)/g
      
      # Complex patterns - handle multiline 
      s/expect\(parseInt\(([^)]+)\)\)\.toBe\(([^)]+)\)/assert.strictEqual(parseInt(\1), \2)/g
      s/expect\(parseFloat\(([^)]+)\)\)\.toBeCloseTo\(([^)]+), ([^)]+)\)/assert.ok(Math.abs(parseFloat(\1) - \2) < Math.pow(10, -\3))/g
      
      # Handle clientType checks
      s/expect\(\(([^)]+)\s*\)\.clientType\)\.toBe\('"'"'([^'"'"']+)'"'"'\)/assert.strictEqual(\1.clientType, '"'"'\2'"'"')/g
      
      # Handle boolean comparisons
      s/\.toBe\(true\)/.strictEqual(true)/g
      s/\.toBe\(false\)/.strictEqual(false)/g
      
      # Final cleanup
      s/expect\(/assert.ok(/g
    ' "$file"
    
    # Fix any remaining complex patterns with a second pass
    sed -i '' -E '
      # Fix JSON.parse patterns
      s/assert.ok\(JSON.parse\(([^)]+)\)\)\.deepStrictEqual/assert.deepStrictEqual(JSON.parse(\1)/g
      
      # Fix .some and .every patterns
      s/assert.ok\(([^)]+)\.some\(([^)]+)\)\)\.strictEqual\(true\)/assert.ok(\1.some(\2))/g
      s/assert.ok\(([^)]+)\.every\(([^)]+)\)\)\.strictEqual\(true\)/assert.ok(\1.every(\2))/g
      
      # Clean up double assert.ok
      s/assert\.ok\(assert\./assert./g
    ' "$file"
  fi
done

echo "Fixing complete!"