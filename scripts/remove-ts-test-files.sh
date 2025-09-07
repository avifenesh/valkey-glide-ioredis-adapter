#!/bin/bash

# Remove TypeScript Test Files Script
# Removes the original .ts test files after successful conversion to .mjs

echo "Removing original TypeScript test files..."
echo "========================================"

# Find and remove all .ts test files (excluding .d.ts files)
test_files=$(find tests -name "*.test.ts" -o -name "*.spec.ts" | grep -v ".d.ts")

if [ -z "$test_files" ]; then
    echo "No TypeScript test files found to remove."
    exit 0
fi

count=0
for file in $test_files; do
    # Check if corresponding .mjs file exists
    mjs_file="${file%.ts}.mjs"
    if [ -f "$mjs_file" ]; then
        echo "Removing: $file (has .mjs equivalent)"
        rm "$file"
        ((count++))
    else
        echo "Keeping: $file (no .mjs equivalent found)"
    fi
done

# Also remove helper .ts files that have been converted
helper_files=$(find tests -name "*.ts" ! -name "*.test.ts" ! -name "*.spec.ts" ! -name "*.d.ts")
for file in $helper_files; do
    mjs_file="${file%.ts}.mjs"
    if [ -f "$mjs_file" ]; then
        echo "Removing helper: $file"
        rm "$file"
        ((count++))
    fi
done

echo ""
echo "========================================"
echo "Removed $count TypeScript files"
echo "Conversion to ES modules complete!"