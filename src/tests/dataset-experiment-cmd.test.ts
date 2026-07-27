/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/dataset-cmd.ts's `experiment` subcommand — wires
 * ExperimentRunner (node_wire_a3791225ac85), which had zero real callers AND
 * zero test coverage despite operating on real tables (eval_experiments,
 * eval_experiment_results). create+run happen in one action to sidestep
 * ExperimentRunner's in-memory-only targetFn (identity default is fine for a
 * CLI-only flow comparing recorded input vs expected_output).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { datasetCommand } from '../cli/commands/dataset-cmd.js'
import { DatasetStore } from '../core/observability/dataset-store.js'

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

describe('agf dataset experiment (node_wire_a3791225ac85)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('run creates + executes an experiment, scoring exact_match against real dataset entries', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-experiment-'))
    const store = SqliteStore.open(dir)
    store.initProject('experiment-test')
    const datasetStore = new DatasetStore(store.getDb())
    const datasetId = datasetStore.createDataset('regression-set', 'manual')
    datasetStore.addEntry(datasetId, { x: 1 }, { x: 1 })
    datasetStore.addEntry(datasetId, { x: 2 }, { x: 999 })
    store.close()

    const result = await run([
      'experiment',
      'run',
      'exact-match-check',
      datasetId,
      '--evaluators',
      'exact_match',
      '-d',
      dir,
    ])
    expect(result.ok).toBe(true)
    const data = result.data as {
      experimentId: string
      summary: { resultCount: number; avgScores: Record<string, number> }
    }
    expect(data.summary.resultCount).toBe(2)
    expect(data.summary.avgScores.exact_match).toBe(0.5)
  })

  it('show returns the completed experiment by id', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-experiment-show-'))
    const store = SqliteStore.open(dir)
    store.initProject('experiment-show-test')
    const datasetStore = new DatasetStore(store.getDb())
    const datasetId = datasetStore.createDataset('set-a', 'manual')
    datasetStore.addEntry(datasetId, { x: 1 }, { x: 1 })
    store.close()

    const created = await run(['experiment', 'run', 'exp-a', datasetId, '--evaluators', 'exact_match', '-d', dir])
    const experimentId = (created.data as { experimentId: string }).experimentId

    const shown = await run(['experiment', 'show', experimentId, '-d', dir])
    expect(shown.ok).toBe(true)
    expect((shown.data as { name: string }).name).toBe('exp-a')
  })

  it('compare shows deltas between two experiments on the same dataset', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-experiment-compare-'))
    const store = SqliteStore.open(dir)
    store.initProject('experiment-compare-test')
    const datasetStore = new DatasetStore(store.getDb())
    const datasetId = datasetStore.createDataset('set-b', 'manual')
    datasetStore.addEntry(datasetId, { x: 1 }, { x: 1 })
    store.close()

    const first = await run(['experiment', 'run', 'exp-1', datasetId, '--evaluators', 'exact_match', '-d', dir])
    const second = await run(['experiment', 'run', 'exp-2', datasetId, '--evaluators', 'exact_match', '-d', dir])
    const id1 = (first.data as { experimentId: string }).experimentId
    const id2 = (second.data as { experimentId: string }).experimentId

    const compared = await run(['experiment', 'compare', id1, id2, '-d', dir])
    expect(compared.ok).toBe(true)
    expect((compared.data as { deltas: Record<string, number> }).deltas.exact_match).toBe(0)
  })
})
