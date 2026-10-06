// Starts services/classifier/ from its own venv — `npm run classifier`. Spawns that venv's
// Python interpreter directly (never a shell "activate" script) so the same command works
// unmodified on Windows (PowerShell/cmd) and Unix shells: activating a venv is shell-specific,
// but invoking `<venv>/bin/python` (or `.venv\Scripts\python.exe`) already runs with that venv's
// packages with no activation step at all.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const CLASSIFIER_DIR = join(process.cwd(), 'services', 'classifier')

function venvPythonPath(): string {
  return process.platform === 'win32'
    ? join(CLASSIFIER_DIR, '.venv', 'Scripts', 'python.exe')
    : join(CLASSIFIER_DIR, '.venv', 'bin', 'python')
}

function resolvePort(): number {
  const serviceUrl = process.env.CLASSIFIER_SERVICE_URL ?? 'http://localhost:8001'
  try {
    const parsed = new URL(serviceUrl)
    return Number(parsed.port) || 8001
  } catch {
    return 8001
  }
}

function main(): void {
  const venvPython = venvPythonPath()
  if (!existsSync(venvPython)) {
    console.error(
      `No classifier virtual environment found at ${venvPython}. Run "npm run setup" first.`
    )
    process.exitCode = 1
    return
  }

  const port = resolvePort()
  console.log(`Starting classifier service on port ${port} (${venvPython})...`)

  const child = spawn(
    venvPython,
    ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(port)],
    { cwd: CLASSIFIER_DIR, stdio: 'inherit' }
  )

  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
}

main()
