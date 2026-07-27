/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { checkSerenaHealthSafeWith } from '../core/doctor/doctor-checks-serena.js'

describe('checkSerenaHealthSafeWith — connected', () => {
  it('returns level ok when Serena is connected', async () => {
    const result = await checkSerenaHealthSafeWith(async () => ({ connected: true, version: '1.0.0' }))
    expect(result.level).toBe('ok')
  })

  it('includes the version in the message', async () => {
    const result = await checkSerenaHealthSafeWith(async () => ({ connected: true, version: '2.3.4' }))
    expect(result.message).toContain('2.3.4')
  })

  it('has name serena-health', async () => {
    const result = await checkSerenaHealthSafeWith(async () => ({ connected: true, version: '1.0.0' }))
    expect(result.name).toBe('serena-health')
  })
})

describe('checkSerenaHealthSafeWith — not connected', () => {
  it('returns level warning when Serena is not connected', async () => {
    const result = await checkSerenaHealthSafeWith(async () => ({ connected: false }))
    expect(result.level).toBe('warning')
  })

  it('provides a suggestion when not connected', async () => {
    const result = await checkSerenaHealthSafeWith(async () => ({ connected: false }))
    expect(result.suggestion).toBeTruthy()
  })

  it('has name serena-health', async () => {
    const result = await checkSerenaHealthSafeWith(async () => ({ connected: false }))
    expect(result.name).toBe('serena-health')
  })
})
