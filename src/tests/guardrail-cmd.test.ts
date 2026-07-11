/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/guardrail-cmd.ts — wires GuardrailStore
 * (node_wire_d447eb2bb73f), which had zero real callers despite operating
 * on a real guardrail_executions table.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { guardrailCommand } from '../cli/commands/guardrail-cmd.js'
import { TraceStore } from '../core/observability/trace-store.js'

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
    await guardrailCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf guardrail (node_wire_d447eb2bb73f)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('record → by-trace returns the recorded execution', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gr-'))
    const store = SqliteStore.open(dir)
    store.initProject('gr-test')
    const traceId = new TraceStore(store.getDb()).beginTrace('thread-1', null, 'tool-1')
    store.close()

    const recorded = await run([
      'record',
      traceId,
      'schema-valid',
      'pre',
      '--passed',
      '--score',
      '1',
      '--latency',
      '5',
      '--strategy',
      'fail_closed',
      '--details',
      'ok',
      '-d',
      dir,
    ])
    expect(recorded.ok).toBe(true)

    const byTrace = await run(['by-trace', traceId, '-d', dir])
    expect(byTrace.ok).toBe(true)
    const executions = byTrace.data as { executions: { name: string; passed: boolean }[] }
    expect(executions.executions).toHaveLength(1)
    expect(executions.executions[0].name).toBe('schema-valid')
    expect(executions.executions[0].passed).toBe(true)
  })

  it('pass-rate returns 1 when nothing recorded for the trace', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gr-empty-'))
    const store = SqliteStore.open(dir)
    store.initProject('gr-empty-test')
    store.close()

    const rate = await run(['pass-rate', 'trace-none', '-d', dir])
    expect(rate.ok).toBe(true)
    expect((rate.data as { passRate: number }).passRate).toBe(1)
  })

  it('pass-rate reflects a mix of passed and failed executions', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gr-mixed-'))
    const store = SqliteStore.open(dir)
    store.initProject('gr-mixed-test')
    const traceId = new TraceStore(store.getDb()).beginTrace('thread-2', null, 'tool-2')
    store.close()

    await run([
      'record',
      traceId,
      'a',
      'pre',
      '--passed',
      '--score',
      '1',
      '--latency',
      '1',
      '--strategy',
      'fail_closed',
      '--details',
      'ok',
      '-d',
      dir,
    ])
    await run([
      'record',
      traceId,
      'b',
      'post',
      '--score',
      '0',
      '--latency',
      '1',
      '--strategy',
      'fail_open',
      '--details',
      'bad',
      '-d',
      dir,
    ])

    const rate = await run(['pass-rate', traceId, '-d', dir])
    expect((rate.data as { passRate: number }).passRate).toBe(0.5)
  })
})
