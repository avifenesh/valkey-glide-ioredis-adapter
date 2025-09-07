#!/bin/bash

echo "Fixing test import issues..."

# 1. Fix redis-config.mjs imports - should be test-config.mjs
echo "Fixing redis-config imports..."
find tests -name "*.mjs" -type f -exec sed -i '' 's/redis-config\.mjs/test-config.mjs/g' {} \;
find tests -name "*.mjs" -type f -exec sed -i '' 's/getRedisTestConfig/getStandaloneConfig/g' {} \;

# 2. Remove TypeScript syntax (import x = require)
echo "Fixing TypeScript syntax..."
find tests -name "*.mjs" -type f -exec sed -i '' "s/import Queue = require('bull');/import Queue from 'bull';/g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s/import express = require('express');/import express from 'express';/g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s/import session = require('express-session');/import session from 'express-session';/g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s/import ConnectRedis = require('connect-redis');/import ConnectRedis from 'connect-redis';/g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s/import RateLimitRedis = require('rate-limit-redis');/import RateLimitRedis from 'rate-limit-redis';/g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s/import Socket = require('socket.io');/import { Server as SocketIOServer } from 'socket.io';/g" {} \;

# 3. Fix directory imports - import from specific file
echo "Fixing directory imports..."
find tests -name "*.mjs" -type f -exec sed -i '' "s|from '\.\./\.\./src/types'|from '../../src/types/index.js'|g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s|from '\.\./\.\./\.\./src/types'|from '../../../src/types/index.js'|g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s|from '\.\./src'|from '../dist/index.js'|g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s|from '\.\./\.\./src'|from '../../dist/index.js'|g" {} \;
find tests -name "*.mjs" -type f -exec sed -i '' "s|from '\.\./\.\./\.\./src'|from '../../../dist/index.js'|g" {} \;

# 4. Fix duplicate Redis declarations
echo "Fixing duplicate declarations..."
for file in tests/**/*.mjs tests/**/**/*.mjs; do
  if [ -f "$file" ]; then
    # Check if file has duplicate Redis imports
    if grep -q "^import { Redis }" "$file" && grep -q "^const { Redis }" "$file"; then
      # Remove the direct import, keep the destructured one from pkg
      sed -i '' '/^import { Redis }/d' "$file"
    fi
  fi
done

# 5. Remove duplicate import statements
echo "Removing duplicate imports..."
for file in tests/**/*.mjs tests/**/**/*.mjs; do
  if [ -f "$file" ]; then
    # Remove consecutive duplicate import lines
    awk '!seen[$0]++ || !/^import/' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi
done

echo "Import fixes complete!"