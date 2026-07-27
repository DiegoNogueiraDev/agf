import { describe, it, expect } from 'vitest'
import { LogLevelSchema, LogLayerSchema, LogEntrySchema } from '../schemas/log.schema.js'

describe('LogLevelSchema', () => {
  it('accepts valid log levels', () => {
    for (const level of ['info', 'warn', 'error', 'success', 'debug']) {
      expect(LogLevelSchema.safeParse(level).success).toBe(true)
    }
  })

  it('rejects invalid level', () => {
    expect(LogLevelSchema.safeParse('verbose').success).toBe(false)
  })
})

describe('LogLayerSchema', () => {
  it('accepts valid layers', () => {
    for (const layer of ['core', 'api', 'mcp', 'rag', 'web', 'cli']) {
      expect(LogLayerSchema.safeParse(layer).success).toBe(true)
    }
  })

  it('rejects unknown layer', () => {
    expect(LogLayerSchema.safeParse('unknown').success).toBe(false)
  })
})

describe('LogEntrySchema', () => {
  it('accepts a valid log entry', () => {
    const result = LogEntrySchema.safeParse({
      id: 1,
      level: 'info',
      message: 'Server started',
      timestamp: '2026-06-22T00:00:00.000Z',
      layer: 'core',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-integer id', () => {
    expect(
      LogEntrySchema.safeParse({
        id: 1.5,
        level: 'info',
        message: 'x',
        timestamp: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false)
  })
})
