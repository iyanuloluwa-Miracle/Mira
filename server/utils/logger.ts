// [R4] Application logger, wrapped in a redactor. No plaintext free text, chat content,
// identifier, or token may ever reach a log line — server/utils/privacy.ts's redactForLogs
// enforces that, and this file is what applies it, both to structured metadata passed through
// `logger` below and, as a defense-in-depth safety net, to bare console.* calls anywhere in the
// codebase once server/plugins/redact-console-logs.ts installs it at server boot.

import { redactForLogs } from './privacy'

type LogMeta = Record<string, unknown>
type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'
type ConsoleLike = Pick<Console, ConsoleMethod>

const CONSOLE_METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']

function write(level: 'info' | 'warn' | 'error', message: string, meta?: LogMeta): void {
  if (meta) {
    console[level](message, redactForLogs(meta))
  } else {
    console[level](message)
  }
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta)
}

// Patches console.* in place so any object argument passed anywhere in the codebase is
// redacted before it reaches the terminal or a log aggregator, even outside `logger` above.
// Takes an injectable target so it's testable without mutating the real global console.
export function installConsoleRedaction(target: ConsoleLike = console): void {
  for (const method of CONSOLE_METHODS) {
    const original = target[method].bind(target)
    target[method] = (...args: unknown[]) => {
      original(
        ...args.map((arg) => (typeof arg === 'object' && arg !== null ? redactForLogs(arg) : arg))
      )
    }
  }
}
