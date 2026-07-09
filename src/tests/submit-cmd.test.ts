/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * D3 — agf submit (modo delegado). Núcleo puro: valida o resultado do executor,
 * roda o gate, grava desvios como findings e marca done — sem spawnar vitest/DB.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { submitPipeline, submitCommand, type SubmitDeps } from '../cli/commands/submit-cmd.js'
import type { ExecutorResult } from '../core/context/executor-brief.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { SqliteLearningStore } from '../core/learning/sqlite-learning-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function baseDeps(over: Partial<SubmitDeps> = {}): SubmitDeps {
  return {
    getTask: () => ({ id: 't1', title: 'Task' }),
    runBlast: () => ({ passed: true }),
    runDoD: () => ({ passed: true, score: 90, grade: 'A' }),
    recordDeviations: () => [],
    markDone: () => {},
    ...over,
  }
}

const okResult: ExecutorResult = { arquivos: ['a.ts'], testes: { passed: 3, failed: 0 }, desvios: [] }

describe('submitPipeline — loop delegado', () => {
  it('aceita e marca done quando blast verde + DoD ok', () => {
    const markDone = vi.fn()
    const r = submitPipeline('t1', okResult, baseDeps({ markDone }))
    expect(r.accepted).toBe(true)
    expect(markDone).toHaveBeenCalledWith('t1')
  })

  it('rejeita quando o executor reportou falhas (sem marcar done)', () => {
    const markDone = vi.fn()
    const r = submitPipeline('t1', { ...okResult, testes: { passed: 1, failed: 2 } }, baseDeps({ markDone }))
    expect(r.accepted).toBe(false)
    if (!r.accepted) expect(r.code).toBe('TESTS_FAILED')
    expect(markDone).not.toHaveBeenCalled()
  })

  it('rejeita quando o gate blast falha (não confia no relatório)', () => {
    const markDone = vi.fn()
    const r = submitPipeline('t1', okResult, baseDeps({ runBlast: () => ({ passed: false, output: 'red' }), markDone }))
    expect(r.accepted).toBe(false)
    if (!r.accepted) expect(r.code).toBe('TESTS_FAILED')
    expect(markDone).not.toHaveBeenCalled()
  })

  it('rejeita quando DoD falha', () => {
    const r = submitPipeline('t1', okResult, baseDeps({ runDoD: () => ({ passed: false, score: 40, grade: 'F' }) }))
    expect(r.accepted).toBe(false)
    if (!r.accepted) expect(r.code).toBe('DOD_FAILED')
  })

  it('task inexistente → NOT_FOUND', () => {
    const r = submitPipeline('t1', okResult, baseDeps({ getTask: () => null }))
    expect(r.accepted).toBe(false)
    if (!r.accepted) expect(r.code).toBe('NOT_FOUND')
  })

  it('materializa desvios como findings quando aceito', () => {
    const recordDeviations = vi.fn(() => ['node_d1'])
    const r = submitPipeline('t1', { ...okResult, desvios: ['mudei o default X'] }, baseDeps({ recordDeviations }))
    expect(r.accepted).toBe(true)
    if (r.accepted) expect(r.findingIds).toEqual(['node_d1'])
    expect(recordDeviations).toHaveBeenCalledWith('t1', ['mudei o default X'])
  })
})

describe('submit command registration', () => {
  it('exports submitCommand', async () => {
    const mod = await import('../cli/commands/submit-cmd.js')
    expect(typeof mod.submitCommand).toBe('function')
  })
})

describe('submit — finalize parity + token capture (delegate ↔ live unified)', () => {
  let dir: string

  function seedNode(id: string): void {
    const store = SqliteStore.open(dir)
    if (!store.getProject()) store.initProject('submit-int-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id,
      type: 'task',
      title: `Delegated ${id}`,
      status: 'in_progress', // status_flow_valid: passou por in_progress
      priority: 3,
      acceptanceCriteria: ['Dado um input válido, quando submetido, então retorna ok'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()
  }

  async function runSubmit(args: string[]): Promise<void> {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const prevExit = process.exitCode
    await submitCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
  }

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('records a delegated llm_call_ledger row + a delegate learning record when tokens are given', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-submit-tok-'))
    seedNode('t_tok')
    const result = JSON.stringify({ arquivos: ['x.ts'], testes: { passed: 2, failed: 0 }, desvios: [] })
    await runSubmit([
      't_tok',
      '--result',
      result,
      '--dir',
      dir,
      '--skip-test',
      '--tokens-in',
      '100',
      '--tokens-out',
      '50',
      '--model',
      'test-x',
    ])

    const store = SqliteStore.open(dir)
    const row = store
      .getDb()
      .prepare(
        "SELECT input_tokens AS i, output_tokens AS o, provider AS p FROM llm_call_ledger WHERE node_id = 't_tok'",
      )
      .get() as { i: number; o: number; p: string } | undefined
    expect(row).toBeDefined()
    expect(row?.i).toBe(100)
    expect(row?.o).toBe(50)
    expect(row?.p).toBe('delegated')

    const learning = new SqliteLearningStore(store).readAll()
    expect(learning.some((r) => r.nodeId === 't_tok' && r.agentId === 'delegate')).toBe(true)
    store.close()
  })

  it('writes NO llm_call_ledger row when tokens are omitted (byte-identical ledger)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-submit-notok-'))
    seedNode('t_notok')
    const result = JSON.stringify({ arquivos: ['y.ts'], testes: { passed: 1, failed: 0 }, desvios: [] })
    await runSubmit(['t_notok', '--result', result, '--dir', dir, '--skip-test'])

    const store = SqliteStore.open(dir)
    const count = store
      .getDb()
      .prepare("SELECT COUNT(*) AS c FROM llm_call_ledger WHERE node_id = 't_notok'")
      .get() as { c: number }
    expect(count.c).toBe(0)
    store.close()
  })
})
