import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { montarOutputCommand } from '../cli/commands/montar-output-cmd.js'

vi.mock('../core/rag-out/gate.js', () => ({
  decideScaffold: vi.fn(),
}))
vi.mock('../core/rag-out/scaffold-corpus.js', () => ({
  loadDefaultScaffoldCorpus: vi.fn().mockReturnValue([]),
}))

import { decideScaffold } from '../core/rag-out/gate.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runMontarOutput(goal: string, dir: string): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    // -d points at a directory with no agf project, so openStoreIfExists returns
    // undefined and recordEconomy no-ops — this test must never write telemetry
    // into this repo's own real graph.db.
    await montarOutputCommand().parseAsync([goal, '-d', dir], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('montarOutputCommand', () => {
  it('returns a Command instance', () => {
    const cmd = montarOutputCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = montarOutputCommand()
    expect(cmd.name()).toBe('montar-output')
  })

  it('has a non-empty description', () => {
    const cmd = montarOutputCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

describe('montarOutputCommand — scaffold recovery message (node_1103d0139ec1)', () => {
  let dir: string

  beforeEach(() => {
    vi.clearAllMocks()
    dir = mkdtempSync(join(tmpdir(), 'agf-montar-output-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('AC1: decision=recover with real slots → envelope.message contains "scaffold recovered: N tok saved"', async () => {
    vi.mocked(decideScaffold).mockReturnValue({
      decision: 'recover',
      goal: 'REST endpoint handler',
      confidence: 0.9,
      best: {
        id: 'contract',
        goal: 'REST handler',
        fitTags: ['rest'],
        slots: ['route', 'method', 'requestSchema', 'responseSchema'],
        noveltyFloor: 0.5,
        structureRef: null,
      },
      candidates: [],
      reason: 'lexical_match',
    })

    const envelope = await runMontarOutput('REST endpoint handler', dir)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { message?: string }
    expect(data.message).toMatch(/^scaffold recovered: \d+ tok saved$/)
  })

  it('AC3: decision=generate → envelope has no "scaffold recovered" message', async () => {
    vi.mocked(decideScaffold).mockReturnValue({
      decision: 'generate',
      goal: 'something genuinely new',
      confidence: 0,
      best: null,
      candidates: [],
      reason: 'no_lexical_match',
    })

    const envelope = await runMontarOutput('something genuinely new', dir)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { message?: string }
    expect(data.message).toBeUndefined()
  })
})
