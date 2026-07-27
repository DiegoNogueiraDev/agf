/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attemptImplementation, buildRetryPrompt, buildInitialPrompt } from '../../core/autonomy/implement-attempt.js'
import type { AttemptDeps, AttemptOptions } from '../../core/autonomy/implement-attempt.js'

// Stub out heavy I/O side-effects — units under test are the retry/compress/effort logic.
vi.mock('../../core/tool-compress/index.js', () => ({
  compressToolOutput: vi.fn().mockImplementation((raw: string) => {
    if (raw.length < 500) return { value: raw, filter: null, saved: 0 }
    const compressed = raw.slice(0, Math.floor(raw.length * 0.4))
    return { value: compressed, filter: 'mock-dedup', saved: raw.length - compressed.length }
  }),
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

// Import the mocked function to assert call counts.
const { recordLeverEvent } = await import('../../core/economy/economy-lever-ledger.js')

function makeNode(id = 'node_test', title = 'Test task') {
  return { id, title }
}

// Minimal valid plan: at least one edit required by parseImplementationPlan.
const VALID_PLAN = '```json\n{"edits":[{"path":"x.ts","oldString":"","newString":"// x"}]}\n```'

function makeDeps(overrides: Partial<AttemptDeps> = {}): AttemptDeps {
  return {
    generate: vi.fn().mockResolvedValue(VALID_PLAN),
    execute: vi.fn().mockResolvedValue({ testPassed: true, testOutput: 'all pass' }),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeOpts(overrides: Partial<AttemptOptions> = {}): AttemptOptions {
  return {
    node: makeNode(),
    maxAttempts: 3,
    ...overrides,
  }
}

describe('attemptImplementation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── AC1: output > 10k → retry prompt contains truncation markers ────────────

  describe('compression + truncation on large failure output (AC1)', () => {
    it('includes …[omitido N chars]… marker in retry prompt when test output exceeds maxFeedbackChars', async () => {
      // 10k chars: mock compresses to 40% = 4000 chars, still > 2500 maxFeedbackChars → truncation
      const largeOutput = 'x'.repeat(10_000)
      const capturedPrompts: string[] = []

      const deps = makeDeps({
        generate: vi.fn().mockImplementation(async (prompt: string) => {
          capturedPrompts.push(prompt)
          return VALID_PLAN
        }),
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: largeOutput })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      const result = await attemptImplementation(deps, makeOpts({ maxAttempts: 2 }))

      expect(result.success).toBe(true)
      // First call = initial prompt, second call = retry prompt with compression + truncation
      expect(capturedPrompts).toHaveLength(2)
      expect(capturedPrompts[1]).toContain('…[omitido')
    })

    it('populates compressionStats when output is large enough for compression', async () => {
      const largeOutput = 'x'.repeat(10_000)

      const deps = makeDeps({
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: largeOutput })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      const result = await attemptImplementation(deps, makeOpts({ maxAttempts: 2 }))

      expect(result.compressionStats).toBeDefined()
      expect(result.compressionStats!.length).toBeGreaterThan(0)
      expect(result.compressionStats![0].saved).toBeGreaterThan(0)
    })

    it('does not add truncation marker when test output is within maxFeedbackChars', async () => {
      const smallOutput = 'error: expected 1 got 2' // well under 2500
      let secondPrompt = ''

      const deps = makeDeps({
        generate: vi.fn().mockImplementation(async (prompt: string) => {
          secondPrompt = prompt
          return '```json\n{"edits":[]}\n```'
        }),
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: smallOutput })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      await attemptImplementation(deps, makeOpts({ maxAttempts: 2 }))

      expect(secondPrompt).not.toContain('…[omitido')
    })
  })

  // ─── AC2: effort routing — generate receives an effort parameter ─────────────

  describe('effort routing (AC2)', () => {
    it('passes a non-null effort to generate on first attempt', async () => {
      const deps = makeDeps()

      await attemptImplementation(deps, makeOpts())

      const [_prompt, effort] = (deps.generate as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(effort).toBeTruthy() // 'low' for implement attempt 1 without reuse
    })

    it('passes low effort on first attempt without reuse', async () => {
      const deps = makeDeps()

      await attemptImplementation(deps, makeOpts())

      const [_prompt, effort] = (deps.generate as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(effort).toBe('low')
    })

    it('passes minimal effort when exact reuse is available', async () => {
      const deps = makeDeps({
        execute: vi.fn().mockResolvedValue({ testPassed: true, testOutput: 'pass' }),
      })
      const opts = makeOpts({
        reuse: {
          kind: 'exact',
          sourceId: 'node_source',
          edits: [{ path: 'a.ts', oldString: 'old', newString: 'new' }],
          score: 1.0,
        },
      })

      await attemptImplementation(deps, opts)

      // Exact reuse → execute without calling generate
      expect(deps.generate).not.toHaveBeenCalled()
    })
  })

  // ─── AC3: economy lever ledger called when economyDb provided ────────────────

  describe('economy lever ledger recording (AC3)', () => {
    it('calls recordLeverEvent when economyDb is provided and compression is applied', async () => {
      const largeOutput = 'x'.repeat(6000) // triggers L2 compression

      // Minimal mock of Database.Database interface required by recordLeverEvent.
      const mockDb = {} as import('better-sqlite3').Database

      const deps = makeDeps({
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: largeOutput })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      await attemptImplementation(deps, makeOpts({ maxAttempts: 2, economyDb: mockDb }))

      expect(recordLeverEvent).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          lever: 'compress',
          nodeId: 'node_test',
          saved: expect.any(Number),
        }),
      )
    })

    it('does not call recordLeverEvent when economyDb is absent', async () => {
      const largeOutput = 'x'.repeat(6000)

      const deps = makeDeps({
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: largeOutput })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      await attemptImplementation(deps, makeOpts({ maxAttempts: 2 })) // no economyDb

      expect(recordLeverEvent).not.toHaveBeenCalled()
    })
  })

  // ─── AC4: lessons-store gap ───────────────────────────────────────────────────

  describe('lessons-store gap (AC4 — not yet wired in implement-attempt.ts)', () => {
    it('AttemptOutcome does not include lesson data (Task 3.1 wires lessons-store)', async () => {
      const deps = makeDeps({
        execute: vi.fn().mockResolvedValue({ testPassed: false, testOutput: 'DoD: has_testable_ac failed' }),
      })

      const result = await attemptImplementation(deps, makeOpts({ maxAttempts: 1 }))

      expect(result.success).toBe(false)
      // No lesson field in the outcome — lessons-store is connected in Task 3.1
      expect(result).not.toHaveProperty('lesson')
    })
  })

  // ─── Happy path and edge cases ───────────────────────────────────────────────

  describe('happy path', () => {
    it('returns success:true on first attempt when tests pass', async () => {
      const deps = makeDeps()

      const result = await attemptImplementation(deps, makeOpts())

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(deps.generate).toHaveBeenCalledTimes(1)
    })

    it('retries up to maxAttempts before returning success:false', async () => {
      const deps = makeDeps({
        execute: vi.fn().mockResolvedValue({ testPassed: false, testOutput: 'fail' }),
      })

      const result = await attemptImplementation(deps, makeOpts({ maxAttempts: 3 }))

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(3)
      expect(deps.generate).toHaveBeenCalledTimes(3)
    })

    it('returns success:true on second attempt after first fails', async () => {
      const deps = makeDeps({
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: 'fail' })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      const result = await attemptImplementation(deps, makeOpts({ maxAttempts: 3 }))

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
    })

    it('returns success:false immediately for permanent LLM error without retrying', async () => {
      const authError = new Error('401 Unauthorized')
      ;(authError as Error & { status: number }).status = 401

      const deps = makeDeps({
        generate: vi.fn().mockRejectedValue(authError),
      })

      const result = await attemptImplementation(deps, makeOpts({ maxAttempts: 3 }))

      expect(result.success).toBe(false)
      expect(deps.generate).toHaveBeenCalledTimes(1) // no retry for auth error
    })

    it('uses exact reuse without calling generate when reuse succeeds', async () => {
      const deps = makeDeps({
        execute: vi.fn().mockResolvedValue({ testPassed: true, testOutput: 'pass' }),
      })

      const result = await attemptImplementation(
        deps,
        makeOpts({
          reuse: {
            kind: 'exact',
            sourceId: 'node_src',
            edits: [{ path: 'x.ts', oldString: 'a', newString: 'b' }],
            score: 1.0,
          },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.reused).toBe('exact')
      expect(deps.generate).not.toHaveBeenCalled()
    })

    it('falls back to generation when exact reuse tests fail', async () => {
      const deps = makeDeps({
        execute: vi
          .fn()
          .mockResolvedValueOnce({ testPassed: false, testOutput: 'reuse fail' })
          .mockResolvedValueOnce({ testPassed: true, testOutput: 'pass' }),
      })

      const result = await attemptImplementation(
        deps,
        makeOpts({
          maxAttempts: 2,
          reuse: {
            kind: 'exact',
            sourceId: 'src',
            edits: [{ path: 'x.ts', oldString: 'a', newString: 'b' }],
            score: 1.0,
          },
        }),
      )

      expect(result.success).toBe(true)
      expect(deps.generate).toHaveBeenCalledTimes(1) // generation used as fallback
    })
  })

  // ─── buildRetryPrompt unit ───────────────────────────────────────────────────

  describe('buildRetryPrompt', () => {
    it('includes task title in the retry prompt', () => {
      const node = makeNode('node_1', 'Fix the widget')
      const failure = { testPassed: false as const, testOutput: 'error: expected true got false' }

      const prompt = buildRetryPrompt(node, failure, 2500)

      expect(prompt).toContain('Fix the widget')
    })

    it('truncates output that exceeds maxFeedbackChars with …[omitido marker', () => {
      const node = makeNode()
      const longOutput = 'a'.repeat(5000)
      const failure = { testPassed: false as const, testOutput: longOutput }

      const prompt = buildRetryPrompt(node, failure, 2500)

      expect(prompt).toContain('…[omitido')
    })

    it('preserves output within maxFeedbackChars without truncation', () => {
      const node = makeNode()
      const shortOutput = 'Expected 1 got 2'
      const failure = { testPassed: false as const, testOutput: shortOutput }

      const prompt = buildRetryPrompt(node, failure, 2500)

      expect(prompt).toContain('Expected 1 got 2')
      expect(prompt).not.toContain('…[omitido')
    })
  })

  // ─── buildInitialPrompt unit ─────────────────────────────────────────────────

  describe('buildInitialPrompt', () => {
    it('includes node title in the initial prompt', () => {
      const prompt = buildInitialPrompt(makeNode('n1', 'Add user endpoint'), {})
      expect(prompt).toContain('Add user endpoint')
    })

    it('includes repoMap context when provided', () => {
      const prompt = buildInitialPrompt(makeNode(), { repoMap: 'src/index.ts\nsrc/utils.ts' })
      expect(prompt).toContain('src/index.ts')
    })

    it('includes flowContext when provided', () => {
      const prompt = buildInitialPrompt(makeNode(), { flowContext: 'Priority: high' })
      expect(prompt).toContain('Priority: high')
    })
  })
})
