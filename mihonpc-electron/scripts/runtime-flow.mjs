import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import electron from 'electron'
mkdirSync('.smoke', { recursive: true })
const data = mkdtempSync(resolve('.smoke/runtime-data-')),
  report = resolve(process.env.MIHONPC_RUNTIME_REPORT || '.smoke/runtime/report.json')
const env = { ...process.env, MIHONPC_SMOKE_DATA: data, MIHONPC_SMOKE_REPORT: report }
delete env.ELECTRON_RUN_AS_NODE
const packaged = process.argv.includes('--packaged')
const child = spawn(
  packaged
    ? resolve(process.env.MIHONPC_PACKAGED_EXE || 'dist/win-unpacked/MihonPC.exe')
    : electron,
  packaged ? ['--runtime-test'] : ['.', '--runtime-test'],
  { env, stdio: 'inherit' }
)
const timer = setTimeout(() => {
  child.kill()
  console.error('RUNTIME FAIL: timeout')
  process.exit(1)
}, 420000)
child.on('error', (error) => {
  clearTimeout(timer)
  console.error(error)
  process.exit(1)
})
child.on('exit', (code) => {
  clearTimeout(timer)
  if (code === 0) {
    const result = JSON.parse(readFileSync(report, 'utf8'))
    if (!result.imageBytes) process.exit(1)
    console.log('Report: ' + report)
  }
  process.exit(code ?? 1)
})
