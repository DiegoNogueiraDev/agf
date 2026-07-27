/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/prediction-feedback-cmd.ts — wires
 * feedback-loop.ts's createFeedbackStore (node_wire_c55d52129416), which had
 * zero real callers despite being a complete, tested, self-migrating store.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { predictionFeedbackCommand } from '../cli/commands/prediction-feedback-cmd.js'

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
    await predictionFeedbackCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf prediction-feedback (node_wire_c55d52129416)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('record → list roundtrips a real prediction_feedback row', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pred-fb-'))
    const store = SqliteStore.open(dir)
    store.initProject('pred-fb-test')
    store.close()

    const recorded = await run([
      'record',
      'is X thread-safe?',
      'yes, always',
      'no — only when called from the main event loop',
      '-d',
      dir,
    ])
    expect(recorded.ok).toBe(true)
    expect(typeof (recorded.data as { id: string }).id).toBe('string')

    const listed = await run(['list', '-d', dir])
    const records = (listed.data as { records: Array<{ query: string; correction: string }> }).records
    expect(records).toHaveLength(1)
    expect(records[0].query).toBe('is X thread-safe?')
  })

  it('search finds a past correction by substring match', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pred-fb-search-'))
    const store = SqliteStore.open(dir)
    store.initProject('pred-fb-search-test')
    store.close()

    await run(['record', 'does createDatabase take a dir?', 'yes', 'no, it takes a file path', '-d', dir])
    const found = await run(['search', 'createDatabase', '-d', dir])
    const records = (found.data as { records: Array<{ correction: string }> }).records
    expect(records).toHaveLength(1)
    expect(records[0].correction).toContain('file path')
  })

  it('search returns empty for an unrelated query', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pred-fb-nomatch-'))
    const store = SqliteStore.open(dir)
    store.initProject('pred-fb-nomatch-test')
    store.close()

    await run(['record', 'some query', 'wrong', 'right', '-d', dir])
    const found = await run(['search', 'completely unrelated topic', '-d', dir])
    expect((found.data as { records: unknown[] }).records).toEqual([])
  })
})
