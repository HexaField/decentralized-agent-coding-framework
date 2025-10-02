/** ESLint v9 flat config for dashboard (server + ui) */
const ts = require('@typescript-eslint/parser')

module.exports = [
  {
    ignores: ['ui/dist/**', 'dist/**', 'node_modules/**'],
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: ts,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: false },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
    },
  },
  {
    files: ['ui/**/*.ts', 'ui/**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: ts,
      parserOptions: {
        project: ['./ui/tsconfig.json'],
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        EventSource: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-undef': 'off',
    },
  },
  // Ignore vite config from TS project parsing
  {
    ignores: ['ui/vite.config.ts'],
  },
]
