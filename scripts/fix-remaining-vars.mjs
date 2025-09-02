#!/usr/bin/env node
/**
 * Script to fix remaining undefined variables in test files
 */

import fs from 'fs';

function fixRemainingVars(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Common undefined variable patterns - fix by providing values
  const fixes = [
    // Analytics/metrics patterns
    [/page_views,/g, 'page_views: 1234,'],
    [/unique_visitors,/g, 'unique_visitors: 567,'],
    [/population,/g, 'population: 100000,'],
    
    // Settings/config patterns
    [/notifications,/g, 'notifications: true,'],
    [/timeout,/g, 'timeout: 30,'],
    [/enabled,/g, 'enabled: true,'],
    [/debug,/g, 'debug: false,'],
    [/experimental,/g, 'experimental: false,'],
    [/authenticated,/g, 'authenticated: true,'],
    [/active,/g, 'active: true,'],
    
    // Network/server patterns
    [/port,/g, 'port: 8080,'],
    [/max_connections,/g, 'max_connections: 100,'],
    
    // Person/user patterns
    [/{ id,/g, '{ id: 1,'],
    [/age,/g, 'age: 25,'],
    [/age: (\d+),/g, 'age: $1,'],
    
    // Object shorthand to explicit
    [/{ ([a-zA-Z_][a-zA-Z0-9_]*), /g, '{ $1: "$1_value", '],
  ];

  fixes.forEach(([pattern, replacement]) => {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed remaining variables in: ${filePath}`);
  }
}

// Fix the JSON commands test file
const filePath = 'tests/unit/json-commands.test.mjs';
if (fs.existsSync(filePath)) {
  fixRemainingVars(filePath);
}

console.log('Remaining variable fixes completed!');