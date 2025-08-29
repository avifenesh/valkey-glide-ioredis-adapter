const eslint = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const prettier = require('eslint-config-prettier');

module.exports = [
  // Base ESLint recommended rules
  eslint.configs.recommended,
  
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        global: 'readonly',
        console: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Basic TypeScript rules (without type-checking) - very lenient for release
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
      'no-unreachable': 'off',
      'no-useless-catch': 'off',
      'no-empty': 'off',
      'no-case-declarations': 'off'
    }
  },
  
  // Prettier integration (should be last)
  prettier,
  
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**']
  }
];