/** ESLint v9 flat config for dashboard (server + ui) */
module.exports = [
  {
    files: ['server/**/*.js', 'ui/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        EventSource: 'readonly',
        console: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-undef': 'off',
    },
  },
]
