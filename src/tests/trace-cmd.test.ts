/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/trace-cmd.ts — wires TraceStore
 * (node_wire_4e7e10cdde07), the missing WRITER for execution_traces (agf
 * dataset capture-traces already reads it, nothing wrote to it before this).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { traceCommand } from '../cli/commands/trace-cmd.js'
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
    await traceCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf trace (node_wire_4e7e10cdde07)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('begin → end roundtrips a real execution_traces row', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-trace-'))
    const store = SqliteStore.open(dir)
    store.initProject('trace-test')
    store.close()

    const begun = await run(['begin', 'thread1', 'agf_next', '--node-id', 'node_x', '-d', dir])
    expect(begun.ok).toBe(true)
    const traceId = (begun.data as { traceId: string }).traceId

    const ended = await run([
      'end',
      traceId,
      'completed',
      '--tokens-in',
      '100',
      '--tokens-out',
      '50',
      '--cost',
      '0.01',
      '-d',
      dir,
    ])
    expect(ended.ok).toBe(true)

    const shown = await run(['show', traceId, '-d', dir])
    expect(shown.ok).toBe(true)
    const data = shown.data as { trace: { status: string; tokensIn: number; nodeId: string } }
    expect(data.trace.status).toBe('completed')
    expect(data.trace.tokensIn).toBe(100)
    expect(data.trace.nodeId).toBe('node_x')
  })

  it('end rejects an invalid status', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-trace-badstatus-'))
    const store = SqliteStore.open(dir)
    store.initProject('trace-badstatus-test')
    store.close()

    const begun = await run(['begin', 'thread1', 'agf_next', '-d', dir])
    const traceId = (begun.data as { traceId: string }).traceId
    const ended = await run(['end', traceId, 'bogus', '-d', dir])
    expect(ended.ok).toBe(false)
    expect(ended.code).toBe('INVALID_STATUS')
  })

  it('cost aggregates real trace data — feeds agf dataset capture-traces downstream', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-trace-cost-'))
    const store = SqliteStore.open(dir)
    store.initProject('trace-cost-test')
    store.close()

    const begun = await run(['begin', 'thread1', 'agf_next', '--node-id', 'node_y', '-d', dir])
    const traceId = (begun.data as { traceId: string }).traceId
    await run(['end', traceId, 'completed', '--tokens-in', '200', '--tokens-out', '100', '--cost', '0.02', '-d', dir])

    const cost = await run(['cost', 'node_y', '-d', dir])
    expect(cost.ok).toBe(true)
    const data = cost.data as { totalTokens: number; estimatedCostUsd: number; traceCount: number }
    expect(data.totalTokens).toBe(300)
    expect(data.traceCount).toBe(1)

    // Real downstream consumer already wired this session: agf dataset capture-traces
    const readBack = SqliteStore.open(dir)
    const datasetId = new DatasetStore(readBack.getDb()).captureFromTraces('from-real-trace', [traceId])
    const entries = new DatasetStore(readBack.getDb()).getEntries(datasetId)
    readBack.close()
    expect(entries).toHaveLength(1)
    expect(entries[0].input.toolName).toBe('agf_next')
  })

  it('show returns NOT_FOUND for an unknown trace id', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-trace-missing-'))
    const store = SqliteStore.open(dir)
    store.initProject('trace-missing-test')
    store.close()

    const shown = await run(['show', 'trace_ghost', '-d', dir])
    expect(shown.ok).toBe(false)
    expect(shown.code).toBe('NOT_FOUND')
  })
})
