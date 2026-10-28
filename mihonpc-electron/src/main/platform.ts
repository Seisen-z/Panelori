import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
let last = 0,
  connected = false
export async function onWifi(): Promise<boolean> {
  if (Date.now() - last < 30000) return connected
  last = Date.now()
  if (process.platform !== 'win32') return false
  try {
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "@(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' -and $_.NdisPhysicalMedium -eq 9 }).Count"
      ],
      { windowsHide: true, timeout: 5000, maxBuffer: 4096 }
    )
    connected = Number(stdout.trim()) > 0
  } catch {
    connected = false
  }
  return connected
}
