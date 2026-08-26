import { afterEach, describe, expect, it, vi } from 'vitest'
import { installConsoleRedaction, logger } from './logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redacts denylisted keys in metadata passed to info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('screening completed', { email: 'user@example.com', riskLevel: 'HIGH' })
    expect(spy).toHaveBeenCalledWith('screening completed', {
      email: '[REDACTED]',
      riskLevel: 'HIGH'
    })
  })

  it('redacts denylisted keys in metadata passed to warn and error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.warn('classifier degraded', { token: 'secret-token' })
    logger.error('unhandled error', { message: 'do not log me' })
    expect(warnSpy).toHaveBeenCalledWith('classifier degraded', { token: '[REDACTED]' })
    expect(errorSpy).toHaveBeenCalledWith('unhandled error', { message: '[REDACTED]' })
  })

  it('logs a bare message with no metadata argument at all', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('classifier unavailable, degrading')
    expect(spy).toHaveBeenCalledWith('classifier unavailable, degrading')
    expect(spy.mock.calls[0]).toHaveLength(1)
  })
})

describe('installConsoleRedaction', () => {
  it('redacts object arguments passed to a patched console method', () => {
    const calls: unknown[][] = []
    const fakeConsole = {
      log: (...args: unknown[]) => {
        calls.push(args)
      },
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    }

    installConsoleRedaction(fakeConsole as unknown as Console)
    fakeConsole.log('user input', { token: 'abc123', riskLevel: 'HIGH' })

    expect(calls[0]).toEqual(['user input', { token: '[REDACTED]', riskLevel: 'HIGH' }])
  })

  it('leaves non-object arguments untouched', () => {
    const calls: unknown[][] = []
    const fakeConsole = {
      log: (...args: unknown[]) => {
        calls.push(args)
      },
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    }

    installConsoleRedaction(fakeConsole as unknown as Console)
    fakeConsole.log('plain string', 42, true)

    expect(calls[0]).toEqual(['plain string', 42, true])
  })
})
