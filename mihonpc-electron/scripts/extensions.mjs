import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import electron from 'electron'
mkdirSync('.smoke', { recursive: true })
const data = mkdtempSync(resolve('.smoke/extension-data-'))
const env = {
  ...process.env,
  MIHONPC_SMOKE_DATA: data,
  MIHONPC_SMOKE_REPORT: resolve('.smoke/extensions-report.json')
}
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, ['.', '--extension-test'], { env, stdio: 'inherit' })
const timer = setTimeout(() => {
  child.kill()
  process.exit(1)
}, 120000)
child.on('error', (error) => {
  console.error(error)
  clearTimeout(timer)
  process.exit(1)
})
child.on('exit', (code) => {
  clearTimeout(timer)
  process.exit(code ?? 1)
})
