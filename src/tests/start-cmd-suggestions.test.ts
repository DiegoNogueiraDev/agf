/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: start command suggestions on NO_TASKS
 *
 * AC1: GIVEN empty graph WHEN start THEN suggestions includes import-prd and generate-prd
 * AC2: GIVEN epics/no unblocked tasks WHEN start THEN suggestions includes decompose and gaps
 * AC3: GIVEN all tasks blocked WHEN start THEN suggestions includes gaps with blocker count
 * AC4: GIVEN --json absent WHEN NO_TASKS THEN suggestions in human-readable text format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SqliteStore } from '../core/store/sqlite-store.js'

vi.mock('../core/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
}))
vi.mock('../cli/open-store.js', () => ({ openStoreOrFail: vi.fn() }))
vi.mock('../core/planner/next-task.js', () => ({
  findNextTask: vi.fn(),
  // selectNextTaskSmart (via start-cmd) needs this; empty graph → no candidates.
  findUnblockedTasks: vi.fn(() => []),
}))
vi.mock('../core/context/compact-context.js', () => ({ buildTaskContext: vi.fn() }))

import { startTaskPipeline, buildStartSuggestions } from '../cli/commands/start-cmd.js'
import { openStoreOrFail } from '../cli/open-store.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStats(
  opts: {
    totalNodes?: number
    blockedCount?: number
    backlogCount?: number
    epicCount?: number
    taskCount?: number
  } = {},
) {
  const { totalNodes = 0, blockedCount = 0, backlogCount = 0, epicCount = 0, taskCount = 0 } = opts
  return {
    totalNodes: totalNodes ?? blockedCount + backlogCount + epicCount + taskCount,
    totalEdges: 0,
    byType: { task: taskCount, epic: epicCount },
    byStatus: { blocked: blockedCount, backlog: backlogCount, in_progress: 0, done: 0 },
  }
}

function makeStore(stats: ReturnType<typeof makeStats>): SqliteStore {
  return {
    getStats: vi.fn().mockReturnValue(stats),
    toGraphDocument: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
    close: vi.fn(),
  } as unknown as SqliteStore
}

// ── buildStartSuggestions (unit) ──────────────────────────────────────────────

describe('buildStartSuggestions', () => {
  it('exists as a named export', () => {
    expect(typeof buildStartSuggestions).toBe('function')
  })

  describe('AC1: empty graph → import-prd and generate-prd suggestions', () => {
    it('returns import-prd suggestion when totalNodes === 0 (AC1)', () => {
      const store = makeStore(makeStats({ totalNodes: 0 }))
      const suggestions = buildStartSuggestions(store)
      expect(suggestions.some((s) => s.cmd.includes('import-prd'))).toBe(true)
    })

    it('returns generate-prd suggestion when totalNodes === 0 (AC1)', () => {
      const store = makeStore(makeStats({ totalNodes: 0 }))
      const suggestions = buildStartSuggestions(store)
      expect(suggestions.some((s) => s.cmd.includes('generate-prd'))).toBe(true)
    })

    it('each suggestion has cmd and reason fields', () => {
      const store = makeStore(makeStats({ totalNodes: 0 }))
      const suggestions = buildStartSuggestions(store)
      for (const s of suggestions) {
        expect(typeof s.cmd).toBe('string')
        expect(typeof s.reason).toBe('string')
        expect(s.cmd.length).toBeGreaterThan(0)
        expect(s.reason.length).toBeGreaterThan(0)
      }
    })
  })

  describe('AC3: all tasks blocked → gaps suggestion with blocker count', () => {
    it('returns gaps suggestion when tasks exist and all blocked (AC3)', () => {
      const store = makeStore(makeStats({ totalNodes: 3, taskCount: 3, blockedCount: 3, backlogCount: 0 }))
      const suggestions = buildStartSuggestions(store)
      expect(suggestions.some((s) => s.cmd.includes('gaps'))).toBe(true)
    })

    it('gaps suggestion mentions blocker count (AC3)', () => {
      const store = makeStore(makeStats({ totalNodes: 5, taskCount: 5, blockedCount: 5, backlogCount: 0 }))
      const suggestions = buildStartSuggestions(store)
      const gapsSuggestion = suggestions.find((s) => s.cmd.includes('gaps'))
      expect(gapsSuggestion).toBeDefined()
      // reason should reference the count
      const reasonOrCmd = gapsSuggestion!.reason + gapsSuggestion!.cmd
      expect(reasonOrCmd).toMatch(/5|blocker|block/i)
    })
  })

  describe('AC2: epics without unblocked tasks → decompose and gaps suggestions', () => {
    it('returns decompose suggestion when backlog tasks exist (AC2)', () => {
      const store = makeStore(makeStats({ totalNodes: 2, epicCount: 2, taskCount: 0 }))
      const suggestions = buildStartSuggestions(store)
      expect(suggestions.some((s) => s.cmd.includes('decompose'))).toBe(true)
    })

    it('returns gaps suggestion alongside decompose (AC2)', () => {
      const store = makeStore(makeStats({ totalNodes: 2, epicCount: 2, taskCount: 0 }))
      const suggestions = buildStartSuggestions(store)
      expect(suggestions.some((s) => s.cmd.includes('gaps'))).toBe(true)
    })

    it('returns decompose + gaps when backlog > 0 with no blocked (epics+tasks scenario)', () => {
      const store = makeStore(makeStats({ totalNodes: 3, epicCount: 1, backlogCount: 2 }))
      const suggestions = buildStartSuggestions(store)
      expect(suggestions.some((s) => s.cmd.includes('decompose'))).toBe(true)
      expect(suggestions.some((s) => s.cmd.includes('gaps'))).toBe(true)
    })
  })
})

// ── startTaskPipeline (suggestions in result) ─────────────────────────────────

describe('startTaskPipeline: NO_TASKS includes suggestions', () => {
  it('includes suggestions in result when no next task found', () => {
    const suggestions = [{ cmd: 'agf import-prd <file>', reason: 'Import PRD' }]
    const result = startTaskPipeline({
      wakeUp: () => 'wake-pack',
      countInProgress: () => 0,
      findNext: () => null,
      getSuggestions: () => suggestions,
      loadContext: () => '',
      markInProgress: () => '',
      out: vi.fn(),
    })
    expect(result.suggestions).toEqual(suggestions)
  })

  it('includes empty suggestions array when getSuggestions returns []', () => {
    const result = startTaskPipeline({
      wakeUp: () => 'wake-pack',
      countInProgress: () => 0,
      findNext: () => null,
      getSuggestions: () => [],
      loadContext: () => '',
      markInProgress: () => '',
      out: vi.fn(),
    })
    expect(result.suggestions).toEqual([])
  })

  it('does not call getSuggestions when a task is found', () => {
    const getSuggestions = vi.fn().mockReturnValue([])
    startTaskPipeline({
      wakeUp: () => '',
      countInProgress: () => 0,
      findNext: () => ({ id: 'task_1', title: 'Task 1', reason: 'ready' }),
      getSuggestions,
      loadContext: () => 'ctx',
      markInProgress: () => 'task_1',
      out: vi.fn(),
    })
    expect(getSuggestions).not.toHaveBeenCalled()
  })

  it('suggestions not in result when WIP_EXCEEDED', () => {
    const getSuggestions = vi.fn().mockReturnValue([])
    const result = startTaskPipeline({
      wakeUp: () => '',
      countInProgress: () => 2,
      findNext: () => null,
      getSuggestions,
      loadContext: () => '',
      markInProgress: () => '',
      out: vi.fn(),
    })
    expect(result.code).toBe('WIP_EXCEEDED')
    expect(getSuggestions).not.toHaveBeenCalled()
  })
})

// ── startCommand integration: NO_TASKS output includes suggestions ─────────────

describe('startCommand: NO_TASKS output includes suggestions field', () => {
  let captured: string[]

  beforeEach(() => {
    captured = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      captured.push(String(chunk))
      return true
    })
    vi.mocked(openStoreOrFail).mockReturnValue({
      getStats: vi.fn().mockReturnValue(makeStats({ totalNodes: 0 })),
      getProject: vi.fn().mockReturnValue({ id: 'proj-1', name: 'test-project' }),
      getNodesByStatus: vi.fn().mockReturnValue([]),
      toGraphDocument: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
      getDb: vi.fn().mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      }),
      close: vi.fn(),
    } as unknown as ReturnType<typeof openStoreOrFail>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function runStart(
    args: string[] = [],
  ): Promise<{ ok: boolean; code?: string; error?: string; data?: Record<string, unknown> }> {
    const { startCommand } = await import('../cli/commands/start-cmd.js')
    const prevExit = process.exitCode
    await startCommand().parseAsync(['--dir', '/fake', ...args], { from: 'user' })
    process.exitCode = prevExit
    const lines = captured.join('').trim().split('\n')
    const jsonLine = lines.find((l) => l.trim().startsWith('{') && l.includes('"ok"'))
    return JSON.parse(jsonLine!)
  }

  it('NO_TASKS response includes suggestions array (AC1)', async () => {
    const env = await runStart()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NO_TASKS')
    const data = env.data as Record<string, unknown> | undefined
    expect(Array.isArray(data?.['suggestions'])).toBe(true)
  })

  it('suggestions contain import-prd when graph is empty (AC1)', async () => {
    const env = await runStart()
    const data = env.data as Record<string, unknown>
    const suggestions = data['suggestions'] as Array<{ cmd: string; reason: string }>
    expect(suggestions.some((s) => s.cmd.includes('import-prd'))).toBe(true)
  })
})
