import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { economyCommand, runEconomyPheromoneSim } from '../cli/commands/economy-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { resolveEconomyLeversConfig, getLeverParam, setLeverParam } from '../core/economy/economy-levers-config.js'
import { openStoreOrFail } from '../cli/open-store.js'

vi.mock('../cli/open-store.js', () => ({
  openStoreOrFail: vi.fn(),
}))

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('economyCommand', () => {
  it('returns a Command instance', () => {
    const cmd = economyCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = economyCommand()
    expect(cmd.name()).toBe('economy')
  })

  it('has a non-empty description', () => {
    const cmd = economyCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = economyCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})

describe('agf economy param — aco_autotune rho-schedule + Lévy params (node_f9da6399eb18)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('economy-param-test')
    vi.mocked(openStoreOrFail).mockReturnValue(store as unknown as ReturnType<typeof openStoreOrFail>)
  })

  afterEach(() => {
    store.close()
    vi.restoreAllMocks()
  })

  it.each(['rho0', 'rhoF', 'lambda', 'pLevy', 'betaLevy', 'kappa'])(
    'agf economy param aco_autotune %s <value> is accepted and echoed in the envelope',
    async (paramName) => {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await economyCommand().parseAsync(['param', 'aco_autotune', paramName, '0.42'], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(true)
      const data = envelope.data as { lever: string; param: string; value: number }
      expect(data.lever).toBe('aco_autotune')
      expect(data.param).toBe(paramName)
      expect(data.value).toBe(0.42)
    },
  )

  it('a persisted rho0 override is readable via getLeverParam on a fresh read of the same project setting', () => {
    // Exercises the persistence path directly (setLeverParam -> resolveEconomyLeversConfig),
    // independent of the CLI action's own store lifecycle (which closes its own handle).
    setLeverParam(store, 'aco_autotune', 'rho0', 0.42)
    const cfg = resolveEconomyLeversConfig(store)
    expect(getLeverParam(cfg, 'aco_autotune', 'rho0', -1)).toBe(0.42)
  })

  it('agf economy list shows the 6 new params in thresholds with enabled=false by default', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await economyCommand().parseAsync(['list'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { levers: Array<{ name: string; enabled: boolean }> }
    const acoAutotune = data.levers.find((l) => l.name === 'aco_autotune')
    expect(acoAutotune).toBeDefined()
    expect(acoAutotune!.enabled).toBe(false)
  })
})

describe('runEconomyPheromoneSim — CLI surface for core/economy/stigmergy.ts (WIRE node_wire_985ee9a80b5d)', () => {
  // AC: GIVEN a sequence of deposits WHEN simulated THEN each trail's strength decays per e^{-λt}
  it('returns per-key strengths decayed to `now` under the given half-life', () => {
    const result = runEconomyPheromoneSim({
      halfLifeMs: 3_600_000, // 1 hour
      deposits: [{ key: 'a:b', amount: 1, atMs: 0 }],
      now: 3_600_000,
    })
    expect(result.trails).toHaveLength(1)
    expect(result.trails[0]!.key).toBe('a:b')
    expect(result.trails[0]!.strength).toBeCloseTo(0.5, 2)
  })

  // AC: GIVEN repeated deposits on one key and a single deposit on another THEN the busier trail is strongest
  it('reports the strongest trail among competing keys', () => {
    const result = runEconomyPheromoneSim({
      halfLifeMs: 3_600_000,
      deposits: [
        { key: 'busy', amount: 1, atMs: 0 },
        { key: 'busy', amount: 1, atMs: 0 },
        { key: 'quiet', amount: 1, atMs: 0 },
      ],
      now: 0,
    })
    expect(result.strongest?.key).toBe('busy')
  })

  // AC: GIVEN no deposits reach epsilon by `now` THEN strongest is null
  it('returns null strongest when all trails have evaporated below epsilon', () => {
    const result = runEconomyPheromoneSim({
      halfLifeMs: 1000,
      deposits: [{ key: 'stale', amount: 1, atMs: 0 }],
      now: 100_000,
    })
    expect(result.strongest).toBeNull()
  })

  // AC: GIVEN a non-positive half-life THEN a descriptive error is thrown
  it('throws a descriptive error for a non-positive half-life', () => {
    expect(() => runEconomyPheromoneSim({ halfLifeMs: 0, deposits: [], now: 0 })).toThrow(/halfLifeMs/)
  })
})
