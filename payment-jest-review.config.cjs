const path = require('node:path')
const backend = 'C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store/03_template/medusa-crossborder-base/apps/backend'
module.exports = {
  rootDir: backend,
  transform: { '^.+\\.[jt]s$': [require.resolve('@swc/jest', {paths: [backend]}), {jsc: {parser: {syntax: 'typescript', decorators: true}}}] },
  testEnvironment: 'node',
  testMatch: ['**/src/**/__tests__/**/*.unit.spec.[jt]s'],
  modulePathIgnorePatterns: ['dist/', '<rootDir>/.medusa/'],
  cache: false,
  cacheDirectory: 'C:/Users/34707/Documents/ChatGPT/跨境电商-review/jest-cache',
}
