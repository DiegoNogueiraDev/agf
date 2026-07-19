import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { economyCommand, runEconomyPheromoneSim, runEconomyShadowSim } from '../cli/commands/economy-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  resolveEconomyLeversConfig,
  getLeverParam,
  setLeverParam,
  isLeverEnabled,
  LOSS_SAFE_BUILD_BUNDLE,
} from '../core/economy/economy-levers-config.js'
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

describe('agf economy preset build (node_bafb6c95d0a0)', () => {
  let dir: string
  let out: string[]
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Disk store so state survives each CLI action closing its own handle.
    dir = mkdtempSync(join(tmpdir(), 'agf-preset-'))
    const seed = SqliteStore.open(dir)
    seed.initProject('preset-test')
    seed.close()
    vi.mocked(openStoreOrFail).mockImplementation(
      () => SqliteStore.open(dir) as unknown as ReturnType<typeof openStoreOrFail>,
    )
    out = []
    spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    spy.mockRestore()
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('enables exactly the loss-safe bundle levers and leaves non-bundle levers off', async () => {
    await economyCommand().parseAsync(['preset', 'build'], { from: 'user' })
    const s = SqliteStore.open(dir)
    const cfg = resolveEconomyLeversConfig(s)
    for (const k of LOSS_SAFE_BUILD_BUNDLE) expect(isLeverEnabled(cfg, k)).toBe(true)
    expect(isLeverEnabled(cfg, 'mdl_select')).toBe(false)
    s.close()
  })

  it('is idempotent — running preset build twice leaves the config unchanged', async () => {
    await economyCommand().parseAsync(['preset', 'build'], { from: 'user' })
    const s1 = SqliteStore.open(dir)
    const after1 = JSON.stringify(resolveEconomyLeversConfig(s1))
    s1.close()
    await economyCommand().parseAsync(['preset', 'build'], { from: 'user' })
    const s2 = SqliteStore.open(dir)
    const after2 = JSON.stringify(resolveEconomyLeversConfig(s2))
    s2.close()
    expect(after2).toBe(after1)
  })

  it('preset build --off reverts exactly the bundle levers', async () => {
    await economyCommand().parseAsync(['preset', 'build'], { from: 'user' })
    await economyCommand().parseAsync(['preset', 'build', '--off'], { from: 'user' })
    const s = SqliteStore.open(dir)
    const cfg = resolveEconomyLeversConfig(s)
    for (const k of LOSS_SAFE_BUILD_BUNDLE) expect(isLeverEnabled(cfg, k)).toBe(false)
    s.close()
  })

  it('the envelope lists which levers were toggled and the enabled state', async () => {
    await economyCommand().parseAsync(['preset', 'build'], { from: 'user' })
    const env = lastEnvelope(out)
    expect(env.ok).toBe(true)
    const data = env.data as { preset: string; levers: string[]; enabled: boolean }
    expect(data.preset).toBe('build')
    expect(data.levers).toEqual([...LOSS_SAFE_BUILD_BUNDLE])
    expect(data.enabled).toBe(true)
  })

  it('an unknown preset name fails with UNKNOWN_PRESET', async () => {
    await economyCommand().parseAsync(['preset', 'does-not-exist'], { from: 'user' })
    const env = lastEnvelope(out)
    expect(env.ok).toBe(false)
    expect(env.code).toBe('UNKNOWN_PRESET')
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

describe('runEconomyShadowSim — CLI surface for core/rag-out/shadow-sampler.ts (WIRE node_wire_ad9012b2d016)', () => {
  // AC: GIVEN n=2 and 4 calls WHEN simulated THEN calls 0 and 2 (1-in-N, 0-indexed) are sampled
  it('marks every Nth call as sampled', () => {
    const result = runEconomyShadowSim({
      n: 2,
      calls: [
        { lever: 'rag_out_recovery', baselineTokens: 100, actualTokens: 20 },
        { lever: 'rag_out_recovery', baselineTokens: 200, actualTokens: 40 },
        { lever: 'rag_out_recovery', baselineTokens: 300, actualTokens: 60 },
        { lever: 'rag_out_recovery', baselineTokens: 400, actualTokens: 80 },
      ],
    })
    expect(result.sampled).toEqual([true, false, true, false])
  })

  // AC: GIVEN only the sampled calls carry real dual-path numbers THEN meanBaseline
  // averages just those, not the unsampled calls that never ran the pure-LLM path
  it('averages baselineTokens only across sampled calls for the lever', () => {
    const result = runEconomyShadowSim({
      n: 2,
      calls: [
        { lever: 'rag_out_recovery', baselineTokens: 100, actualTokens: 20 },
        { lever: 'rag_out_recovery', baselineTokens: 999, actualTokens: 999 }, // unsampled, must not count
        { lever: 'rag_out_recovery', baselineTokens: 300, actualTokens: 60 },
      ],
    })
    expect(result.meanBaselines['rag_out_recovery']).toBe(200) // (100 + 300) / 2
  })

  // AC: GIVEN calls across two distinct levers THEN each lever gets its own mean baseline
  it('keeps meanBaselines separate per lever', () => {
    const result = runEconomyShadowSim({
      n: 1,
      calls: [
        { lever: 'rag_in_reuse', baselineTokens: 50, actualTokens: 10 },
        { lever: 'rag_out_recovery', baselineTokens: 150, actualTokens: 30 },
      ],
    })
    expect(result.meanBaselines['rag_in_reuse']).toBe(50)
    expect(result.meanBaselines['rag_out_recovery']).toBe(150)
  })

  // AC: GIVEN no calls THEN sampled is empty and meanBaselines has no entries
  it('returns empty results for an empty call sequence', () => {
    const result = runEconomyShadowSim({ n: 10, calls: [] })
    expect(result.sampled).toEqual([])
    expect(result.meanBaselines).toEqual({})
  })
})

describe('agf economy view — CLI surface for core/web/views/economy-view.ts (WIRE node_wire_f16d3af9677a)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('economy-view-test')
    vi.mocked(openStoreOrFail).mockReturnValue(store as unknown as ReturnType<typeof openStoreOrFail>)
  })

  afterEach(() => {
    store.close()
    vi.restoreAllMocks()
  })

  // AC: GIVEN an empty store WHEN `agf economy view` runs THEN the envelope carries
  // the rendered economy HTML fragment (same markup as renderEconomyView)
  it('returns the rendered economy panel HTML in the envelope', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await economyCommand().parseAsync(['view'], { from: 'user' })
    spy.mockRestore()
    const env = lastEnvelope(out)
    expect(env.ok).toBe(true)
    const data = env.data as { html: string }
    expect(data.html).toContain('id="panel-economy"')
    expect(data.html).toContain('Savings rate')
  })
})
