/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.6 AC coverage: metrics-cmd.ts CLI tests
 *
 * AC1: GIVEN ledger with 3 tasks WHEN agf metrics
 *      THEN output includes total_tokens, total_cost_usd, tasks_completed
 * AC2: GIVEN --session flag WHEN agf metrics --session <id>
 *      THEN filters current session, bySession: []
 * AC3: GIVEN --economy-report WHEN agf metrics --economy-report
 *      THEN lever breakdown in output
 * AC4: coverage >= 90% branch coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────

vi.mock('../cli/open-store.js', () => ({
  openStoreOrFail: vi.fn(),
}))

vi.mock('../core/observability/llm-call-ledger.js', () => ({
  summarizeLedger: vi.fn(),
  summarizeConductorCost: vi.fn(),
}))

vi.mock('../core/observability/baseline.js', () => ({
  summarizeBaseline: vi.fn(),
  simulateProviders: vi.fn(),
}))

vi.mock('../core/economy/economy-lever-ledger.js', () => ({
  formatEconomyReport: vi.fn(),
  summarizeByLever: vi.fn(),
}))

vi.mock('../core/store/episodic-outcomes-store.js', () => ({
  successfulNodeIds: vi.fn(),
}))

vi.mock('../core/economy/savings-tracker.js', () => ({
  getCumulativeSavings: vi.fn(),
}))

vi.mock('../core/observability/context-scorecard.js', () => ({
  buildContextScorecard: vi.fn(() => ({
    resolveRate: 0,
    avgTokensResolved: 0,
    avgTokensFailed: 0,
    totalTrackedNodes: 0,
    resolvedNodes: 0,
  })),
}))

vi.mock('../core/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { metricsCommand } from '../cli/commands/metrics-cmd.js'
import { openStoreOrFail } from '../cli/open-store.js'
import { summarizeLedger, summarizeConductorCost } from '../core/observability/llm-call-ledger.js'
import { summarizeBaseline, simulateProviders } from '../core/observability/baseline.js'
import { formatEconomyReport, summarizeByLever } from '../core/economy/economy-lever-ledger.js'
import { successfulNodeIds } from '../core/store/episodic-outcomes-store.js'
import { getCumulativeSavings } from '../core/economy/savings-tracker.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_DIR = '/fake-project'
const FAKE_DB = {} as Database.Database

function makeDefaultSummary() {
  return {
    totals: {
      calls: 10,
      tokensIn: 5000,
      tokensOut: 2000,
      cachedTokensIn: 500,
      reasoningTokens: 0,
      total: 7000,
      costUsd: 0.042,
    },
    byTask: [
      { nodeId: 'task_1', tokensIn: 2000, tokensOut: 800, total: 2800, costUsd: 0.017 },
      { nodeId: 'task_2', tokensIn: 1500, tokensOut: 600, total: 2100, costUsd: 0.013 },
      { nodeId: 'task_3', tokensIn: 1500, tokensOut: 600, total: 2100, costUsd: 0.012 },
    ],
    bySession: [{ sessionId: 'sess_abc', total: 7000, costUsd: 0.042, calls: 10 }],
    avgTokensPerTask: 2333,
  }
}

function makeDefaultLevers() {
  return [{ lever: 'ncd_dedup', totalSaved: 300, count: 3 }]
}

function parseEnvelope(lines: string[]): { ok: boolean; data?: unknown; code?: string } {
  const all = lines.join('').trim()
  const candidates = all.split('\n').filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  if (!candidates.length) throw new Error('No JSON envelope found in stdout')
  return JSON.parse(candidates[candidates.length - 1])
}

// ── Test setup ────────────────────────────────────────────────────────────────

let captured: string[]
let mockClose: ReturnType<typeof vi.fn>

beforeEach(() => {
  captured = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(String(chunk))
    return true
  })

  mockClose = vi.fn()
  vi.mocked(openStoreOrFail).mockReturnValue({
    getDb: () => FAKE_DB,
    getProjectSetting: () => null, // cognitive_debt lever resolves OFF (default)
    close: mockClose,
  } as unknown as ReturnType<typeof openStoreOrFail>)

  vi.mocked(summarizeLedger).mockReturnValue(makeDefaultSummary())
  vi.mocked(summarizeConductorCost).mockReturnValue({
    source: 'self_reported',
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    byNode: [],
    bySession: [],
  })
  vi.mocked(summarizeByLever).mockReturnValue(makeDefaultLevers())
  vi.mocked(successfulNodeIds).mockReturnValue(new Set(['task_1', 'task_2']))
  vi.mocked(getCumulativeSavings).mockReturnValue({ delegateEconomy: undefined } as ReturnType<
    typeof getCumulativeSavings
  >)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function run(args: string[] = []): Promise<ReturnType<typeof parseEnvelope>> {
  const prevExit = process.exitCode
  await metricsCommand().parseAsync(['--dir', FAKE_DIR, ...args], { from: 'user' })
  process.exitCode = prevExit
  return parseEnvelope(captured)
}

// ── cognitive-debt lever (opt-in) ─────────────────────────────────────────────

describe('cognitive_debt lever', () => {
  it('omits cognitiveDebt by default (lever OFF)', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['cognitiveDebt']).toBeUndefined()
  })

  it('surfaces cognitiveDebt when the lever is enabled', async () => {
    vi.mocked(openStoreOrFail).mockReturnValue({
      getDb: () => FAKE_DB,
      getProjectSetting: (key: string) =>
        key === 'economy_levers_config' ? JSON.stringify({ cognitive_debt: { enabled: true } }) : null,
      getAllNodes: () => [
        { id: 'task_1', type: 'task', status: 'done' },
        { id: 'task_2', type: 'task', status: 'done' },
        { id: 'task_3', type: 'task', status: 'done' },
        { id: 'task_4', type: 'task', status: 'done' },
      ],
      close: mockClose,
    } as unknown as ReturnType<typeof openStoreOrFail>)

    const env = await run()
    const data = env.data as Record<string, unknown>
    const debt = data['cognitiveDebt'] as Record<string, unknown>
    expect(debt).toBeDefined()
    expect(debt['llmAssistedTasks']).toBe(3)
    expect(debt['totalTasks']).toBe(4)
    expect(debt['relianceRatio']).toBeCloseTo(0.75, 5)
    expect(debt['level']).toBe('high')
  })
})

// ── AC1: Default path ─────────────────────────────────────────────────────────

describe('AC1: default output includes totals, task count, and cost fields', () => {
  it('output.ok is true on default run', async () => {
    const env = await run()
    expect(env.ok).toBe(true)
  })

  it('includes totals with total field (AC1: total_tokens)', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    const totals = data['totals'] as Record<string, unknown>
    expect(typeof totals['total']).toBe('number')
    expect(totals['total']).toBe(7000)
  })

  it('includes totals.costUsd (AC1: total_cost_usd)', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    const totals = data['totals'] as Record<string, unknown>
    expect(totals['costUsd']).toBe(0.042)
  })

  it('includes taskCount (AC1: tasks_completed)', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['taskCount']).toBe(3)
  })

  it('includes byTask limited to top N', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    const byTask = data['byTask'] as unknown[]
    expect(Array.isArray(byTask)).toBe(true)
    expect(byTask.length).toBeLessThanOrEqual(10)
  })

  it('includes succeeded count from successfulNodeIds', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    // task_1 and task_2 are in successNodes → succeeded = 2
    expect(data['succeeded']).toBe(2)
  })

  it('includes costPerSuccess when succeeded > 0', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    const cost = data['costPerSuccess'] as number
    expect(cost).toBeCloseTo(0.042 / 2)
  })

  it('costPerSuccess is null when no tasks succeeded', async () => {
    vi.mocked(successfulNodeIds).mockReturnValue(new Set())
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['costPerSuccess']).toBeNull()
  })

  it('includes tokensSaved from lever reduction', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['tokensSaved']).toBe(300) // 300 from ncd_dedup
  })

  it('includes levers array', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    const levers = data['levers'] as Array<Record<string, unknown>>
    expect(Array.isArray(levers)).toBe(true)
    expect(levers[0]?.['lever']).toBe('ncd_dedup')
  })

  it('passes dir to openStoreOrFail', async () => {
    await run()
    expect(vi.mocked(openStoreOrFail)).toHaveBeenCalledWith(FAKE_DIR, { requireExisting: true })
  })

  it('store.close() is called after command', async () => {
    await run()
    expect(mockClose).toHaveBeenCalledOnce()
  })
})

// ── AC2: --session flag ───────────────────────────────────────────────────────

describe('AC2: --session flag filters to current session', () => {
  it('passes session id to summarizeLedger', async () => {
    await run(['--session', 'sess_abc'])
    expect(vi.mocked(summarizeLedger)).toHaveBeenCalledWith(FAKE_DB, { sessionId: 'sess_abc' })
  })

  it('passes session id to summarizeByLever', async () => {
    await run(['--session', 'sess_abc'])
    expect(vi.mocked(summarizeByLever)).toHaveBeenCalledWith(FAKE_DB, 'sess_abc')
  })

  it('bySession is [] when --session is provided (AC2)', async () => {
    const env = await run(['--session', 'sess_abc'])
    const data = env.data as Record<string, unknown>
    expect(data['bySession']).toEqual([])
  })

  it('bySession is populated when no --session flag', async () => {
    const env = await run()
    const data = env.data as Record<string, unknown>
    const bySession = data['bySession'] as unknown[]
    expect(bySession.length).toBeGreaterThan(0)
  })
})

// ── AC3: --economy-report flag ────────────────────────────────────────────────

describe('AC3: --economy-report shows lever breakdown', () => {
  it('calls formatEconomyReport (AC3)', async () => {
    vi.mocked(formatEconomyReport).mockReturnValue('lever report text')
    const env = await run(['--economy-report'])
    expect(vi.mocked(formatEconomyReport)).toHaveBeenCalledWith(FAKE_DB)
    expect(env.ok).toBe(true)
  })

  it('output includes report field from formatEconomyReport', async () => {
    vi.mocked(formatEconomyReport).mockReturnValue('formatted report')
    const env = await run(['--economy-report'])
    const data = env.data as Record<string, unknown>
    expect(data['report']).toBe('formatted report')
  })

  it('note is undefined when no delegateEconomy', async () => {
    vi.mocked(formatEconomyReport).mockReturnValue('report')
    vi.mocked(getCumulativeSavings).mockReturnValue({ delegateEconomy: undefined } as ReturnType<
      typeof getCumulativeSavings
    >)
    const env = await run(['--economy-report'])
    const data = env.data as Record<string, unknown>
    expect(data['note']).toBeUndefined()
  })

  it('note is set when delegateEconomy is present', async () => {
    vi.mocked(formatEconomyReport).mockReturnValue('report')
    vi.mocked(getCumulativeSavings).mockReturnValue({
      delegateEconomy: { cmdCalls: 5, delegateSaved: 1000, savedPct: 30, avgTokPerCmd: 200, estimatedTokens: 400 },
    } as ReturnType<typeof getCumulativeSavings>)
    const env = await run(['--economy-report'])
    const data = env.data as Record<string, unknown>
    expect(typeof data['note']).toBe('string')
    expect((data['note'] as string).length).toBeGreaterThan(0)
  })

  it('store.close() called in economy-report path', async () => {
    vi.mocked(formatEconomyReport).mockReturnValue('r')
    await run(['--economy-report'])
    expect(mockClose).toHaveBeenCalledOnce()
  })
})

// ── --baseline flag ───────────────────────────────────────────────────────────

describe('--baseline flag', () => {
  it('calls summarizeBaseline with db', async () => {
    vi.mocked(summarizeBaseline).mockReturnValue({ baseline: 'data' } as ReturnType<typeof summarizeBaseline>)
    await run(['--baseline'])
    expect(vi.mocked(summarizeBaseline)).toHaveBeenCalledWith(FAKE_DB, { sessionId: undefined })
  })

  it('output contains baseline result', async () => {
    vi.mocked(summarizeBaseline).mockReturnValue({ verdict: 'pass' } as ReturnType<typeof summarizeBaseline>)
    const env = await run(['--baseline'])
    expect(env.ok).toBe(true)
    const data = env.data as Record<string, unknown>
    expect(data['verdict']).toBe('pass')
  })

  it('passes session to summarizeBaseline when --session provided', async () => {
    vi.mocked(summarizeBaseline).mockReturnValue({} as ReturnType<typeof summarizeBaseline>)
    await run(['--baseline', '--session', 'sess_xyz'])
    expect(vi.mocked(summarizeBaseline)).toHaveBeenCalledWith(FAKE_DB, { sessionId: 'sess_xyz' })
  })

  it('store.close() called in baseline path', async () => {
    vi.mocked(summarizeBaseline).mockReturnValue({} as ReturnType<typeof summarizeBaseline>)
    await run(['--baseline'])
    expect(mockClose).toHaveBeenCalledOnce()
  })
})

// ── --simulate flag ───────────────────────────────────────────────────────────

describe('--simulate flag', () => {
  it('calls simulateProviders with totals from summarizeLedger', async () => {
    vi.mocked(simulateProviders).mockReturnValue({ simulation: true } as ReturnType<typeof simulateProviders>)
    await run(['--simulate'])
    expect(vi.mocked(simulateProviders)).toHaveBeenCalledWith(5000, 500, 2000)
  })

  it('output contains simulation result', async () => {
    vi.mocked(simulateProviders).mockReturnValue({ simResult: 'ok' } as ReturnType<typeof simulateProviders>)
    const env = await run(['--simulate'])
    expect(env.ok).toBe(true)
    const data = env.data as Record<string, unknown>
    expect(data['simResult']).toBe('ok')
  })

  it('store.close() called in simulate path', async () => {
    vi.mocked(simulateProviders).mockReturnValue({} as ReturnType<typeof simulateProviders>)
    await run(['--simulate'])
    expect(mockClose).toHaveBeenCalledOnce()
  })
})

// ── Delegate economy mode ─────────────────────────────────────────────────────

describe('delegate economy detection', () => {
  it('delegateNote added when total=0 and cmdCalls > 0', async () => {
    vi.mocked(summarizeLedger).mockReturnValue({
      ...makeDefaultSummary(),
      totals: { ...makeDefaultSummary().totals, total: 0 },
    })
    vi.mocked(getCumulativeSavings).mockReturnValue({
      delegateEconomy: { cmdCalls: 10, delegateSaved: 500, savedPct: 40, avgTokPerCmd: 100, estimatedTokens: 750 },
    } as ReturnType<typeof getCumulativeSavings>)
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(typeof data['delegateNote']).toBe('string')
  })

  it('no delegateNote when total > 0 even with cmdCalls > 0', async () => {
    vi.mocked(getCumulativeSavings).mockReturnValue({
      delegateEconomy: { cmdCalls: 10, delegateSaved: 500, savedPct: 40, avgTokPerCmd: 100, estimatedTokens: 750 },
    } as ReturnType<typeof getCumulativeSavings>)
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['delegateNote']).toBeUndefined()
  })

  it('no delegateNote when total=0 but cmdCalls=0', async () => {
    vi.mocked(summarizeLedger).mockReturnValue({
      ...makeDefaultSummary(),
      totals: { ...makeDefaultSummary().totals, total: 0 },
    })
    vi.mocked(getCumulativeSavings).mockReturnValue({
      delegateEconomy: undefined,
    } as ReturnType<typeof getCumulativeSavings>)
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['delegateNote']).toBeUndefined()
  })

  it('delegateEconomy included in output when present', async () => {
    const de = { cmdCalls: 3, delegateSaved: 200, savedPct: 25, avgTokPerCmd: 150, estimatedTokens: 600 }
    vi.mocked(getCumulativeSavings).mockReturnValue({
      delegateEconomy: de,
    } as ReturnType<typeof getCumulativeSavings>)
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect(data['delegateEconomy']).toEqual(de)
  })

  it('delegateEconomy NOT in output when undefined', async () => {
    vi.mocked(getCumulativeSavings).mockReturnValue({
      delegateEconomy: undefined,
    } as ReturnType<typeof getCumulativeSavings>)
    const env = await run()
    const data = env.data as Record<string, unknown>
    expect('delegateEconomy' in data).toBe(false)
  })
})

// ── store.close() always called ───────────────────────────────────────────────

describe('store lifecycle', () => {
  it('close is called even if close is the last thing (finally block)', async () => {
    await run()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})

describe('consumer-side cost surfaced separately (node_a6314d7eef0a)', () => {
  it('AC1: default output carries consumerCost with the self_reported label + per-task/session tokens', async () => {
    vi.mocked(summarizeConductorCost).mockReturnValue({
      source: 'self_reported',
      calls: 1,
      tokensIn: 1200,
      tokensOut: 800,
      byNode: [{ nodeId: 'task_1', tokensIn: 1200, tokensOut: 800 }],
      bySession: [{ sessionId: 'sess_a', tokensIn: 1200, tokensOut: 800 }],
    })
    const env = await run()
    const data = env.data as Record<string, unknown>
    const consumer = data['consumerCost'] as Record<string, unknown>
    expect(consumer).toBeDefined()
    expect(consumer['source']).toBe('self_reported')
    expect(consumer['tokensIn']).toBe(1200)
    expect(consumer['tokensOut']).toBe(800)
    // Kept SEPARATE: consumerCost is its own labeled field, distinct from agf's own `totals`
    // (which in real delegate mode is 0; here the mock has its own numbers — the point is they
    // are never conflated).
    expect(consumer['tokensIn']).not.toBe((data['totals'] as Record<string, unknown>)['tokensIn'])
  })

  it('AC2: no self-reported rows → consumerCost is present with zeros, metrics does not break', async () => {
    const env = await run() // beforeEach mocks an empty conductor summary
    const data = env.data as Record<string, unknown>
    const consumer = data['consumerCost'] as Record<string, unknown>
    expect(env.ok).toBe(true)
    expect(consumer['calls']).toBe(0)
    expect(consumer['tokensIn']).toBe(0)
  })
})
