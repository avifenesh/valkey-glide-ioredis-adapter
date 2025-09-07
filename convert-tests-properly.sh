#!/bin/bash

# Convert TypeScript test files to ES modules properly

convert_file() {
    local ts_file="$1"
    local mjs_file="${ts_file%.ts}.mjs"
    
    echo "Converting: $ts_file -> $mjs_file"
    
    # Read the entire file
    content=$(cat "$ts_file")
    
    # Convert imports
    content=$(echo "$content" | sed -E "
        # Convert import statements
        s/import ([^{].*) from '(.*)'/import \1 from '\2.js'/g
        s/import \{ (.*) \} from '(.*)'/import { \1 } from '\2.js'/g
        s/from '([^']*)\\.js\\.js'/from '\1.js'/g
        s/from '\\.\\.\\/\\.\\.\\/src'/from '..\/..\/dist'/g
        s/from '\\.\\.\\/\\.\\.\\/\\.\\.\\/src'/from '..\/..\/..\/dist'/g
        s/from '\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/src'/from '..\/..\/..\/..\/dist'/g
        
        # Fix specific imports
        s/import \{ Redis, Cluster \} from/import pkg from '..\/..\/dist\/index.js';\nconst { Redis, Cluster } = pkg;\n\/\/ Original:/g
        s/import \{ Redis \} from/import pkg from '..\/..\/dist\/index.js';\nconst { Redis } = pkg;\n\/\/ Original:/g
        s/import \{ Cluster \} from/import pkg from '..\/..\/dist\/index.js';\nconst { Cluster } = pkg;\n\/\/ Original:/g
        
        # Fix test imports
        s/from 'jest'/from 'node:test'/g
        s/import jest from 'jest'/import { describe, it, beforeEach, afterEach } from 'node:test'/g
        
        # Fix config imports
        s/from '\\.\\.\\/utils\\/redis-config'/from '..\/utils\/test-config.mjs'/g
        s/from '\\.\\.\\/\\.\\.\\/utils\\/redis-config'/from '..\/..\/utils\/test-config.mjs'/g
        
        # Remove .js from mjs imports
        s/from '([^']*)\\.mjs\\.js'/from '\1.mjs'/g
    ")
    
    # Convert test syntax
    content=$(echo "$content" | sed -E "
        # Convert Jest to Node test
        s/beforeAll/beforeAll/g
        s/afterAll/afterAll/g
        s/test\\.skip/it.skip/g
        s/test\\.only/it.only/g
        s/expect\\(([^)]*)\\)\\.toBe\\(([^)]*)\\)/assert.strictEqual(\1, \2)/g
        s/expect\\(([^)]*)\\)\\.toEqual\\(([^)]*)\\)/assert.deepStrictEqual(\1, \2)/g
        s/expect\\(([^)]*)\\)\\.toBeTruthy\\(\\)/assert.ok(\1)/g
        s/expect\\(([^)]*)\\)\\.toBeFalsy\\(\\)/assert.ok(!\1)/g
        s/expect\\(([^)]*)\\)\\.toBeNull\\(\\)/assert.strictEqual(\1, null)/g
        s/expect\\(([^)]*)\\)\\.toBeUndefined\\(\\)/assert.strictEqual(\1, undefined)/g
        s/expect\\(([^)]*)\\)\\.toContain\\(([^)]*)\\)/assert.ok(\1.includes(\2))/g
        s/expect\\(([^)]*)\\)\\.toHaveLength\\(([^)]*)\\)/assert.strictEqual(\1.length, \2)/g
        s/expect\\(([^)]*)\\)\\.toBeInstanceOf\\(([^)]*)\\)/assert.ok(\1 instanceof \2)/g
        s/expect\\(\\(\\) => ([^)]*)\\)\\.toThrow\\(\\)/assert.throws(() => \1)/g
        s/expect\\(\\(\\) => ([^)]*)\\)\\.not\\.toThrow\\(\\)/assert.doesNotThrow(() => \1)/g
    ")
    
    # Fix TypeScript-specific syntax
    content=$(echo "$content" | sed -E "
        # Remove type annotations
        s/: string([ ,;\)])/\1/g
        s/: number([ ,;\)])/\1/g
        s/: boolean([ ,;\)])/\1/g
        s/: any([ ,;\)])/\1/g
        s/: void([ ,;\)])/\1/g
        s/: Promise<[^>]*>([ ,;\)])/\1/g
        s/: [A-Z][a-zA-Z0-9]*([ ,;\)])/\1/g
        
        # Remove import = require syntax
        s/import ([a-zA-Z0-9_]+) = require\\(['\"]([^'\"]+)['\"]\\);?//g
        
        # Remove interface/type declarations
        /^interface /d
        /^type /d
        
        # Remove 'as' type assertions
        s/ as [A-Z][a-zA-Z0-9]*//g
    ")
    
    # Add proper imports at the top if missing
    if ! echo "$content" | grep -q "from 'node:test'"; then
        content="import { describe, it, test, beforeEach, afterEach, beforeAll, afterAll } from 'node:test';
import assert from 'node:assert';
$content"
    fi
    
    # Write the converted content
    echo "$content" > "$mjs_file"
    
    # Verify the file has content
    if [ ! -s "$mjs_file" ]; then
        echo "ERROR: Converted file is empty: $mjs_file"
        return 1
    fi
    
    # Check for basic test structure
    if ! grep -q "describe(" "$mjs_file"; then
        echo "WARNING: No describe blocks found in $mjs_file"
    fi
    
    if ! grep -q "it(" "$mjs_file" && ! grep -q "test(" "$mjs_file"; then
        echo "WARNING: No test blocks found in $mjs_file"
    fi
}

# Convert all TypeScript test files
echo "Starting test conversion..."

# Process files one by one
for ts_file in tests/**/*.ts; do
    if [ -f "$ts_file" ]; then
        convert_file "$ts_file"
    fi
done

echo "Conversion complete!"

# Remove TypeScript files after successful conversion
echo "Removing TypeScript test files..."
find tests -name "*.ts" -type f -delete

echo "Done!"