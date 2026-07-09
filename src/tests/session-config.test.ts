/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SessionConfigSchema, type SessionConfig } from '../schemas/session.schema.js'
import { resolveSessionConfig } from '../core/session/session-config.js'

describe('SessionConfigSchema', () => {
  const valid: SessionConfig = {
    preset: 'default',
    provider: 'copilot',
    modelPin: null,
    flags: { ai: true, quiet: false },
  }

  it('parses a valid config', () => {
    expect(SessionConfigSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a pinned model', () => {
    expect(SessionConfigSchema.safeParse({ ...valid, modelPin: 'deepseek/deepseek-v4-flash' }).success).toBe(true)
  })

  it('rejects an empty preset', () => {
    expect(SessionConfigSchema.safeParse({ ...valid, preset: '' }).success).toBe(false)
  })
})

describe('resolveSessionConfig', () => {
  it('returns a schema-valid config with sensible defaults', () => {
    const config = resolveSessionConfig()
    expect(SessionConfigSchema.safeParse(config).success).toBe(true)
    expect(config.preset.length).toBeGreaterThan(0)
    expect(config.modelPin).toBeNull()
  })
})
