/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/done-cmd.ts — wires flaky-test-detector.ts
 * (node_wire_4282e60f640d) so a sampled agf done reruns the test gate
 * DEFAULT_RERUN_COUNT times and surfaces a FLAKY_TEST_SUSPECTED warning
 * when outcomes mix pass/fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

vi.mock('../core/hooks/flaky-test-detector.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/hooks/flaky-test-detector.js')>()
  return { ...actual, shouldSampleFlakyCheck: vi.fn() }
})

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

describe('agf done — flaky-test-detector integration (node_wire_4282e60f640d)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-flaky-detector-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
    writeFileSync(join(dir, 'src/core/util.ts'), 'export function util(s) { return s.trim() }\n')
    writeFileSync(join(dir, 'src/tests/util.test.ts'), "import '../corpus/real.js'\n")
    mkdirSync(join(dir, 'src/corpus'), { recursive: true })
    writeFileSync(join(dir, 'src/corpus/real.ts'), 'export const real = 1\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })
    gateResults.length = 0
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function addNode(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'in_progress',
      priority: 2,
      acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
      implementationFiles: ['src/core/util.ts'],
      testFiles: ['src/tests/util.test.ts'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  it('surfaces FLAKY_TEST_SUSPECTED when sampled reruns mix pass/fail', async () => {
    const { shouldSampleFlakyCheck } = await import('../core/hooks/flaky-test-detector.js')
    vi.mocked(shouldSampleFlakyCheck).mockReturnValue(true)

    gateResults.push(
      { ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r1' },
      { ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r2' },
      { ran: true, passed: false, runner: 'vitest', exitCode: 1, receipt: 'r3' },
    )

    const store = SqliteStore.open(dir)
    store.initProject('flaky-test')
    addNode(store, 'node_1')
    store.close()

    writeFileSync(join(dir, 'src/core/util.ts'), 'export function util(s) { return s.trim().toLowerCase() }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_1', dir)
    const data = envelope.data as { warnings?: string[] }
    expect(envelope.ok).toBe(true)
    expect(data.warnings?.some((w) => w.startsWith('FLAKY_TEST_SUSPECTED'))).toBe(true)
  })

  it('does not surface a flaky warning when all sampled reruns pass', async () => {
    const { shouldSampleFlakyCheck } = await import('../core/hooks/flaky-test-detector.js')
    vi.mocked(shouldSampleFlakyCheck).mockReturnValue(true)

    gateResults.push(
      { ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r1' },
      { ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r2' },
      { ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r3' },
    )

    const store = SqliteStore.open(dir)
    store.initProject('flaky-test-2')
    addNode(store, 'node_2')
    store.close()

    writeFileSync(join(dir, 'src/core/util.ts'), 'export function util(s) { return s.trim().toUpperCase() }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_2', dir)
    const data = envelope.data as { warnings?: string[] }
    expect(envelope.ok).toBe(true)
    expect(data.warnings?.some((w) => w.startsWith('FLAKY_TEST_SUSPECTED'))).toBeFalsy()
  })

  it('does not rerun at all when not sampled (default 5% rate)', async () => {
    const { shouldSampleFlakyCheck } = await import('../core/hooks/flaky-test-detector.js')
    vi.mocked(shouldSampleFlakyCheck).mockReturnValue(false)

    gateResults.push({ ran: true, passed: true, runner: 'vitest', exitCode: 0, receipt: 'r1' })

    const store = SqliteStore.open(dir)
    store.initProject('flaky-test-3')
    addNode(store, 'node_3')
    store.close()

    writeFileSync(join(dir, 'src/core/util.ts'), 'export function util(s) { return s }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_3', dir)
    expect(envelope.ok).toBe(true)
    expect(gateResults.length).toBe(0)
  })
})
