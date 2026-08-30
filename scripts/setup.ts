// One-time (or repeatable) local bootstrap for a clean checkout — `npm run setup`. Checks
// prerequisites first and never installs anything itself at that stage (Node/npm/Python are the
// contributor's job; see docs/local-setup.md for Postgres). Only once every check passes does it
// write local files: .env (if absent), the database schema/seed, and the classifier's venv.
//
// Deliberately plain Node + tsx, no test-only imports from server/ — this has to run before
// .env exists and before `prisma generate` has necessarily been run.

import { execFileSync, execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const GENERATED_SECRET_KEYS = ['ENCRYPTION_KEY', 'IDENTIFIER_HASH_PEPPER', 'AUTH_SECRET'] as const

interface CheckResult {
  ok: boolean
  message?: string
}

// Minimal KEY="value" / KEY=value line parser — the only shape .env / .env.example ever use.
// Not a general-purpose dotenv implementation; just enough to read one or two values before any
// real config-loading (Prisma's own, Nuxt's own) is available.
function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed)
    if (!match) continue
    const [, key, rawValue] = match
    values[key!] = rawValue!.replace(/^"(.*)"$/, '$1')
  }
  return values
}

function resolveEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  for (const file of ['.env', '.env.example']) {
    const path = join(ROOT, file)
    if (!existsSync(path)) continue
    const value = parseEnvFile(readFileSync(path, 'utf-8'))[key]
    if (value) return value
  }
  return undefined
}

function checkNodeVersion(): CheckResult {
  const required = readFileSync(join(ROOT, '.nvmrc'), 'utf-8').trim()
  const requiredMajor = Number(required.split('.')[0])
  const actualMajor = Number(process.versions.node.split('.')[0])
  if (actualMajor >= requiredMajor) return { ok: true }
  return {
    ok: false,
    message:
      `Node ${process.versions.node} is active, but .nvmrc requires Node ${required}. ` +
      `Install and switch with "nvm install ${required} && nvm use ${required}" (or download ` +
      'from https://nodejs.org), then re-run "npm run setup".'
  }
}

function checkNpm(): CheckResult {
  try {
    // A single shell-interpreted command string, not execFile+shell+argv — the latter combination
    // is deprecated (DEP0190) precisely because Windows' npm/npx are .cmd shims that only run
    // through cmd.exe, which is what a plain command string gets you without that warning.
    execSync('npm --version', { stdio: 'ignore' })
    return { ok: true }
  } catch {
    return {
      ok: false,
      message:
        'npm was not found on PATH. Install Node.js from https://nodejs.org (it bundles npm), ' +
        'then re-run "npm run setup".'
    }
  }
}

function checkPython(): CheckResult {
  for (const command of ['python', 'python3']) {
    try {
      // Real executables (python / python.exe), not shell shims — no shell option needed here.
      const output = execFileSync(command, ['--version'], { encoding: 'utf-8' })
      const match = /(\d+)\.(\d+)/.exec(output)
      if (!match) continue
      const [, majorStr, minorStr] = match
      const major = Number(majorStr)
      const minor = Number(minorStr)
      if (major > 3 || (major === 3 && minor >= 10)) return { ok: true }
      return {
        ok: false,
        message:
          `Found ${output.trim()} via "${command}", but services/classifier/ requires Python ` +
          '3.10+. Install a newer Python from https://www.python.org/downloads/ (Windows/macOS) ' +
          'or "sudo apt install python3.10" (Debian/Ubuntu), then re-run "npm run setup".'
      }
    } catch {
      continue
    }
  }
  return {
    ok: false,
    message:
      'Python 3.10+ was not found (tried "python" and "python3"). Install it from ' +
      'https://www.python.org/downloads/ (Windows/macOS) or "sudo apt install python3.10" ' +
      '(Debian/Ubuntu), then re-run "npm run setup".'
  }
}

function redactConnectionString(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    if (parsed.username) parsed.username = '***'
    return parsed.toString()
  } catch {
    return '<unparseable DATABASE_URL>'
  }
}

function checkPostgresReachable(): Promise<CheckResult> {
  const databaseUrl = resolveEnvValue('DATABASE_URL')
  if (!databaseUrl) {
    return Promise.resolve({
      ok: false,
      message:
        'DATABASE_URL is not set anywhere (no env var, .env, or .env.example default). See ' +
        'docs/local-setup.md for how to get a Postgres instance running, then set DATABASE_URL.'
    })
  }

  let host: string
  let port: number
  try {
    const parsed = new URL(databaseUrl)
    host = parsed.hostname
    port = Number(parsed.port) || 5432
  } catch {
    return Promise.resolve({
      ok: false,
      message: `DATABASE_URL is not a valid connection string: ${redactConnectionString(databaseUrl)}`
    })
  }

  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 5000 })
    const fail = (): void => {
      socket.destroy()
      resolve({
        ok: false,
        message:
          `Could not reach a Postgres server at DATABASE_URL (${redactConnectionString(databaseUrl)}). ` +
          'Check that the server is running and DATABASE_URL is correct — see ' +
          'docs/local-setup.md for three ways to get one running locally, then re-run ' +
          '"npm run setup".'
      })
    }
    socket.once('connect', () => {
      socket.end()
      resolve({ ok: true })
    })
    socket.once('timeout', fail)
    socket.once('error', fail)
  })
}

function bootstrapEnvFile(): void {
  const envPath = join(ROOT, '.env')
  if (existsSync(envPath)) {
    console.log('.env already exists — leaving it untouched.')
    return
  }
  let contents = readFileSync(join(ROOT, '.env.example'), 'utf-8')
  for (const key of GENERATED_SECRET_KEYS) {
    const generated = randomBytes(32).toString('base64')
    contents = contents.replace(new RegExp(`^${key}=""$`, 'm'), `${key}="${generated}"`)
  }
  writeFileSync(envPath, contents)
  console.log(
    `Created .env from .env.example, with random development values generated for ` +
      `${GENERATED_SECRET_KEYS.join(', ')}.`
  )
}

// For npm/npx: Windows only exposes these as .cmd shims, which CreateProcess can't run directly
// (EINVAL) without going through cmd.exe — a single shell-interpreted string does that cleanly.
// All arguments here are fixed, trusted literals, never interpolated user input.
function runShell(command: string): void {
  console.log(`\n$ ${command}`)
  execSync(command, { stdio: 'inherit' })
}

// For real executables (a Python interpreter, a venv's own python) — no shell needed or wanted.
function runExe(command: string, args: string[]): void {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { stdio: 'inherit' })
}

function venvPythonPath(): string {
  const venvDir = join(ROOT, 'services', 'classifier', '.venv')
  return process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python')
}

function bootstrapClassifierVenv(): void {
  const venvPython = venvPythonPath()
  if (existsSync(venvPython)) {
    console.log('services/classifier/.venv already exists — leaving it untouched.')
    return
  }
  const pythonCommand = ['python', 'python3'].find((command) => {
    try {
      execFileSync(command, ['--version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })
  if (!pythonCommand) throw new Error('No usable Python interpreter found to create the venv.')

  runExe(pythonCommand, ['-m', 'venv', join('services', 'classifier', '.venv')])
  runExe(venvPython, [
    '-m',
    'pip',
    'install',
    '-r',
    join('services', 'classifier', 'requirements.txt')
  ])
}

async function main(): Promise<void> {
  console.log('Checking prerequisites...\n')

  const checks: [string, CheckResult][] = [
    ['Node version', checkNodeVersion()],
    ['npm', checkNpm()],
    ['Python 3.10+', checkPython()],
    ['Postgres reachable', await checkPostgresReachable()]
  ]

  const failures = checks.filter(([, result]) => !result.ok)
  for (const [label, result] of checks) {
    console.log(`  [${result.ok ? 'ok' : 'FAIL'}] ${label}`)
  }

  if (failures.length > 0) {
    console.error('\nSetup cannot continue until these are fixed:\n')
    for (const [, result] of failures) console.error(`- ${result.message}`)
    process.exitCode = 1
    return
  }

  console.log('\nAll prerequisites met. Bootstrapping local environment...')

  bootstrapEnvFile()
  runShell('npx prisma migrate deploy')
  runShell('npm run db:seed')
  bootstrapClassifierVenv()

  console.log('\nSetup complete. Run "npm run demo" for a full walkthrough, or "npm run dev:all".')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
