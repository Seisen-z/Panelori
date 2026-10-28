import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import electron from 'electron'
await build({
  entryPoints: ['tests/foundation.test.ts'],
  outfile: '.test-out/foundation.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['better-sqlite3', 'electron'],
  sourcemap: true
})
const result = spawnSync(electron, ['.test-out/foundation.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  timeout: 60000
})
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
