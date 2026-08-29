import { describe, expect, it } from 'vitest'
import { emptyBodySchema, emptyQuerySchema, slugParamSchema, uuidParamSchema } from './validation'

describe('uuidParamSchema', () => {
  it('accepts a well-formed UUID', () => {
    expect(uuidParamSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true)
  })

  it.each(['not-a-uuid', '', undefined, '123e4567-e89b-12d3-a456', "'; drop table users; --"])(
    'rejects %p',
    (value) => {
      expect(uuidParamSchema.safeParse(value).success).toBe(false)
    }
  )
})

describe('slugParamSchema', () => {
  it('accepts lowercase kebab-case', () => {
    expect(slugParamSchema.safeParse('what-your-score-means').success).toBe(true)
  })

  it.each(['UPPERCASE', 'has spaces', 'trailing-', '-leading', 'double--hyphen', '', undefined])(
    'rejects %p',
    (value) => {
      expect(slugParamSchema.safeParse(value).success).toBe(false)
    }
  )
})

describe('emptyQuerySchema / emptyBodySchema', () => {
  it('accepts an empty object', () => {
    expect(emptyQuerySchema.safeParse({}).success).toBe(true)
    expect(emptyBodySchema.safeParse({}).success).toBe(true)
  })

  it('rejects any unexpected key, silently stripping nothing', () => {
    expect(emptyQuerySchema.safeParse({ foo: 'bar' }).success).toBe(false)
    expect(emptyBodySchema.safeParse({ admin: true }).success).toBe(false)
  })
})
