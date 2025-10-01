module.exports = {
  test: {
  globals: true,
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      provider: 'v8'
    }
  }
};
