import { describe, it, expect } from 'vitest'
import {
  ModelProviderInfoSchema,
  ProviderCapabilitiesSchema,
  AuthInfoSchema,
  AwsAuthInfoSchema,
  WireApi,
} from '../schemas/model-provider.schema.js'

describe('ProviderCapabilitiesSchema', () => {
  it('should accept valid capabilities', () => {
    expect(
      ProviderCapabilitiesSchema.safeParse({ namespaceTools: true, imageGeneration: false, webSearch: false }).success,
    ).toBe(true)
  })
})

describe('WireApi', () => {
  it('should define Responses', () => {
    expect(WireApi.Responses).toBe('Responses')
  })
})

describe('AuthInfoSchema', () => {
  it('should accept valid auth config', () => {
    const result = AuthInfoSchema.safeParse({
      command: 'print-token',
      args: ['--key'],
      timeoutMs: 5000,
      refreshIntervalMs: 300000,
      cwd: '/home',
    })
    expect(result.success).toBe(true)
  })
})

describe('AwsAuthInfoSchema', () => {
  it('should accept valid AWS config', () => {
    expect(AwsAuthInfoSchema.safeParse({ profile: 'default', region: 'us-east-1' }).success).toBe(true)
  })
})

describe('ModelProviderInfoSchema', () => {
  it('should accept OpenAI-style config', () => {
    const result = ModelProviderInfoSchema.safeParse({
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      envKey: 'OPENAI_API_KEY',
      wireApi: 'Responses',
      capabilities: { namespaceTools: true, imageGeneration: true, webSearch: true },
    })
    expect(result.success).toBe(true)
  })

  it('should accept Ollama config', () => {
    const result = ModelProviderInfoSchema.safeParse({
      name: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      wireApi: 'Responses',
      capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
    })
    expect(result.success).toBe(true)
  })

  it('should accept provider with auth', () => {
    const result = ModelProviderInfoSchema.safeParse({
      name: 'custom',
      baseUrl: 'https://custom.api.com',
      auth: { command: 'token-gen', args: [], timeoutMs: 5000, refreshIntervalMs: 300000, cwd: '/tmp' },
      wireApi: 'Responses',
      capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
    })
    expect(result.success).toBe(true)
  })

  it('should accept provider with AWS auth', () => {
    const result = ModelProviderInfoSchema.safeParse({
      name: 'amazon-bedrock',
      aws: { profile: 'bedrock', region: 'us-east-1' },
      wireApi: 'Responses',
      capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid baseUrl', () => {
    const result = ModelProviderInfoSchema.safeParse({
      name: 'bad',
      baseUrl: 'not-a-url',
      wireApi: 'Responses',
      capabilities: { namespaceTools: false, imageGeneration: false, webSearch: false },
    })
    expect(result.success).toBe(false)
  })
})
