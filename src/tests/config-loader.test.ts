import { describe, it, expect } from 'vitest'
import { isBuiltinConfig } from '../core/config/config-loader.js'
import type { McpGraphConfig } from '../core/config/config-schema.js'

function makeConfig(overrides: Partial<McpGraphConfig> = {}): McpGraphConfig {
  return {
    port: 3000,
    dbPath: 'workflow-graph',
    ...overrides,
  } as McpGraphConfig
}

describe('isBuiltinConfig', () => {
  it('returns isDefault=true for default values', () => {
    const result = isBuiltinConfig(makeConfig())
    expect(result.isDefault).toBe(true)
    expect(result.hasFile).toBe(false)
  })

  it('returns isDefault=false when port is non-default', () => {
    const result = isBuiltinConfig(makeConfig({ port: 8080 }))
    expect(result.isDefault).toBe(false)
    expect(result.hasFile).toBe(true)
  })

  it('returns isDefault=false when dbPath is non-default', () => {
    const result = isBuiltinConfig(makeConfig({ dbPath: 'custom-graph' }))
    expect(result.isDefault).toBe(false)
  })

  it('returns isDefault=false when basePath is set', () => {
    const result = isBuiltinConfig(makeConfig({ basePath: '/custom/path' }))
    expect(result.isDefault).toBe(false)
  })

  it('hasFile and isDefault are inverse of each other', () => {
    const defaults = isBuiltinConfig(makeConfig())
    expect(defaults.hasFile).toBe(!defaults.isDefault)

    const custom = isBuiltinConfig(makeConfig({ port: 9999 }))
    expect(custom.hasFile).toBe(!custom.isDefault)
  })
})
