/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/autopilot-cmd.ts — wires the colony health
 * circuit breaker's on_circuit_break emission (node_wire_4332b3b09de8).
 * runAutopilot itself is deliberately pure ("sem efeitos colaterais além do
 * port"), so the emitCircuitBreakHook call belongs in the CLI caller — this
 * test verifies that wiring, mocking runAutopilot's result rather than
 * re-testing the colony-health computation (already covered by
 * autopilot-colony-circuit-breaker.test.ts and colony-signals.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const emitCircuitBreakHookMock = vi.fn()
vi.mock('../core/hooks/finalization-lifecycle-hooks.js', () => ({
  emitCircuitBreakHook: emitCircuitBreakHookMock,
}))

const runAutopilotMock = vi.fn()
vi.mock('../core/autonomy/autopilot-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/autonomy/autopilot-loop.js')>()
  return { ...actual, runAutopilot: runAutopilotMock }
})

describe('agf autopilot — colony circuit breaker emits on_circuit_break (node_wire_4332b3b09de8)', () => {
  let dir: string

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-autopilot-circuit-'))
    emitCircuitBreakHookMock.mockClear()
    runAutopilotMock.mockReset()
    const { SqliteStore } = await import('../core/store/sqlite-store.js')
    const store = SqliteStore.open(dir)
    store.initProject('circuit-break-test')
    store.close()
  })

  async function runAutopilotCmd(): Promise<void> {
    const { autopilotCommand } = await import('../cli/commands/autopilot-cmd.js')
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await autopilotCommand().parseAsync(['--simulate', '-d', dir], { from: 'user' })
    } finally {
      spy.mockRestore()
      errSpy.mockRestore()
    }
  }

  it('emits on_circuit_break when the loop stops with colony_critical', async () => {
    runAutopilotMock.mockResolvedValue({ steps: [], completed: 0, escalated: 1, stopped: 'colony_critical' })

    await runAutopilotCmd()

    expect(emitCircuitBreakHookMock).toHaveBeenCalledTimes(1)
    expect(emitCircuitBreakHookMock).toHaveBeenCalledWith({ scope: 'colony-health', stopped: 'colony_critical' })
  })

  it('emits on_circuit_break when the loop stops with colony_degraded', async () => {
    runAutopilotMock.mockResolvedValue({ steps: [], completed: 2, escalated: 1, stopped: 'colony_degraded' })

    await runAutopilotCmd()

    expect(emitCircuitBreakHookMock).toHaveBeenCalledTimes(1)
    expect(emitCircuitBreakHookMock).toHaveBeenCalledWith({ scope: 'colony-health', stopped: 'colony_degraded' })
  })

  it('does not emit on_circuit_break for a normal completion', async () => {
    runAutopilotMock.mockResolvedValue({ steps: [], completed: 3, escalated: 0, stopped: 'no_more_tasks' })

    await runAutopilotCmd()

    expect(emitCircuitBreakHookMock).not.toHaveBeenCalled()
  })
})
