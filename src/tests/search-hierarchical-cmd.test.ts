/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_9f7b6c51ebaf — `agf search --hierarchical` returns ToC-tree sections;
 * default `agf search` (no flag) is byte-identical (graph-node FTS).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildDocTree } from '../core/rag/doc-tree.js'
import { insertTreeNodes } from '../core/rag/doc-tree-store.js'
import { searchCommand } from '../cli/commands/search-cmd.js'
import type { Section } from '../core/parser/segment.js'

const sec = (level: number, title: string, body: string): Section => ({ level, title, body, startLine: 0, endLine: 0 })

interface Envelope {
  ok: boolean
  data?: Array<{ title?: string; treePath?: string }>
  meta?: { count?: number }
}
function lastEnvelope(captured: string[]): Envelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as Envelope
}

describe('agf search --hierarchical (#node_9f7b6c51ebaf)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-hsearchcmd-'))
    const store = SqliteStore.open(dir)
    store.initProject('hcmd-test')
    insertTreeNodes(
      store.getDb(),
      'doc1',
      buildDocTree(
        [sec(1, 'Auth', 'a'), sec(2, 'OAuth Login', 'oauth login delegates to an external identity provider')],
        'doc1',
      ),
    )
    store.close()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function run(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c))
      return true
    })
    const prevExit = process.exitCode
    await searchCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('--hierarchical returns the matching ToC section', async () => {
    const env = await run(['oauth identity provider', '--hierarchical', '-d', dir])
    expect(env.ok).toBe(true)
    expect(env.data?.[0]?.title).toBe('OAuth Login')
    expect(env.data?.[0]?.treePath).toBe('1.1')
  })

  it('default search (no flag) does not use the tree (byte-identical path)', async () => {
    const env = await run(['oauth', '-d', dir])
    expect(env.ok).toBe(true)
    // Graph-node FTS over an empty graph → no tree sections leak in.
    expect((env.data ?? []).every((r) => r.treePath === undefined)).toBe(true)
  })
})
