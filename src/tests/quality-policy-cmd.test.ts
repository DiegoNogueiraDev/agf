/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/quality-policy-cmd.ts — wires QualityPolicyStore
 * + evaluatePolicy (node_wire_f13497d80470), which had zero real callers
 * despite operating on a real quality_policies table.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { qualityPolicyCommand } from '../cli/commands/quality-policy-cmd.js'

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
    await qualityPolicyCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf quality-policy (node_wire_f13497d80470)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('create → activate → evaluate blocks when a block-severity gate fails', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-qp-'))
    const store = SqliteStore.open(dir)
    store.initProject('qp-test')
    store.close()

    const gates = JSON.stringify([
      { metric: 'harness_score', operator: '>=', threshold: 70, severity: 'block' },
      { metric: 'coverage', operator: '>=', threshold: 80, severity: 'warn' },
    ])
    const created = await run(['create', 'default-gate', '--gates', gates, '-d', dir])
    expect(created.ok).toBe(true)
    const policyId = (created.data as { id: string }).id

    await run(['activate', policyId, '-d', dir])

    const evaluated = await run([
      'evaluate',
      '--metrics',
      JSON.stringify({ harness_score: 60, coverage: 90 }),
      '-d',
      dir,
    ])
    expect(evaluated.ok).toBe(true)
    const result = evaluated.data as { passed: boolean; blockers: unknown[]; warnings: unknown[] }
    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })

  it('evaluate passes when all gates are satisfied', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-qp-pass-'))
    const store = SqliteStore.open(dir)
    store.initProject('qp-pass-test')
    store.close()

    const gates = JSON.stringify([{ metric: 'harness_score', operator: '>=', threshold: 70, severity: 'block' }])
    const created = await run(['create', 'strict-gate', '--gates', gates, '-d', dir])
    const policyId = (created.data as { id: string }).id
    await run(['activate', policyId, '-d', dir])

    const evaluated = await run(['evaluate', '--metrics', JSON.stringify({ harness_score: 85 }), '-d', dir])
    expect((evaluated.data as { passed: boolean }).passed).toBe(true)
  })

  it('show without an id returns the active policy', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-qp-show-'))
    const store = SqliteStore.open(dir)
    store.initProject('qp-show-test')
    store.close()

    const gates = JSON.stringify([{ metric: 'x', operator: '>=', threshold: 1, severity: 'warn' }])
    const created = await run(['create', 'shown-gate', '--gates', gates, '-d', dir])
    const policyId = (created.data as { id: string }).id
    await run(['activate', policyId, '-d', dir])

    const shown = await run(['show', '-d', dir])
    expect(shown.ok).toBe(true)
    expect((shown.data as { name: string }).name).toBe('shown-gate')
  })

  it('every fresh project has the seeded "default" policy already active (migration seed)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-qp-default-'))
    const store = SqliteStore.open(dir)
    store.initProject('qp-default-test')
    store.close()

    const shown = await run(['show', '-d', dir])
    expect(shown.ok).toBe(true)
    expect((shown.data as { name: string }).name).toBe('default')
  })

  it('show returns NOT_FOUND for a bogus policy id', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-qp-bogus-'))
    const store = SqliteStore.open(dir)
    store.initProject('qp-bogus-test')
    store.close()

    const shown = await run(['show', 'policy_ghost', '-d', dir])
    expect(shown.ok).toBe(false)
    expect(shown.code).toBe('NOT_FOUND')
  })
})
