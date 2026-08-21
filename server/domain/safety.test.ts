import { describe, expect, it } from 'vitest'
import { HELPLINES } from '../../config/helplines'
import { CRISIS_INSTRUCTION, CRISIS_MESSAGE, getCrisisResponse } from './safety'

describe('getCrisisResponse', () => {
  it('returns supportive plain-language text and an instruction to seek help', () => {
    const response = getCrisisResponse()
    expect(response.message).toBe(CRISIS_MESSAGE)
    expect(response.instruction).toBe(CRISIS_INSTRUCTION)
    expect(response.message.length).toBeGreaterThan(0)
    expect(response.instruction.length).toBeGreaterThan(0)
  })

  it('does not contain a numeric risk score or band in the message or instruction', () => {
    const response = getCrisisResponse()
    expect(response.message + response.instruction).not.toMatch(/\b\d+\s*(\/|out of)\s*\d+\b/)
  })

  it('includes the configured helpline contacts', () => {
    const response = getCrisisResponse()
    expect(response.helplines).toEqual(HELPLINES)
    expect(response.helplines.length).toBeGreaterThan(0)
  })

  it('reports helplinesVerified as false while any placeholder remains', () => {
    const response = getCrisisResponse()
    expect(response.helplines.some((helpline) => !helpline.verified)).toBe(true)
    expect(response.helplinesVerified).toBe(false)
  })

  it('is synchronous — returns a plain object, not a Promise', () => {
    const response = getCrisisResponse()
    expect(response).not.toBeInstanceOf(Promise)
  })

  it('is deterministic: repeated calls return equal payloads', () => {
    expect(getCrisisResponse()).toEqual(getCrisisResponse())
  })
})
