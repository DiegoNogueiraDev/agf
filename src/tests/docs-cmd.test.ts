/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/docs-cmd.ts — wires the dormant DocsCacheStore
 * (src/core/docs/docs-cache-store.ts, node_wire_2a6a50a2f98f) to the CLI
 * surface: `agf docs list` and `agf docs search <query>`; and the dormant
 * DocsSyncer (src/core/docs/docs-syncer.ts, node_wire_5a78784425e2) via
 * `agf docs sync <libName>`.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docsCommand } from '../cli/commands/docs-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { DocsCacheStore } from '../core/docs/docs-cache-store.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function withCapturedStdout(fn: () => Promise<void>): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('docsCommand', () => {
  it('builds the "docs" command with list, search, and sync subcommands', () => {
    const cmd = docsCommand()
    expect(cmd.name()).toBe('docs')
    const subNames = cmd.commands.map((c) => c.name())
    expect(subNames).toContain('list')
    expect(subNames).toContain('search')
    expect(subNames).toContain('sync')
    expect(subNames).toContain('manifest')
    expect(subNames).toContain('stack')
  })
})

describe('agf docs list (node_wire_2a6a50a2f98f)', () => {
  it('prints cached docs from DocsCacheStore as a JSON envelope', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-list-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('docs-cmd-test')
      new DocsCacheStore(store.getDb()).upsertDoc({
        libId: 'react@latest',
        libName: 'react',
        content: 'React documentation content',
      })
      store.close()

      const envelope = await withCapturedStdout(() => docsCommand().parseAsync(['list', '-d', dir], { from: 'user' }))
      const data = envelope.data as { docs: Array<{ libName: string }>; total: number }

      expect(envelope.ok).toBe(true)
      expect(data.total).toBe(1)
      expect(data.docs[0].libName).toBe('react')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf docs search <query> (node_wire_2a6a50a2f98f)', () => {
  it('returns FTS matches via DocsCacheStore.searchDocs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-search-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('docs-cmd-test')
      const cacheStore = new DocsCacheStore(store.getDb())
      cacheStore.upsertDoc({ libId: 'react@latest', libName: 'react', content: 'React hooks documentation' })
      cacheStore.upsertDoc({ libId: 'vue@latest', libName: 'vue', content: 'Vue composition API documentation' })
      store.close()

      const envelope = await withCapturedStdout(() =>
        docsCommand().parseAsync(['search', 'hooks', '-d', dir], { from: 'user' }),
      )
      const data = envelope.data as { results: Array<{ libName: string }>; total: number }

      expect(envelope.ok).toBe(true)
      expect(data.total).toBe(1)
      expect(data.results[0].libName).toBe('react')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loud when no project exists at the given dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-nostore-'))
    try {
      const envelope = await withCapturedStdout(() => docsCommand().parseAsync(['list', '-d', dir], { from: 'user' }))
      expect(envelope.ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf docs sync <libName> (node_wire_5a78784425e2)', () => {
  it('syncs a library via DocsSyncer and persists it into DocsCacheStore', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-sync-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('docs-cmd-test')
      store.close()

      const envelope = await withCapturedStdout(() =>
        docsCommand().parseAsync(['sync', 'react', '-d', dir], { from: 'user' }),
      )
      const data = envelope.data as { doc: { libName: string; libId: string; content: string } }

      expect(envelope.ok).toBe(true)
      expect(data.doc.libName).toBe('react')

      const verifyStore = SqliteStore.open(dir)
      const cached = new DocsCacheStore(verifyStore.getDb()).getDoc(data.doc.libId)
      verifyStore.close()
      expect(cached).not.toBeNull()
      expect(cached?.libName).toBe('react')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loud when no project exists at the given dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-sync-nostore-'))
    try {
      const envelope = await withCapturedStdout(() =>
        docsCommand().parseAsync(['sync', 'react', '-d', dir], { from: 'user' }),
      )
      expect(envelope.ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf docs stack (node_wire_ec9ab1d1eeff)', () => {
  it('detects a Node.js stack from package.json without requiring a project store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-stack-'))
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' }, devDependencies: { vitest: '^1.0.0' } }),
      )

      const envelope = await withCapturedStdout(() => docsCommand().parseAsync(['stack', '-d', dir], { from: 'user' }))
      const data = envelope.data as { stack: { runtime: string; libraries: Array<{ name: string }> } | null }

      expect(envelope.ok).toBe(true)
      expect(data.stack?.runtime).toBe('node')
      expect(data.stack?.libraries.map((l) => l.name)).toEqual(expect.arrayContaining(['react', 'vitest']))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns a null stack when no manifest file is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-stack-empty-'))
    try {
      const envelope = await withCapturedStdout(() => docsCommand().parseAsync(['stack', '-d', dir], { from: 'user' }))
      const data = envelope.data as { stack: null }

      expect(envelope.ok).toBe(true)
      expect(data.stack).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf docs manifest (node_wire_a6f18bb469e4)', () => {
  it('introspects tools/routes/docs into a manifest without requiring a project store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-manifest-'))
    try {
      const docsDir = join(dir, 'docs', 'guides')
      mkdirSync(docsDir, { recursive: true })
      writeFileSync(join(docsDir, 'getting-started.md'), '# Getting Started\n')

      const envelope = await withCapturedStdout(() =>
        docsCommand().parseAsync(['manifest', '-d', dir], { from: 'user' }),
      )
      const data = envelope.data as { docs: Array<{ slug: string; title: string; category: string }> }

      expect(envelope.ok).toBe(true)
      expect(data.docs).toHaveLength(1)
      expect(data.docs[0]).toMatchObject({ slug: 'guides/getting-started', category: 'guides' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes the manifest to --out when provided', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-docs-manifest-out-'))
    try {
      const outPath = join(dir, 'manifest.json')
      const envelope = await withCapturedStdout(() =>
        docsCommand().parseAsync(['manifest', '-d', dir, '--out', outPath], { from: 'user' }),
      )
      const data = envelope.data as { outPath: string }

      expect(envelope.ok).toBe(true)
      expect(data.outPath).toBe(outPath)
      expect(existsSync(outPath)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
