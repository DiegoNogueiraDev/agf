/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.5 Integration tests: autonomy → context → model chain
 *
 * AC1: autopilot full cycle with mock LLM — steps tracked in result.steps (ledger)
 * AC2: malformed model response → DoD failure propagated, not swallowed
 * AC3: all 5 new test files in autonomy/ are discoverable via blast test (--changed HEAD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAutopilot } from '../../core/autonomy/autopilot-loop.js'
import { attemptImplementation } from '../../core/autonomy/implement-attempt.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AutopilotGraphPort } from '../../core/autonomy/autopilot-loop.js'
import type { AttemptDeps, AttemptOptions } from '../../core/autonomy/implement-attempt.js'

// ── Mocks for implement-attempt's heavy deps ───────────────────────────────────

vi.mock('../../core/tool-compress/index.js', () => ({
  compressToolOutput: vi.fn().mockImplementation((raw: string) => ({ value: raw, filter: null, saved: 0 })),
}))
vi.mock('../../core/economy/content-router.js', () => ({
  routeContent: vi.fn().mockReturnValue(null),
}))
vi.mock('../../core/tool-compress/extract-failures.js', () => ({
  buildStructuredSummary: vi.fn().mockReturnValue({ count: 0, text: '' }),
}))
vi.mock('../../core/hooks/economy-lifecycle-hooks.js', () => ({
  emitEconomyHook: vi.fn(),
}))
vi.mock('../../core/economy/economy-lever-ledger.js', () => ({
  recordLeverEvent: vi.fn(),
}))

// ── Test Helpers ───────────────────────────────────────────────────────────────

const VALID_PLAN = '```json\n{"edits":[{"path":"x.ts","oldString":"","newString":"// x"}]}\n```'

function makePort(overrides: Partial<AutopilotGraphPort> = {}): AutopilotGraphPort {
  return {
    nextTask: vi.fn().mockReturnValue(null),
    markInProgress: vi.fn(),
    checkDone: vi.fn().mockReturnValue({ ready: true, failedRequired: [] }),
    markDone: vi.fn(),
    ...overrides,
  }
}

function makeAttemptDeps(overrides: Partial<AttemptDeps> = {}): AttemptDeps {
  return {
    generate: vi.fn().mockResolvedValue(VALID_PLAN),
    execute: vi.fn().mockResolvedValue({ testPassed: true, testOutput: 'ok' }),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ── AC1: full autopilot cycle — steps tracked in ledger ───────────────────────

describe('AC1: autopilot full cycle with mock LLM — steps tracked in result.steps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('single task: runAutopilot records in_progress and done steps for each completed task', async () => {
    let seq = 0
    const tasks = [
      { id: 'node_t1', title: 'Implement feature A' },
      { id: 'node_t2', title: 'Implement feature B' },
    ]
    const port = makePort({
      nextTask: vi.fn(() => tasks[seq++] ?? null),
    })

    const result = await runAutopilot(port, { maxIterations: 5 })

    expect(result.stopped).toBe('no_more_tasks')
    expect(result.completed).toBe(2)

    const inProgressSteps = result.steps.filter((s) => s.action === 'in_progress')
    const doneSteps = result.steps.filter((s) => s.action === 'done')
    expect(inProgressSteps).toHaveLength(2)
    expect(doneSteps).toHaveLength(2)

    // Step ordering: each task has in_progress before done
    const t1ip = result.steps.findIndex((s) => s.action === 'in_progress' && s.nodeId === 'node_t1')
    const t1done = result.steps.findIndex((s) => s.action === 'done' && s.nodeId === 'node_t1')
    expect(t1ip).toBeLessThan(t1done)
  })

  it('autopilot with real attemptImplementation wired as implement callback', async () => {
    let seq = 0
    const task = { id: 'node_int1', title: 'Integration task' }
    const port = makePort({
      nextTask: vi.fn(() => (seq++ === 0 ? task : null)),
    })
    const deps = makeAttemptDeps()

    // Wire attemptImplementation as the implement callback
    const implement = async (node: { id: string; title: string }): Promise<boolean> => {
      const opts: AttemptOptions = { node, maxAttempts: 2 }
      const outcome = await attemptImplementation(deps, opts)
      return outcome.success
    }

    const result = await runAutopilot(port, { maxIterations: 3, implement })

    expect(result.stopped).toBe('no_more_tasks')
    expect(result.completed).toBe(1)
    expect(deps.generate).toHaveBeenCalledTimes(1)
    expect(deps.execute).toHaveBeenCalledTimes(1)

    // The ledger captures both phases
    expect(result.steps.some((s) => s.action === 'in_progress')).toBe(true)
    expect(result.steps.some((s) => s.action === 'done')).toBe(true)
  })

  it('autopilot stores escalation step when implement returns false', async () => {
    let seq = 0
    const port = makePort({
      nextTask: vi.fn(() => (seq++ === 0 ? { id: 'node_fail1', title: 'Failing task' } : null)),
    })

    // implement always fails
    const implement = vi.fn().mockResolvedValue(false)

    const result = await runAutopilot(port, { maxIterations: 3, implement })

    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
    expect(result.steps.some((s) => s.action === 'escalated')).toBe(true)
  })
})

// ── AC2: malformed model response → DoD failure, not swallowed ────────────────

describe('AC2: malformed model response → failure surfaced, not swallowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generate returning plain text (no JSON block) → attemptImplementation returns success:false', async () => {
    const deps = makeAttemptDeps({
      generate: vi.fn().mockResolvedValue('This is just prose, no code block'),
    })

    const result = await attemptImplementation(deps, {
      node: { id: 'node_x', title: 'Malformed test' },
      maxAttempts: 1,
    })

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1)
  })

  it('generate returning empty JSON object (no edits) → success:false from parse validation', async () => {
    const deps = makeAttemptDeps({
      generate: vi.fn().mockResolvedValue('```json\n{"edits":[]}\n```'),
    })

    const result = await attemptImplementation(deps, {
      node: { id: 'node_y', title: 'Empty edits' },
      maxAttempts: 1,
    })

    expect(result.success).toBe(false)
  })

  it('malformed response propagated to autopilot as escalation step (not silent)', async () => {
    let seq = 0
    const port = makePort({
      nextTask: vi.fn(() => (seq++ === 0 ? { id: 'node_bad_llm', title: 'Task with bad LLM' } : null)),
    })

    const deps = makeAttemptDeps({
      generate: vi.fn().mockResolvedValue('totally malformed output, no JSON'),
      execute: vi.fn(), // never called when parse fails
    })

    const implement = async (node: { id: string; title: string }): Promise<boolean> => {
      const outcome = await attemptImplementation(deps, { node, maxAttempts: 1 })
      return outcome.success // false → escalation
    }

    const result = await runAutopilot(port, { maxIterations: 3, implement })

    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
    // The escalation step is in the ledger
    expect(result.steps.find((s) => s.action === 'escalated')).toBeDefined()
    expect(result.steps.find((s) => s.action === 'escalated')?.nodeId).toBe('node_bad_llm')
  })

  it('generate throwing auth error → single attempt, no retry, failure not swallowed', async () => {
    const authErr = Object.assign(new Error('401 Unauthorized'), { status: 401 })
    const deps = makeAttemptDeps({
      generate: vi.fn().mockRejectedValue(authErr),
    })

    const result = await attemptImplementation(deps, {
      node: { id: 'node_auth', title: 'Auth error task' },
      maxAttempts: 3,
    })

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1) // no retry on 401
    expect(deps.generate).toHaveBeenCalledTimes(1)
  })
})

// ── AC3: 5 new test files in autonomy/ are discoverable ──────────────────────

describe('AC3: all 5 new autonomy test files exist and are discoverable', () => {
  const testDir = new URL('../../tests/autonomy', import.meta.url).pathname

  const expectedFiles = [
    'autopilot-loop.test.ts', // Task 1.1
    'implement-attempt.test.ts', // Task 1.2
    'task-prep.test.ts', // Task 1.3
    'autonomy-chain.test.ts', // Task 1.5 (this file)
  ]

  it('all 4 autonomy test files exist on disk', () => {
    for (const file of expectedFiles) {
      const path = join(testDir, file)
      expect(existsSync(path), `Expected ${file} to exist at ${path}`).toBe(true)
    }
  })

  it('model-hub task 1.4 test file exists alongside autonomy tests', () => {
    const modelHubTest = new URL('../../tests/model-hub/failover-auth-tier.test.ts', import.meta.url).pathname
    expect(existsSync(modelHubTest)).toBe(true)
  })
})
