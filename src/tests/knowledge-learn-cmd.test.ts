/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/knowledge-learn-cmd.ts — wires learnFromProject
 * (cross-project-learner.ts, node_wire_152310e3cbc3) so a target project can
 * import knowledge_documents from a source project's real graph.db.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { knowledgeLearnCommand } from '../cli/commands/knowledge-learn-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await knowledgeLearnCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf knowledge-learn (node_wire_152310e3cbc3)', () => {
  let sourceDir: string
  let targetDir: string

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true })
    rmSync(targetDir, { recursive: true, force: true })
  })

  it('imports a real knowledge_documents row from the source project into the target', async () => {
    sourceDir = mkdtempSync(join(tmpdir(), 'agf-know-learn-source-'))
    targetDir = mkdtempSync(join(tmpdir(), 'agf-know-learn-target-'))

    const source = SqliteStore.open(sourceDir)
    source.initProject('source-project')
    const now = new Date().toISOString()
    source
      .getDb()
      .prepare(
        `INSERT INTO knowledge_documents
           (id, source_type, source_id, title, content, content_hash, chunk_index, quality_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run('doc1', 'ai_decision', 'node_x', 'Decision title', 'Decision content body', 'hash1', 0.9, now, now)
    source.close()

    const target = SqliteStore.open(targetDir)
    target.initProject('target-project')
    target.close()

    const envelope = await run([sourceDir, '-d', targetDir, '--categories', 'errors'])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { imported: number; skipped: number; sourceProject: string }
    expect(data.imported).toBe(1)
    expect(data.sourceProject).toBe(sourceDir)

    const after = SqliteStore.open(targetDir)
    const rows = after.getDb().prepare('SELECT * FROM knowledge_documents').all() as Array<{ title: string }>
    after.close()
    expect(rows.some((r) => r.title === 'Decision title')).toBe(true)
  })

  it('returns zero imported when the source path has no graph.db (soft-fail, never throws)', async () => {
    sourceDir = mkdtempSync(join(tmpdir(), 'agf-know-learn-empty-source-'))
    targetDir = mkdtempSync(join(tmpdir(), 'agf-know-learn-empty-target-'))
    const target = SqliteStore.open(targetDir)
    target.initProject('target-project')
    target.close()

    const envelope = await run([sourceDir, '-d', targetDir])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { imported: number }).imported).toBe(0)
  })
})
