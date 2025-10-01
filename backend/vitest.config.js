export default {
  test: {
    globals: true,
    include: ['tests/**/*.test.{js,ts}'],
    environment: 'node',
    coverage: {
      provider: 'v8'
    }
  }
}
