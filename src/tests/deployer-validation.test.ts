import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { validateDeployOptions } from '../core/deployer/validation.js'

describe('validateDeployOptions', () => {
  it('accepts an empty options object', () => {
    expect(validateDeployOptions({})).toEqual({})
  })

  it('accepts hasSnapshots and knowledgeCount', () => {
    expect(validateDeployOptions({ hasSnapshots: true, knowledgeCount: 3 })).toEqual({
      hasSnapshots: true,
      knowledgeCount: 3,
    })
  })

  it('rejects a negative knowledgeCount', () => {
    expect(() => validateDeployOptions({ knowledgeCount: -1 })).toThrow(z.ZodError)
  })

  it('rejects a non-boolean hasSnapshots', () => {
    expect(() => validateDeployOptions({ hasSnapshots: 'yes' })).toThrow(z.ZodError)
  })
})
