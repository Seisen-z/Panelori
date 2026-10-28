import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import electron from 'electron'
mkdirSync('.smoke', { recursive: true })
const packaged = process.argv.includes('--packaged')
const data = mkdtempSync(resolve('.smoke/data-'))
const report = resolve('.smoke', packaged ? 'packaged/report.json' : 'report.json')
rmSync(report, { force: true })
const env = { ...process.env, MIHONPC_SMOKE_DATA: data, MIHONPC_SMOKE_REPORT: report }
delete env.ELECTRON_RUN_AS_NODE
const executable = packaged ? resolve('dist/win-unpacked/MihonPC.exe') : electron
const args = packaged ? ['--smoke-test'] : ['.', '--smoke-test']
const child = spawn(executable, args, { stdio: 'inherit', env })
const timer = setTimeout(() => {
  console.error('SMOKE FAIL: process timeout')
  child.kill()
  process.exit(1)
}, 90000)
child.on('error', (error) => {
  console.error(error)
  clearTimeout(timer)
  process.exit(1)
})
child.on('exit', (code) => {
  clearTimeout(timer)
  if (code === 0) {
    const result = JSON.parse(readFileSync(report, 'utf8'))
    if (result.result.status.databasePath !== resolve(data, 'mihonpc.db')) process.exit(1)
    console.log('Report: ' + report)
  }
  process.exit(code ?? 1)
})
