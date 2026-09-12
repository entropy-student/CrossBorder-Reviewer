const { spawnSync } = require("node:child_process")
const path = require("node:path")

const testType = process.argv[2]
const supportedTypes = new Set(["unit", "integration:http", "integration:modules"])

if (!supportedTypes.has(testType)) {
  console.error(`Unsupported TEST_TYPE: ${testType || "missing"}`)
  process.exit(2)
}

const nodeOptions = [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" ")
const result = spawnSync(
  process.execPath,
  [path.join(path.dirname(require.resolve("jest/package.json")), "bin", "jest.js"), ...process.argv.slice(3)],
  {
    stdio: "inherit",
    env: { ...process.env, TEST_TYPE: testType, NODE_OPTIONS: nodeOptions },
  },
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
