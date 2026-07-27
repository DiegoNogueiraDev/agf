/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-surface-command — /surface command integration tests.
 */
import { describe, it, expect } from 'vitest'
import { decideOutput, type FormatIntent } from '../tui/surface-decide.js'

describe('/surface: decideOutput()', () => {
  it('routes code-review to html', () => {
    const result = decideOutput('code-review')
    expect(result.format).toBe('html')
    expect(result.rationale.length).toBeGreaterThan(0)
  })

  it('routes spec to markdown (default size)', () => {
    const result = decideOutput('spec')
    expect(result.format).toBe('markdown')
  })

  it('routes data-extract to json', () => {
    const result = decideOutput('data-extract')
    expect(result.format).toBe('json')
  })

  it('routes dashboard to html', () => {
    const result = decideOutput('dashboard')
    expect(result.format).toBe('html')
  })

  it('routes report to markdown', () => {
    const result = decideOutput('report')
    expect(result.format).toBe('markdown')
  })

  it('routes doc to markdown', () => {
    const result = decideOutput('doc')
    expect(result.format).toBe('markdown')
  })
})

describe('/surface: intent coverage', () => {
  it('all valid intents produce a decision', () => {
    const intents: FormatIntent[] = ['spec', 'code-review', 'report', 'dashboard', 'doc', 'data-extract', 'scratchpad']
    for (const intent of intents) {
      const result = decideOutput(intent)
      expect(result.format).toBeTruthy()
      expect(result.rationale.length).toBeGreaterThan(0)
    }
  })
})
