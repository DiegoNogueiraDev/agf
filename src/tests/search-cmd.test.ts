/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/search-cmd.ts — searchCommand factory wiring.
 *
 * `--exact` wires the dormant suffix-array algorithm (src/core/algorithms/string/
 * suffix-array.ts) in as a literal-substring matcher: FTS5's sanitizeFtsQuery
 * strips punctuation like `_` and `:`, so an exact node id (`node_wire_...`) or a
 * `§EPIC-1.2` citation never matches via the default BM25 path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { searchCommand } from '../cli/commands/search-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(id: string, title: string, description: string): GraphNode {
  const now = new Date().toISOString()
  return {
    id,
    type: 'task',
    title,
    description,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

async function runSearch(
  dir: string,
  query: string,
  extraArgs: string[] = [],
): Promise<{ ok: boolean; data: unknown }> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  const prevExit = process.exitCode
  await searchCommand().parseAsync([query, '-d', dir, ...extraArgs], { from: 'user' })
  spy.mockRestore()
  process.exitCode = prevExit
  const line = out
    .join('')
    .trim()
    .split('\n')
    .find((l) => l.includes('"ok"'))
  return JSON.parse(line ?? '{}')
}

describe('searchCommand', () => {
  it('builds the "search" command with a description', () => {
    const cmd = searchCommand()
    expect(cmd.name()).toBe('search')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = searchCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
  it('declares a --snippet flag for match-context output', () => {
    const cmd = searchCommand()
    expect(cmd.options.some((o) => o.long === '--snippet')).toBe(true)
  })
})

describe('agf search --exact (suffix-array substring matcher)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-search-exact-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('finds a node by an exact punctuation-heavy substring FTS5 would strip', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-exact-test')
    store.insertNode(makeNode('node_wire_b670f2dd151c', 'WIRE task', 'connects node_wire_b670f2dd151c to a surface'))
    store.insertNode(makeNode('node_other', 'unrelated', 'nothing to see here'))
    store.close()

    const env = await runSearch(dir, 'node_wire_b670f2dd151c', ['--exact'])
    expect(env.ok).toBe(true)
    const data = env.data as Array<{ id: string }>
    expect(data.map((n) => n.id)).toEqual(['node_wire_b670f2dd151c'])
  })

  it('is case-insensitive and returns no match when the substring is absent', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-exact-test')
    store.insertNode(makeNode('node_a', 'Suffix Array Wiring', 'uses a SUFFIX ARRAY for matching'))
    store.close()

    const hit = await runSearch(dir, 'suffix array', ['--exact'])
    expect((hit.data as unknown[]).length).toBe(1)

    const miss = await runSearch(dir, 'no such phrase', ['--exact'])
    expect((miss.data as unknown[]).length).toBe(0)
  })
})

describe('agf search — validateSearchQuery boundary validation', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-search-validation-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('rejects an empty query with VALIDATION_ERROR', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-validation-test')
    store.close()

    const env = await runSearch(dir, '')
    expect(env.ok).toBe(false)
    expect((env as unknown as { code: string }).code).toBe('VALIDATION_ERROR')
  })

  it('rejects a --limit above the 100 boundary with VALIDATION_ERROR', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-validation-test')
    store.close()

    const env = await runSearch(dir, 'anything', ['--limit', '101'])
    expect(env.ok).toBe(false)
    expect((env as unknown as { code: string }).code).toBe('VALIDATION_ERROR')
  })
})

describe('agf search --federated (federatedQuery facade)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-search-federated-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('declares a --federated flag', () => {
    const cmd = searchCommand()
    expect(cmd.options.some((o) => o.long === '--federated')).toBe(true)
  })

  it('tags each result item with its source_store via the federatedQuery facade', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-federated-test')
    store.insertNode(makeNode('node_wire_federated', 'federated query test', 'wires the federated-query facade'))
    store.close()

    const env = (await runSearch(dir, 'federated query test', ['--federated'])) as {
      ok: boolean
      data: Array<{ data: unknown; source_store: string }>
      meta: { warnings: string[] }
    }
    expect(env.ok).toBe(true)
    expect(env.data.length).toBeGreaterThan(0)
    expect(env.data.every((item) => item.source_store === 'graph')).toBe(true)
    expect(env.meta.warnings).toEqual([])
  })

  it('returns no items and no warnings for a query that matches nothing', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-federated-test')
    store.close()

    const env = (await runSearch(dir, 'nothing matches this', ['--federated'])) as {
      ok: boolean
      data: unknown[]
      meta: { warnings: string[] }
    }
    expect(env.ok).toBe(true)
    expect(env.data).toEqual([])
    expect(env.meta.warnings).toEqual([])
  })
})

describe('agf search --federated --trace (tracedFederatedQuery facade)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-search-trace-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('declares a --trace flag', () => {
    const cmd = searchCommand()
    expect(cmd.options.some((o) => o.long === '--trace')).toBe(true)
  })

  it('attaches meta.trace with traceId, partial=false and per-store steps on a match', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-trace-test')
    store.insertNode(makeNode('node_wire_trace', 'traced query test', 'wires the tracedFederatedQuery facade'))
    store.close()

    const env = (await runSearch(dir, 'traced query test', ['--federated', '--trace'])) as {
      ok: boolean
      data: Array<{ data: unknown; source_store: string }>
      meta: { warnings: string[]; trace: { traceId: string; partial: boolean; steps: unknown[] } }
    }
    expect(env.ok).toBe(true)
    expect(env.data.length).toBeGreaterThan(0)
    expect(typeof env.meta.trace.traceId).toBe('string')
    expect(env.meta.trace.traceId.length).toBeGreaterThan(0)
    expect(env.meta.trace.partial).toBe(false)
    expect(env.meta.trace.steps.length).toBeGreaterThan(0)
  })

  it('ignores --trace without --federated (no trace in meta)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-trace-test')
    store.insertNode(makeNode('node_plain', 'plain query test', 'no federation here'))
    store.close()

    const env = (await runSearch(dir, 'plain query test', ['--trace'])) as {
      ok: boolean
      meta: { trace?: unknown }
    }
    expect(env.ok).toBe(true)
    expect(env.meta.trace).toBeUndefined()
  })
})

describe('agf search --compress (AAAK key compression)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-search-compress-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('adds a compressedId shorter than the original id and reports a compressionRatio', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-compress-test')
    store.insertNode(makeNode('node_wire_alpha_bravo_charlie', 'compress me', 'a node with a long compressible id'))
    store.close()

    const env = (await runSearch(dir, 'compress me', ['--compress'])) as {
      ok: boolean
      data: Array<{ id: string; compressedId: string }>
      meta: { compressionRatio: number }
    }
    expect(env.ok).toBe(true)
    expect(env.data.length).toBe(1)
    expect(env.data[0].id).toBe('node_wire_alpha_bravo_charlie')
    expect(env.data[0].compressedId.length).toBeLessThan(env.data[0].id.length)
    expect(env.meta.compressionRatio).toBeGreaterThan(0)
  })

  it('leaves results unchanged (no compressedId field) when the flag is absent', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('search-compress-test')
    store.insertNode(makeNode('node_wire_alpha_bravo_charlie', 'compress me', 'plain search, no flag'))
    store.close()

    const env = (await runSearch(dir, 'compress me')) as { data: Array<Record<string, unknown>> }
    expect(env.data[0].compressedId).toBeUndefined()
  })
})
