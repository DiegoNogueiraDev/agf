import { describe, it, expect } from 'vitest'
import {
  ProviderCapabilitiesSchema,
  AuthInfoSchema,
  ModelProviderInfoSchema,
} from '../schemas/model-provider.schema.js'

describe('ProviderCapabilitiesSchema', () => {
  it('accepts valid capabilities', () => {
    expect(
      ProviderCapabilitiesSchema.safeParse({
        namespaceTools: true,
        imageGeneration: false,
        webSearch: true,
      }).success,
    ).toBe(true)
  })

  it('rejects missing field', () => {
    expect(ProviderCapabilitiesSchema.safeParse({ namespaceTools: true }).success).toBe(false)
  })
})

describe('AuthInfoSchema', () => {
  it('accepts valid auth info', () => {
    expect(
      AuthInfoSchema.safeParse({
        command: 'gh auth token',
        args: [],
        timeoutMs: 5000,
        refreshIntervalMs: 3600000,
        cwd: '/tmp',
      }).success,
    ).toBe(true)
  })
})

describe('ModelProviderInfoSchema', () => {
  it('accepts a minimal valid provider', () => {
    const result = ModelProviderInfoSchema.safeParse({
      name: 'openai',
      wireApi: 'Responses',
      capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(
      ModelProviderInfoSchema.safeParse({
        name: '',
        wireApi: 'Responses',
        capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
      }).success,
    ).toBe(false)
  })

  it('rejects retries > 100', () => {
    expect(
      ModelProviderInfoSchema.safeParse({
        name: 'x',
        wireApi: 'Responses',
        capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
        requestMaxRetries: 101,
      }).success,
    ).toBe(false)
  })
})
