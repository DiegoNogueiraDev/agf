/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/dataset-cmd.ts — wires DatasetStore
 * (node_wire_c4f5c46e7603), which had zero real callers AND zero test
 * coverage despite operating on real tables (eval_datasets,
 * eval_dataset_entries, execution_traces, decision_log).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { datasetCommand } from '../cli/commands/dataset-cmd.js'

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
    await datasetCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf dataset (node_wire_c4f5c46e7603)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('create → show roundtrips an empty dataset', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-dataset-'))
    const store = SqliteStore.open(dir)
    store.initProject('dataset-test')
    store.close()

    const created = await run(['create', 'manual-set', 'manual', '-d', dir])
    expect(created.ok).toBe(true)
    const id = (created.data as { id: string }).id

    const shown = await run(['show', id, '-d', dir])
    expect(shown.ok).toBe(true)
    const data = shown.data as { dataset: { name: string; entryCount: number }; entries: unknown[] }
    expect(data.dataset.name).toBe('manual-set')
    expect(data.dataset.entryCount).toBe(0)
    expect(data.entries).toEqual([])
  })

  it('capture-traces builds a dataset from real execution_traces rows', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-dataset-traces-'))
    const store = SqliteStore.open(dir)
    store.initProject('dataset-traces-test')
    const now = new Date().toISOString()
    store
      .getDb()
      .prepare(
        `INSERT INTO execution_traces (id, thread_id, tool_name, started_at, status, tokens_in, tokens_out)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('trace1', 'thread1', 'agf_next', now, 'success', 100, 50)
    store.close()

    const captured = await run(['capture-traces', 'from-traces', 'trace1', '-d', dir])
    expect(captured.ok).toBe(true)
    expect((captured.data as { entryCount: number }).entryCount).toBe(1)
  })

  it('capture-decisions builds a dataset from real decision_log rows', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-dataset-decisions-'))
    const store = SqliteStore.open(dir)
    store.initProject('dataset-decisions-test')
    const now = new Date().toISOString()
    store
      .getDb()
      .prepare(
        `INSERT INTO decision_log (id, node_id, decision, confidence_score, evidence, weights_used, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('dec1', 'node_x', 'promote', 0.9, '{}', '{}', now)
    store.close()

    const captured = await run(['capture-decisions', 'from-decisions', '-d', dir])
    expect(captured.ok).toBe(true)
    expect((captured.data as { entryCount: number }).entryCount).toBe(1)
  })

  it('show returns NOT_FOUND for an unknown dataset id', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-dataset-missing-'))
    const store = SqliteStore.open(dir)
    store.initProject('dataset-missing-test')
    store.close()

    const shown = await run(['show', 'dataset_ghost', '-d', dir])
    expect(shown.ok).toBe(false)
    expect(shown.code).toBe('NOT_FOUND')
  })
})
