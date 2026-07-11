/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for Task 4.1: out.advisory() output level for non-fatal warnings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('out.advisory() output level', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let captured: string[]

  beforeEach(() => {
    captured = []
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      captured.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    })
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    vi.resetModules()
  })

  it('CliOutput interface exposes advisory method', async () => {
    const { createCliOutput } = await import('../cli/shared/cli-output.js')
    const out = createCliOutput('test')
    expect(typeof out.advisory).toBe('function')
  })

  it('advisory emits envelope with status="advisory"', async () => {
    const { createCliOutput } = await import('../cli/shared/cli-output.js')
    const out = createCliOutput('test')
    out.advisory('WARN_CODE', 'something non-fatal', { detail: 42 })
    expect(captured.length).toBeGreaterThan(0)
    const envelope = JSON.parse(captured[0].trim())
    expect(envelope.status).toBe('advisory')
    expect(envelope.ok).toBe(true)
  })

  it('advisory envelope contains code, message, and data', async () => {
    const { createCliOutput } = await import('../cli/shared/cli-output.js')
    const out = createCliOutput('test')
    out.advisory('WIP_LIMIT', 'WIP=1 limit reached', { inProgressId: 'node_abc' })
    const envelope = JSON.parse(captured[0].trim())
    expect(envelope.code).toBe('WIP_LIMIT')
    expect(envelope.message).toBe('WIP=1 limit reached')
    expect(envelope.data).toEqual({ inProgressId: 'node_abc' })
  })

  it('advisory does not set exitCode to 1 (non-fatal)', async () => {
    const { createCliOutput } = await import('../cli/shared/cli-output.js')
    const origExitCode = process.exitCode
    const out = createCliOutput('test')
    out.advisory('SOME_WARN', 'non-fatal warning')
    expect(process.exitCode).not.toBe(1)
    process.exitCode = origExitCode
  })

  it('advisory can be distinguished from ok and fail via status field', async () => {
    const { createCliOutput } = await import('../cli/shared/cli-output.js')
    const out = createCliOutput('test')

    out.advisory('TEST_WARN', 'advisory message', {})
    const advisory = JSON.parse(captured[0].trim())
    expect(advisory.status).toBe('advisory')
    expect(advisory.ok).toBe(true)
  })
})
