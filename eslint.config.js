import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import security from 'eslint-plugin-security'

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '**/*.js', '**/*.mjs', '**/*.cjs'],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript strict rules
  ...tseslint.configs.strict,

  // Security plugin
  security.configs.recommended,

  // Project-specific overrides
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.generated.ts', 'src/tests/**'],
    rules: {
      // File size gate — error at 800 lines; decomposition is mandatory
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],

      // Enforce logger usage over console
      'no-console': 'warn',

      // Allow underscore-prefixed unused vars
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // TypeScript strict
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Security plugin adjustments for local-first project
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'warn',
    },
  },

  // TUI top-level app — large Ink state machine; higher limit acknowledged in architecture.md
  {
    files: ['src/tui/interactive-app.tsx'],
    rules: {
      'max-lines': ['error', { max: 1200, skipBlankLines: true, skipComments: true }],
    },
  },

  // Logger file — must use console (it IS the console wrapper)
  {
    files: ['src/core/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Test files — relaxed rules
  {
    files: ['src/tests/**/*.ts', 'src/tests/**/*.tsx'],
    rules: {
      'no-console': 'off',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'security/detect-object-injection': 'off',
    },
  },
)
