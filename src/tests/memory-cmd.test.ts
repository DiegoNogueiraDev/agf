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

describe('memoryCommand', () => {
  it('builds the "memory" command with a description', () => {
    const cmd = memoryCommand()
    expect(cmd.name()).toBe('memory')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 7 subcommands', () => {
    expect(memoryCommand().commands.length).toBe(7)
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
