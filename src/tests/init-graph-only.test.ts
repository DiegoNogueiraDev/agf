/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runInitOrchestration, runGraphOnlySetup, resolveDemoDir } from '../cli/commands/init-cmd.js'
import type { InitOrchestrationDeps } from '../cli/commands/init-cmd.js'

function stubDeps(overrides: Partial<InitOrchestrationDeps> = {}): InitOrchestrationDeps {
  return {
    isDbInitialized: () => false,
    runSetup: vi.fn().mockResolvedValue(undefined),
    runGraphOnlySetup: vi.fn().mockResolvedValue(undefined),
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

describe('agf init --graph-only — orchestration gating', () => {
  it('runs ONLY the graph-only setup, skipping context/neural/serve phases', async () => {
    const deps = stubDeps()

    const result = await runInitOrchestration(
      { dir: '/tmp/x', skipNeural: false, noServe: false, port: 3000, graphOnly: true },
      deps,
    )

    expect(result.success).toBe(true)
    expect(deps.runGraphOnlySetup).toHaveBeenCalledTimes(1)
    // none of the context-injecting / neural / serve phases may run
    expect(deps.runSetup).not.toHaveBeenCalled()
    expect(deps.detectCli).not.toHaveBeenCalled()
    expect(deps.atomicWrites).not.toHaveBeenCalled()
    expect(deps.installNeural).not.toHaveBeenCalled()
    expect(deps.startServer).not.toHaveBeenCalled()
  })

  it('normal init (no graphOnly) still runs the full pipeline', async () => {
    const deps = stubDeps()

    await runInitOrchestration({ dir: '/tmp/x', skipNeural: false, noServe: true, port: 3000 }, deps)

    expect(deps.runSetup).toHaveBeenCalledTimes(1)
    expect(deps.detectCli).toHaveBeenCalledTimes(1)
    expect(deps.runGraphOnlySetup).not.toHaveBeenCalled()
  })
})

describe('agf init --demo — resolveDemoDir (node_wire_3aa6b33caf57)', () => {
  const sandboxPaths: string[] = []
  afterEach(() => {
    for (const p of sandboxPaths) rmSync(p, { recursive: true, force: true })
    sandboxPaths.length = 0
  })

  it('when --demo is false, returns the given dir untouched and no sandbox', () => {
    const resolved = resolveDemoDir({ demo: false, dir: '/tmp/x' })
    expect(resolved.dir).toBe('/tmp/x')
    expect(resolved.sandbox).toBeUndefined()
  })

  it('when --demo is true, creates a real ephemeral sandbox and returns its path', () => {
    const resolved = resolveDemoDir({ demo: true, dir: '/tmp/ignored' })
    expect(resolved.sandbox).toBeDefined()
    sandboxPaths.push(resolved.sandbox!.path)
    expect(resolved.dir).toBe(resolved.sandbox!.path)
    expect(existsSync(resolved.dir)).toBe(true)
    expect(resolved.dir).not.toBe('/tmp/ignored')
  })
})

describe('runGraphOnlySetup — real filesystem footprint on a foreign repo', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('creates the graph DB but writes NO context/scaffolding files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-graphonly-'))
    dirs.push(dir)

    await runGraphOnlySetup(dir)

    // graph is created
    expect(existsSync(join(dir, 'workflow-graph', 'graph.db'))).toBe(true)
    // and NOTHING that would mutate a third-party repo's context/config
    for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'PRD.md', '.claude', '.cursor', '.windsurf']) {
      expect(existsSync(join(dir, f)), `${f} must NOT be created by --graph-only`).toBe(false)
    }
  })

  it('adds workflow-graph/ to .gitignore so the local DB is not committed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-graphonly-'))
    dirs.push(dir)

    await runGraphOnlySetup(dir)

    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('workflow-graph/')
  })

  it('produces a queryable graph — toGraphDocument() must not throw (gaps/harness use it)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-graphonly-'))
    dirs.push(dir)

    await runGraphOnlySetup(dir)

    const { SqliteStore } = await import('../core/store/sqlite-store.js')
    const store = SqliteStore.open(dir)
    try {
      // Before the fix this threw GraphNotInitializedError: the db had schema but no
      // projects row, so any command that materializes the graph (gaps) failed on a
      // freshly --graph-only'd foreign repo.
      const doc = store.toGraphDocument()
      expect(doc.nodes).toEqual([])
    } finally {
      store.close()
    }
  })
})
