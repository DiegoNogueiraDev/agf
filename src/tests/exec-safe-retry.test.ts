import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execCommand } from '../cli/commands/exec-cmd.js'
import { runAgf } from '../core/compose/agf-runner.js'
import { Command } from 'commander'

vi.mock('../core/compose/agf-runner.js', () => ({
  runAgf: vi.fn(),
}))

vi.mock('../open-store.js', () => ({
  openStoreOrFail: vi.fn(() => ({
    getProject: () => ({ id: 'test' }),
    close: vi.fn(),
    getStats: () => ({ totalNodes: 0, byStatus: {} }),
    getNodeById: () => null,
  })),
}))

vi.mock('../../core/hooks/session-manifest.js', () => ({
  recordInManifest: vi.fn(),
  getCurrentSessionId: () => null,
}))

vi.mock('../../core/observability/cmd-tracker.js', () => ({
  trackCommandUsage: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ stdout: '', stderr: '' })),
}))

function mockRunAgfSequence(results: Array<{ ok: boolean; data?: unknown }>) {
  let callIndex = 0
  return vi.fn(async () => {
    const r = results[callIndex] ?? results[results.length - 1]!
    callIndex++
    return { envelope: { ok: r.ok, data: r.data ?? {}, error: undefined, code: undefined } }
  })
}

async function runSafeSubcommand(args: string[]) {
  const root = new Command('test')
  root.addCommand(execCommand())
  await root.parseAsync(['node', 'test', 'exec', 'safe', ...args])
}

describe('exec safe — retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has --retries option on safe subcommand', () => {
    const cmd = execCommand()
    const safe = cmd.commands.find((c) => c.name() === 'safe')
    expect(safe).toBeDefined()
    const opts = safe!.options.map((o) => o.long)
    expect(opts).toContain('--retries')
  })

  it('has --retry-delay option on safe subcommand', () => {
    const cmd = execCommand()
    const safe = cmd.commands.find((c) => c.name() === 'safe')
    expect(safe).toBeDefined()
    const opts = safe!.options.map((o) => o.long)
    expect(opts).toContain('--retry-delay')
  })

  it('defaults retries to 1 (no retry)', () => {
    const cmd = execCommand()
    const safe = cmd.commands.find((c) => c.name() === 'safe')
    expect(safe).toBeDefined()
    const retriesOpt = safe!.options.find((o) => o.long === '--retries')
    expect(retriesOpt).toBeDefined()
    expect(retriesOpt!.defaultValue).toBe(1)
  })

  it('retries a transient failure before giving up', async () => {
    const mockRunAgf = mockRunAgfSequence([
      { ok: true }, // brief
      { ok: true }, // start
      { ok: false }, // blast — FAILS first time
      { ok: true }, // blast — succeeds on retry
      { ok: true }, // check
      { ok: true }, // done
    ])
    vi.mocked(runAgf).mockImplementation(mockRunAgf)

    await runSafeSubcommand(['test-task', '--retries', '3'])

    // blast should have been called twice (fail + retry)
    expect(mockRunAgf).toHaveBeenCalledTimes(6)
  })

  it('does not retry when retries=1 (default)', async () => {
    const mockRunAgf = mockRunAgfSequence([
      { ok: true }, // brief
      { ok: false }, // start — FAILS
    ])
    vi.mocked(runAgf).mockImplementation(mockRunAgf)

    await runSafeSubcommand(['test-task'])

    // Only 2 calls: brief + start (no retry)
    expect(mockRunAgf).toHaveBeenCalledTimes(2)
  })

  it('stops retrying after max attempts exhausted', async () => {
    const mockRunAgf = mockRunAgfSequence([
      { ok: true }, // brief
      { ok: false }, // start — FAILS all 3 attempts
      { ok: false },
      { ok: false },
    ])
    vi.mocked(runAgf).mockImplementation(mockRunAgf)

    await runSafeSubcommand(['test-task', '--retries', '3'])

    // brief(1) + start(3 attempts) = 4 calls total
    expect(mockRunAgf).toHaveBeenCalledTimes(4)
  })
})
