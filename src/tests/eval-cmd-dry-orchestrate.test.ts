/*!
 * Task node_wire_433efbd8f32a — wire the dormant stub-orchestrate.ts into a CLI surface.
 *
 * AC: `agf eval --dry` swaps the real build orchestrator for the deterministic
 * stub, so the scorecard pipeline can be smoke-tested with zero network calls
 * and zero real build/test spawning.
 */
import { describe, it, expect } from 'vitest'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { resolveOrchestrate } from '../cli/commands/eval-cmd.js'
import { runBuildOrchestration } from '../cli/shared/run-build.js'

describe('resolveOrchestrate (eval --dry wiring)', () => {
  it('AC1: dry=false returns the real runBuildOrchestration', () => {
    expect(resolveOrchestrate(false)).toBe(runBuildOrchestration)
  })

  it('AC2: dry=true returns a stub Orchestrate that records deterministic tokens', async () => {
    const orchestrate = resolveOrchestrate(true)
    expect(orchestrate).not.toBe(runBuildOrchestration)

    const ledger = new TokenLedger()
    const report = await orchestrate({} as SqliteStore, {
      dir: '/tmp/unused',
      prd: 'unused',
      maxSteps: 1,
      live: false,
      testCmd: 'unused',
      ledger,
      onLog: () => {},
    })

    expect(report.stopped).toBe('done')
    expect(ledger.totals().tokensIn).toBeGreaterThan(0)
  })

  it('AC3: dry=true is deterministic across two calls (same token totals)', async () => {
    const run = async (): Promise<number> => {
      const orchestrate = resolveOrchestrate(true)
      const ledger = new TokenLedger()
      await orchestrate({} as SqliteStore, {
        dir: '/tmp/unused',
        prd: 'unused',
        maxSteps: 1,
        live: false,
        testCmd: 'unused',
        ledger,
        onLog: () => {},
      })
      return ledger.totals().tokensIn + ledger.totals().tokensOut
    }

    const [t1, t2] = await Promise.all([run(), run()])
    expect(t1).toBe(t2)
  })
})
