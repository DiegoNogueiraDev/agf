/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/memory-cmd.ts — memoryCommand factory wiring.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { memoryCommand } from '../cli/commands/memory-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { writeMemory } from '../core/memory/memory-reader.js'

describe('memoryCommand', () => {
  it('builds the "memory" command with a description', () => {
    const cmd = memoryCommand()
    expect(cmd.name()).toBe('memory')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 8 subcommands', () => {
    expect(memoryCommand().commands.length).toBe(8)
  })
})

describe('memoryCommand helper (node_wire_bc7f2db08a80 — helper-registry wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await memoryCommand().parseAsync(args, { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('persist → get roundtrips a real helper fragment under workflow-graph/memories/helpers/', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-helper-'))

    const persisted = await run([
      'helper',
      'persist',
      'retry-3x',
      'Retry idempotent calls up to 3x with backoff.',
      '-d',
      dir,
    ])
    expect(persisted.ok).toBe(true)
    expect((persisted.data as { persisted: boolean }).persisted).toBe(true)

    const gotten = await run(['helper', 'get', 'retry-3x', '-d', dir])
    expect(gotten.ok).toBe(true)
    expect((gotten.data as { content: string }).content).toBe('Retry idempotent calls up to 3x with backoff.')
  })

  it('persist is idempotent — re-persisting identical content skips the write', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-helper-idempotent-'))
    await run(['helper', 'persist', 'noop-key', 'same content', '-d', dir])
    const second = await run(['helper', 'persist', 'noop-key', 'same content', '-d', dir])
    expect((second.data as { persisted: boolean }).persisted).toBe(false)
  })

  it('get returns NOT_FOUND for a key that was never persisted', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-helper-missing-'))
    const missing = await run(['helper', 'get', 'never-persisted', '-d', dir])
    expect(missing.ok).toBe(false)
  })
})

describe('memoryCommand mine-conversation (node_wire_80171617f772 — convo-miner wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('mines a JSONL session file and writes each extracted fact as a real memory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-convo-mine-'))
    const jsonlPath = join(dir, 'session.jsonl')
    writeFileSync(
      jsonlPath,
      [
        JSON.stringify({
          role: 'assistant',
          content: 'Decision: use SQLite for local storage.',
          created_at: '2026-01-01T00:00:00Z',
        }),
        JSON.stringify({ role: 'user', content: 'ok' }),
      ].join('\n'),
    )

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await memoryCommand().parseAsync(['mine-conversation', jsonlPath, '--session-id', 'sess123', '-d', dir], {
        from: 'user',
      })
    } finally {
      spy.mockRestore()
    }
    const envelope = JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
    expect(envelope.ok).toBe(true)
    expect(envelope.data.mined).toBe(1)

    const memoriesDir = join(dir, 'workflow-graph', 'memories')
    expect(existsSync(memoriesDir)).toBe(true)
    const files = readdirSync(memoriesDir).filter((f) => f.startsWith('convo-'))
    expect(files).toHaveLength(1)
  })
})

describe('memoryCommand search --decay (node_wire_3a9eeb98ca7d — pheromone-memory lazy-read wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeDecayMemory(name: string, strength: number): void {
    const memDir = join(dir, 'workflow-graph', 'memories')
    mkdirSync(memDir, { recursive: true })
    writeFileSync(join(memDir, `${name}.md`), JSON.stringify({ strength, date: new Date().toISOString() }))
  }

  async function runDecaySearch(query: string): Promise<{ ok: boolean; data: unknown; meta: { count: number } }> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await memoryCommand().parseAsync(['search', query, '--decay', '-d', dir], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return JSON.parse(out.join('').trim())
  }

  it('cold colony (no graph store — zero deposited trails) skips the read and returns empty', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-decay-cold-'))
    writeDecayMemory('pheromone-strong', 5)

    const envelope = await runDecaySearch('pheromone')
    expect(envelope.ok).toBe(true)
    expect(envelope.meta.count).toBe(0)
  })

  it('warm colony (≥1 deposited trail) runs the read and returns matching memories as before', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-decay-warm-'))
    writeDecayMemory('pheromone-strong', 5)

    const store = SqliteStore.open(dir)
    const project = store.initProject('proj-decay-test')
    depositPheromone(store.getDb(), project.id, 'file:touched.ts')
    store.close()

    const envelope = await runDecaySearch('pheromone')
    expect(envelope.ok).toBe(true)
    expect(envelope.meta.count).toBe(1)
  })
})

describe('memoryCommand prefetch (node_wire_7fd26bca8692 — builtin-provider wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function runPrefetch(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await memoryCommand().parseAsync(['prefetch', ...args], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return JSON.parse(out.join('').trim())
  }

  it('returns builtin memories wrapped in a fenced block for a real session', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-prefetch-'))
    await writeMemory(dir, 'onboarding', 'Use TDD for every task.')

    const envelope = await runPrefetch(['--session-id', 'sess1', '-d', dir])

    expect(envelope.ok).toBe(true)
    const data = envelope.data as { results: Array<{ id: string; content: string }>; fencedBlock: string }
    expect(data.results).toHaveLength(1)
    expect(data.results[0]!.id).toBe('builtin:onboarding')
    expect(data.fencedBlock).toContain('<memory-context>')
    expect(data.fencedBlock).toContain('Use TDD for every task.')
  })

  it('returns empty results with no error when no memories exist yet', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-prefetch-empty-'))

    const envelope = await runPrefetch(['--session-id', 'sess2', '-d', dir])

    expect(envelope.ok).toBe(true)
    const data = envelope.data as { results: unknown[] }
    expect(data.results).toHaveLength(0)
  })

  it('merges honcho results when HONCHO_API_URL is set (node_wire_b4a1f22798d8)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-prefetch-honcho-'))
    vi.stubEnv('HONCHO_API_URL', 'http://honcho.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ memories: [{ id: 'm1', content: 'external fact' }] }),
      }),
    )

    try {
      const envelope = await runPrefetch(['--session-id', 'sess3', '-d', dir])

      expect(envelope.ok).toBe(true)
      const data = envelope.data as { results: Array<{ id: string; content: string }> }
      expect(data.results.some((r) => r.id === 'honcho:m1')).toBe(true)
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('does not call fetch when HONCHO_API_URL is unset', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-prefetch-no-honcho-'))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    try {
      const envelope = await runPrefetch(['--session-id', 'sess4', '-d', dir])
      expect(envelope.ok).toBe(true)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('memoryCommand write — citation grounding', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runWrite(name: string, content: string): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await memoryCommand().parseAsync(['write', name, '--content', content, '-d', dir], { from: 'user' })
    spy.mockRestore()
    return JSON.parse(out.join('').trim())
  }

  it('reports isGrounded:true and the extracted citation when content has a valid §-citation', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-memory-citation-'))
    const envelope = await runWrite('pheromone-test', 'Fixed per §EPIC-13.1 guidance.')

    expect(envelope.ok).toBe(true)
    const citations = envelope.data?.citations as { extracted: string[]; isGrounded: boolean }
    expect(citations.isGrounded).toBe(true)
    expect(citations.extracted).toContain('§EPIC-13.1')
  })

  it('reports isGrounded:false when content has no citation', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-memory-no-citation-'))
    const envelope = await runWrite('pheromone-plain', 'Just a plain note, no formal citation.')

    expect(envelope.ok).toBe(true)
    const citations = envelope.data?.citations as { isGrounded: boolean }
    expect(citations.isGrounded).toBe(false)
  })
})
