/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { knowledgeCompileCommand } from '../../cli/commands/knowledge-compile-cmd.js'

describe('knowledge-compile-cmd — connects dormant core/knowledge/compile-source.ts (node_wire_60385c4b95c7)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const proc = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await knowledgeCompileCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = proc
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  async function initDir(): Promise<string> {
    const { SqliteStore } = await import('../../core/store/sqlite-store.js')
    const d = mkdtempSync(join(tmpdir(), 'agf-knowledge-compile-'))
    const s = SqliteStore.open(d)
    s.initProject('knowledge-compile-test')
    s.close()
    return d
  }

  it('AC1: ingests --content as a new source and returns a CompiledPage with version 1', async () => {
    dir = await initDir()
    const envelope = await run(['src-1', '--content', 'Hello world content', '-d', dir])
    expect(envelope.ok).toBe(true)
    const page = envelope.data as { sourceId: string; structured: string; version: number }
    expect(page.sourceId).toBe('src-1')
    expect(page.version).toBe(1)
    expect(page.structured.length).toBeGreaterThan(0)
  })

  it('AC2: recompiling the same sourceId increments version in-place (no duplicate row)', async () => {
    dir = await initDir()
    await run(['src-1', '--content', 'First version', '-d', dir])
    const envelope = await run(['src-1', '--content', 'Second version', '-d', dir])
    expect(envelope.ok).toBe(true)
    const page = envelope.data as { version: number }
    expect(page.version).toBe(2)
  })

  it('returns NOT_FOUND when compiling a sourceId with no prior --content ingest', async () => {
    dir = await initDir()
    const envelope = await run(['ghost', '-d', dir])
    expect(envelope.ok).toBe(false)
  })
})
