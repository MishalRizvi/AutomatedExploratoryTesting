module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFiles: ['dotenv/config'],
    testMatch: [
      "**/tests/**/*.test.ts",
      "**/src/**/*.test.ts"
    ]
  };