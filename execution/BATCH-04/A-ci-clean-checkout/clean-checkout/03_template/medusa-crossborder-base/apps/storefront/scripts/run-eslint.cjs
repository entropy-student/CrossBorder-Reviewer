const { spawnSync } = require("node:child_process")
const path = require("node:path")

const eslintBin = path.join(path.dirname(require.resolve("eslint/package.json")), "bin", "eslint.js")
const result = spawnSync(process.execPath, [eslintBin, "src"], {
  stdio: "inherit",
  env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "false" },
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
