import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../utils/logger'
import { ConsoleNotificationService } from './console-notification-service'

describe('ConsoleNotificationService', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
  })

  it('logs escalationId, riskLevel, and pseudonym, never a raw identifier', async () => {
    const service = new ConsoleNotificationService()
    const createdAt = new Date('2026-01-01T00:00:00.000Z')

    await service.notifyEscalation({
      escalationId: 'esc-1',
      riskLevel: 'HIGH',
      pseudonym: 'calm-otter-42',
      createdAt
    })

    expect(infoSpy).toHaveBeenCalledOnce()
    const [message, meta] = infoSpy.mock.calls[0]!
    expect(message).toContain('Escalation')
    expect(meta).toEqual({
      escalationId: 'esc-1',
      riskLevel: 'HIGH',
      pseudonym: 'calm-otter-42',
      createdAt: createdAt.toISOString()
    })
  })

  it('never throws even if the logger itself throws', async () => {
    infoSpy.mockImplementation(() => {
      throw new Error('log sink unavailable')
    })
    const service = new ConsoleNotificationService()

    await expect(
      service.notifyEscalation({
        escalationId: 'esc-1',
        riskLevel: 'HIGH',
        pseudonym: 'calm-otter-42',
        createdAt: new Date()
      })
    ).resolves.toBeUndefined()
  })
})
