import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// token-economy-file resolves ~/.config/agf from $HOME at module load. We point
// HOME at a temp dir and reset the module cache per test so each run is isolated
// and the real ~/.config/agf is never touched.
const ORIGINAL_HOME = process.env.HOME

async function freshModule(home: string): Promise<typeof import('../core/economy/token-economy-file.js')> {
  process.env.HOME = home
  vi.resetModules()
  return import('../core/economy/token-economy-file.js')
}

describe('token-economy-file saved_tok (RAG economy persistence)', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agf-econ-'))
  })
  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  it('setProjectSaved persists a saved_tok total and rolls into global_totals', async () => {
    const m = await freshModule(tmp)
    m.setProjectSaved('/proj/a', 240)
    const file = m.readEconomyFile()
    expect(file.projects['/proj/a']?.totals.saved_tok).toBe(240)
    expect(file.global_totals.saved_tok).toBe(240)
  })

  it('is idempotent — re-setting the cumulative total does not double count', async () => {
    const m = await freshModule(tmp)
    m.setProjectSaved('/proj/a', 100)
    m.setProjectSaved('/proj/a', 300) // cumulative value, not a delta
    expect(m.readEconomyFile().projects['/proj/a']?.totals.saved_tok).toBe(300)
    expect(m.readEconomyFile().global_totals.saved_tok).toBe(300)
  })

  it('reads legacy files without saved_tok without crashing (defaults to 0)', async () => {
    const dir = join(tmp, '.config', 'agf')
    mkdirSync(dir, { recursive: true })
    const legacy = {
      started: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
      projects: {
        '/proj/legacy': {
          started: '2026-01-01T00:00:00Z',
          updated: '2026-01-01T00:00:00Z',
          commands: {},
          llm: { calls: 0, in: 0, out: 0, cache: 0, cost: 0 },
          totals: { cmd_calls: 0, cmd_tok: 0, llm_tok: 0, combined_tok: 0, cost: 0 },
        },
      },
      global_totals: { projects: 1, cmd_calls: 0, cmd_tok: 0, llm_tok: 0, combined_tok: 0, cost: 0 },
    }
    writeFileSync(join(dir, 'token-economy.json'), JSON.stringify(legacy))
    const m = await freshModule(tmp)
    expect(() => m.setProjectSaved('/proj/new', 50)).not.toThrow()
    expect(m.readEconomyFile().global_totals.saved_tok).toBe(50)
  })
})
