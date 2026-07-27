import { describe, it, expect, vi } from 'vitest'
import { runInitOrchestration } from '../cli/commands/init-cmd.js'
import type { InitOrchestrationDeps } from '../cli/commands/init-cmd.js'

/**
 * Tests that agf init wires startProgressServer (the web dashboard) instead of the
 * MCP server. Uses DI stubs — no real DB or network.
 */

function stubDeps(overrides: Partial<InitOrchestrationDeps> = {}): InitOrchestrationDeps {
  return {
    isDbInitialized: () => true,
    runSetup: vi.fn().mockResolvedValue(undefined),
    atomicWrites: vi.fn().mockResolvedValue(new Map()),
    isNeuralReady: vi.fn().mockResolvedValue(true),
    installNeural: vi.fn().mockResolvedValue('ready'),
    runDoctor: vi.fn().mockResolvedValue({ checks: [], summary: { ok: 1, warning: 0, error: 0 }, passed: true }),
    startServer: vi.fn().mockResolvedValue('http://localhost:3000'),
    openInBrowser: vi.fn().mockResolvedValue(undefined),
    out: vi.fn(),
    detectCli: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('agf init — serve dashboard wire', () => {
  it('calls startServer with the requested port', async () => {
    const deps = stubDeps()
    await runInitOrchestration({ dir: '/tmp/test', skipNeural: true, noServe: false, port: 3456 }, deps)
    expect(deps.startServer).toHaveBeenCalledWith(3456)
  })

  it('does not call startServer when --no-serve is set', async () => {
    const deps = stubDeps()
    await runInitOrchestration({ dir: '/tmp/test', skipNeural: true, noServe: true, port: 3000 }, deps)
    expect(deps.startServer).not.toHaveBeenCalled()
  })

  it('returns success:false when doctor fails without calling startServer', async () => {
    const deps = stubDeps({
      runDoctor: vi.fn().mockResolvedValue({
        checks: [],
        summary: { ok: 0, warning: 0, error: 1 },
        passed: false,
      }),
    })
    const result = await runInitOrchestration({ dir: '/tmp/test', skipNeural: true, noServe: false, port: 3000 }, deps)
    expect(result.success).toBe(false)
    expect(deps.startServer).not.toHaveBeenCalled()
  })
})
