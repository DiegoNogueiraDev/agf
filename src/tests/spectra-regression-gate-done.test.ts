/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/done-cmd.ts — wires spectra-regression-gate.ts
 * (node_wire_741ead0b17ca) so every `agf done` compares the 5 behaviour
 * spectra (buildSpectraFromStore) against the last-recorded project_settings
 * baseline, emitting spectra:regression when any spectrum drops beyond the
 * threshold, then updates the baseline for next time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const gateResults: Array<{ ran: boolean; passed: boolean; runner: string; exitCode: number; receipt: string }> = []
vi.mock('../core/runner/execute-test-gate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/runner/execute-test-gate.js')>()
  return {
    ...actual,
    runResolvedTestGate: vi.fn(() => gateResults.shift()),
  }
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runDone(taskId: string, dir: string): Promise<Record<string, unknown>> {
  const { doneCommand } = await import('../cli/commands/done-cmd.js')
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await doneCommand().parseAsync([taskId, '-d', dir], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

function addNode(store: SqliteStore, id: string, file: string, testFile: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'in_progress',
    priority: 2,
    acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
    implementationFiles: [file],
    testFiles: [testFile],
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

describe('agf done — spectra-regression-gate integration (node_wire_741ead0b17ca)', () => {
  let dir: string
  let prevFlakyDetector: string | undefined

  beforeEach(() => {
    // node_2e73e0bd4b2f/node_316bf: este teste NÃO exercita a amostragem flaky.
    // Sem desligar o detector, o sampler aleatório de 5% (shouldSampleFlakyCheck →
    // Math.random) dispara ~1 em 20 runs e o `done` re-roda o gate mockado, que só
    // tem 1 resultado empurrado → gateResults.shift() = undefined → rerun.passed
    // crasha. Desligar via a chave de produção torna o teste determinístico.
    prevFlakyDetector = process.env.MCP_GRAPH_FLAKY_DETECTOR
    process.env.MCP_GRAPH_FLAKY_DETECTOR = 'off'
    _resetSharedHookBus()
    dir = mkdtempSync(join(tmpdir(), 'agf-spectra-gate-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
    writeFileSync(join(dir, 'src/core/a.ts'), 'export function a() { return 1 }\n')
    writeFileSync(join(dir, 'src/tests/a.test.ts'), 'export const t = 1\n')
    writeFileSync(join(dir, 'src/core/b.ts'), 'export function b() { return 2 }\n')
    writeFileSync(join(dir, 'src/tests/b.test.ts'), 'export const t2 = 1\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })
    gateResults.length = 0
  })

  afterEach(() => {
    _resetSharedHookBus()
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
    if (prevFlakyDetector === undefined) delete process.env.MCP_GRAPH_FLAKY_DETECTOR
    else process.env.MCP_GRAPH_FLAKY_DETECTOR = prevFlakyDetector
  })

  it('writes a spectra_baseline project setting after the first agf done', async () => {
    gateResults.push({ ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r1' })

    const store = SqliteStore.open(dir)
    store.initProject('spectra-test')
    addNode(store, 'node_1', 'src/core/a.ts', 'src/tests/a.test.ts')
    store.close()

    writeFileSync(join(dir, 'src/core/a.ts'), 'export function a() { return 11 }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_1', dir)
    expect(envelope.ok).toBe(true)

    const after = SqliteStore.open(dir)
    const baseline = after.getProjectSetting('spectra_baseline')
    after.close()
    expect(baseline).not.toBeNull()
    const parsed = JSON.parse(baseline as string)
    expect(parsed).toHaveProperty('autonomy')
    expect(parsed).toHaveProperty('precision')
    expect(parsed).toHaveProperty('selfLearning')
    expect(parsed).toHaveProperty('selfHealing')
    expect(parsed).toHaveProperty('memory')
  })

  it('emits spectra:regression when the stored baseline is artificially higher than current', async () => {
    gateResults.push({ ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r1' })

    const store = SqliteStore.open(dir)
    store.initProject('spectra-test-2')
    addNode(store, 'node_2', 'src/core/b.ts', 'src/tests/b.test.ts')
    // Force an inflated baseline that MUST be higher than whatever the real
    // current score computes to (every spectrum maxed at 100), guaranteeing
    // a real, non-invented regression signal on this run.
    store.setProjectSetting(
      'spectra_baseline',
      JSON.stringify({ autonomy: 100, precision: 100, selfLearning: 100, selfHealing: 100, memory: 100 }),
    )
    store.close()

    const events: Array<{ payload: Record<string, unknown> }> = []
    getSharedHookBus().on('spectra:regression', (e) => events.push(e))

    writeFileSync(join(dir, 'src/core/b.ts'), 'export function b() { return 22 }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_2', dir)
    expect(envelope.ok).toBe(true)
    expect(events).toHaveLength(1)
    expect((events[0].payload.regressedSpectra as string[]).length).toBeGreaterThan(0)
  })
})
