import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import electron from 'electron'
const phase = process.argv.includes('--phase=12')
  ? '12'
  : process.argv.includes('--phase=11')
    ? '11'
    : process.argv.includes('--phase=7')
      ? '7'
      : process.argv.includes('--phase=3')
        ? '3'
        : '4'
const packaged = process.argv.includes('--packaged')
mkdirSync('.smoke', { recursive: true })
const data = mkdtempSync(resolve('.smoke/flow-data-'))
const report = resolve(
  process.env.MIHONPC_FLOW_REPORT ||
    (packaged ? '.smoke/flow-packaged/report.json' : '.smoke/flow/report.json')
)
const env = {
  ...process.env,
  MIHONPC_SMOKE_DATA: data,
  MIHONPC_SMOKE_REPORT: report,
  MIHONPC_TEST_FIXTURES: resolve('tests/fixtures')
}
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  packaged
    ? resolve(process.env.MIHONPC_PACKAGED_EXE || 'dist/win-unpacked/MihonPC.exe')
    : electron,
  packaged ? ['--flow-test=' + phase] : ['.', '--flow-test=' + phase],
  { env, stdio: 'inherit' }
)
const timer = setTimeout(() => {
  console.error('FLOW FAIL: process timed out')
  child.kill()
  process.exit(1)
}, 180000)
child.on('error', (error) => {
  console.error(error)
  clearTimeout(timer)
  process.exit(1)
})
child.on('exit', (code) => {
  clearTimeout(timer)
  if (code === 0) {
    const result = JSON.parse(readFileSync(report, 'utf8'))
    if (result.phase !== Number(phase)) process.exit(1)
    console.log('Report: ' + report)
  }
  process.exit(code ?? 1)
})
