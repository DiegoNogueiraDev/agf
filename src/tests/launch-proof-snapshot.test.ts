/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage for node_b59f88d58437 (WIRE: TUI /savings + dashboard proof surface).
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { buildAsyncPort } from '../tui/launch.js'
import { runReadCommand } from '../tui/dispatch-ports.js'
import { parseCommand } from '../tui/dispatch-parsing.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-launch-proof')
  return store
}

describe('CommandPort.savings — proof surface wiring', () => {
  it("GIVEN store with 1 command and 1 lever WHEN /savings runs THEN output contains 'command' and 'scaffold'", async () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      caller: 'agf next',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      inputTokens: 1000,
      outputTokens: 100,
      cachedInputTokens: 200,
    })
    recordLeverEvent(store.getDb(), {
      sessionId: 's1',
      lever: 'scaffold_recovery',
      tokensBefore: 300,
      tokensAfter: 120,
      saved: 180,
      accepted: true,
      gateOutcome: 'accepted',
    })

    const port = buildAsyncPort(store, process.cwd())
    const output = (await port.savings()).toLowerCase()
    expect(output).toContain('command')
    expect(output).toContain('scaffold')
  })

  it("GIVEN an empty store WHEN /savings runs THEN it doesn't crash and shows 'sem dados'", async () => {
    const store = freshStore()
    const port = buildAsyncPort(store, process.cwd())
    const output = await port.savings()
    expect(output).toContain('sem dados')
  })
})

describe('/token-budget — (est.) marker for extrapolated baseline', () => {
  function fakePort(baselineExtrapolated: boolean) {
    return {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      metrics: () => ({ total: 100, costUsd: 0.01, calls: 1 }),
      proofSnapshot: () => ({
        totals: {
          totalCommands: 0,
          inputTokens: 0,
          outputTokens: 0,
          tokensSaved: 0,
          savingsRate: 0,
          totalExecMs: 0,
          avgExecMs: 0,
          baselineExtrapolated,
        },
        byCommand: [],
        levers: [],
        scaffoldReuse: { recovered: 0, generated: 0, tokensSaved: 0, savingsRatio: 0 },
      }),
      cacheStats: () => ({
        sessionHits: 0,
        sessionMisses: 0,
        sessionSize: 0,
        sessionCapacity: 128,
        sessionEvictions: 0,
        toolCacheHits: 0,
        toolCacheMisses: 0,
        toolCacheInvalidations: 0,
        tokensSavedEstimate: 0,
        costAvoidedUsd: 0,
      }),
      getPhase: () => 'IMPLEMENT',
      getModel: () => 'haiku',
      listSkills: () => [],
      getSkill: () => undefined,
      principles: () => [],
      providers: () => [],
      quality: () => ({ testScore: 0, logScore: 0, passed: false, totalModules: 0, darkModules: [] }),
      getGraphNodes: () => [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it("GIVEN baselineExtrapolated=true WHEN /token-budget runs THEN output contains '(est.)'", () => {
    const output = runReadCommand(fakePort(true), parseCommand('/token-budget'))
    expect(output).toContain('(est.)')
  })

  it('GIVEN baselineExtrapolated=false WHEN /token-budget runs THEN output has no (est.) marker', () => {
    const output = runReadCommand(fakePort(false), parseCommand('/token-budget'))
    expect(output).not.toContain('(est.)')
  })
})
