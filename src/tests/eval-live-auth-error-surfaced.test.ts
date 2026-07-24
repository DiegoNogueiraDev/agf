/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_deb645374c52 — silent-failure fix: a provider AUTH failure (401) on the
 * live path must be SURFACED in the ScenarioResult (error + errorKind), not
 * swallowed into a bare resolve=0. Root cause: scenario-runner caught the
 * orchestrate throw and sent it only to a no-op onLog sink, recording nothing.
 */

import { describe, it, expect } from 'vitest'
import { runScenario } from '../core/evals/scenario-runner.js'
import { ModelAdapterError } from '../core/model-hub/copilot-sdk-adapter.js'
import type { Scenario } from '../core/evals/scenario-runner.js'

const scenario: Scenario = {
  id: 't-auth',
  tier: 'T0',
  persona: 'dev',
  prd: '# Task: noop\n\n## AC\n- nada',
  testCmd: 'true',
}

describe('runScenario — provider auth error is surfaced, not swallowed', () => {
  it('AC1: a 401 auth failure lands in result.error + result.errorKind (not a silent resolve=0)', async () => {
    const result = await runScenario(
      scenario,
      { live: true, maxSteps: 4 },
      {
        orchestrate: async () => {
          throw new ModelAdapterError('provider openrouter retornou 401: User not found', { status: 401 })
        },
        runTest: () => ({ passed: false, output: '' }),
        onLog: () => {},
      },
    )
    expect(result.resolved).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.error).toContain('401')
    expect(result.errorKind).toBe('auth')
  })

  it('a successful (non-throwing) run leaves error/errorKind undefined — byte-identical', async () => {
    const result = await runScenario(
      scenario,
      { live: false, maxSteps: 4 },
      {
        orchestrate: async () => ({ stopped: 'done', steps: 1 }) as never,
        runTest: () => ({ passed: false, output: '' }),
        onLog: () => {},
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.errorKind).toBeUndefined()
  })

  async function runWithThrow(err: unknown): Promise<{ error?: string; errorKind?: string; resolved: boolean }> {
    return runScenario(
      scenario,
      { live: true, maxSteps: 4 },
      {
        orchestrate: async () => {
          throw err
        },
        runTest: () => ({ passed: false, output: '' }),
        onLog: () => {},
      },
    )
  }

  it('classifies a 500 server error as retryable-kind "server" and surfaces it', async () => {
    const r = await runWithThrow(new ModelAdapterError('provider retornou 500: upstream', { status: 500 }))
    expect(r.error).toContain('500')
    expect(r.errorKind).toBe('server')
  })

  it('classifies a 429 as "rate_limit" and surfaces it', async () => {
    const r = await runWithThrow(new ModelAdapterError('provider retornou 429: slow down', { status: 429 }))
    expect(r.errorKind).toBe('rate_limit')
    expect(r.resolved).toBe(false)
  })

  it('classifies a 400 invalid request and surfaces it (not a silent zero)', async () => {
    const r = await runWithThrow(new ModelAdapterError('provider retornou 400: bad payload', { status: 400 }))
    expect(r.error).toContain('400')
    expect(r.errorKind).toBe('invalid_request')
  })

  it('surfaces a plain non-adapter Error too (no HTTP status)', async () => {
    const r = await runWithThrow(new Error('socket hang up'))
    expect(r.error).toContain('socket hang up')
    expect(typeof r.errorKind).toBe('string') // classifyLlmError always yields a kind
  })
})
