/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/savings-cmd.ts — savingsCommand factory wiring.
 * Expanded (node_5333f82c6741) to also surface buildProofSnapshot's
 * byCommand + scaffoldReuse fields on the default (no-flag) path, and the
 * '(est.)' marker when the delegate-economy baseline was extrapolated.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { recordCommandInvocation } from '../core/observability/command-ledger.js'
import { savingsCommand } from '../cli/commands/savings-cmd.js'
import { sessionSavingsReceipt } from '../core/economy/savings-tracker.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('savingsCommand', () => {
  it('returns a Command instance', () => {
    const cmd = savingsCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = savingsCommand()
    expect(cmd.name()).toBe('savings')
  })

  it('has a non-empty description', () => {
    const cmd = savingsCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

describe('agf savings — proof surface (by-command + scaffold)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-savings-proof-'))
    const store = SqliteStore.open(dir)
    store.initProject('savings-proof-test')
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
      lever: 'rag_out_recovery',
      tokensBefore: 300,
      tokensAfter: 120,
      saved: 180,
      accepted: true,
      gateOutcome: 'accepted',
    })
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it("GIVEN store with 2 commands and a recovery lever WHEN agf savings runs THEN output has a 'command' column and a 'scaffold' row", async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await savingsCommand().parseAsync(['-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    const data = envelope.data as Record<string, unknown>
    expect(Array.isArray(data.byCommand)).toBe(true)
    expect((data.byCommand as Array<Record<string, unknown>>)[0].command).toBe('agf next')
    expect((data.scaffoldReuse as Record<string, unknown>).recovered).toBeGreaterThanOrEqual(1)
  })

  it('GIVEN --by-command WHEN agf savings --by-command runs THEN each row has a lowSavings boolean', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await savingsCommand().parseAsync(['--by-command', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    const rows = (envelope.data as Record<string, unknown>).byCommand as Array<Record<string, unknown>>
    expect(rows.length).toBeGreaterThan(0)
    expect(typeof rows[0].lowSavings).toBe('boolean')
  })

  it("GIVEN baselineExtrapolated=true (partial graph-export data) WHEN agf savings runs THEN stdout contains '(est.)'", async () => {
    // callsWithGraphData (1) < commands.calls (2) -> savings-tracker.ts extrapolates the baseline.
    const seedStore = SqliteStore.open(dir)
    recordCommandInvocation(seedStore.getDb(), {
      command: 'agf next',
      inputBytes: 100,
      outputBytes: 50,
      cached: false,
      durationMs: 10,
      graphExportBytes: 400,
    })
    recordCommandInvocation(seedStore.getDb(), {
      command: 'agf next',
      inputBytes: 100,
      outputBytes: 50,
      cached: false,
      durationMs: 10,
    })
    seedStore.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await savingsCommand().parseAsync(['-d', dir], { from: 'user' })
    spy.mockRestore()

    expect(out.join('')).toContain('(est.)')
  })
})

describe('agf savings --session — per-session receipt (node_c89453d19efd)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-savings-sess-'))
    const s = SqliteStore.open(dir)
    s.initProject('savings-sess')
    s.close()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  function seed(sessionId: string, lever: string, saved: number): void {
    const s = SqliteStore.open(dir)
    recordLeverEvent(s.getDb(), {
      sessionId,
      lever,
      tokensBefore: saved * 2,
      tokensAfter: saved,
      saved,
      accepted: true,
      gateOutcome: 'accepted',
    })
    s.close()
  }

  it('AC1: sums saved>0 per lever for the given session, excluding other sessions', () => {
    seed('sess-A', 'ncd_dedup', 100)
    seed('sess-A', 'forage_stop', 50)
    seed('sess-B', 'ncd_dedup', 999)
    const s = SqliteStore.open(dir)
    const receipt = sessionSavingsReceipt(s.getDb(), 'sess-A')
    s.close()
    expect(receipt.sessionId).toBe('sess-A')
    expect(receipt.saved).toBe(150)
    expect(receipt.byLever).toEqual({ ncd_dedup: 100, forage_stop: 50 })
  })

  it('AC2: an unknown/empty session returns saved:0, byLever:{} without throwing (fail-safe)', () => {
    const s = SqliteStore.open(dir)
    const receipt = sessionSavingsReceipt(s.getDb(), 'never-existed')
    s.close()
    expect(receipt.saved).toBe(0)
    expect(receipt.byLever).toEqual({})
  })

  it('CLI: agf savings --session <id> emits the receipt envelope from real ledger rows', async () => {
    seed('sess-C', 'info_bottleneck', 77)
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await savingsCommand().parseAsync(['--session', 'sess-C', '--dir', dir], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    const env = lastEnvelope(out)
    expect(env.ok).toBe(true)
    const data = env.data as { sessionId: string; saved: number; byLever: Record<string, number> }
    expect(data.sessionId).toBe('sess-C')
    expect(data.saved).toBe(77)
    expect(data.byLever.info_bottleneck).toBe(77)
  })
})
