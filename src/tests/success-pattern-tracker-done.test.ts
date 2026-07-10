/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/done-cmd.ts — wires success-pattern-tracker.ts
 * (node_wire_3bef2c6cfc53) so 3+ grade-A finishes sharing a tag distill into
 * a strategy memory file. Mirrors the existing DoD-failure lesson path.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { doneCommand } from '../cli/commands/done-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runDone(taskId: string, dir: string): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await doneCommand().parseAsync([taskId, '-d', dir, '--skip-test'], { from: 'user' })
    await new Promise((r) => setTimeout(r, 0))
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf done — success-pattern-tracker integration (node_wire_3bef2c6cfc53)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function addGradeANode(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'in_progress',
      priority: 2,
      description: 'A real description of the task. Tamanho: S',
      acceptanceCriteria: [
        `Given the string '  a  ', When util(s) is called for ${id}, Then the returned string equals "a" (length 1)`,
      ],
      implementationFiles: ['src/core/util.ts'],
      testFiles: ['src/tests/util.test.ts'],
      tags: ['pattern-shared'],
      xpSize: 'S',
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  it('writes a strategy memory file after the 3rd grade-A finish sharing a tag', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-success-pattern-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
    writeFileSync(
      join(dir, 'src/core/util.ts'),
      '/** Trims a string. */\nexport function util(s) { return s.trim() }\n',
    )
    writeFileSync(
      join(dir, 'src/tests/util.test.ts'),
      "import { describe, it, expect } from 'vitest'\nimport { util } from '../core/util.js'\ndescribe('util', () => { it('trims', () => { expect(util(' a ')).toBe('a') }) })\n",
    )
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })

    const store = SqliteStore.open(dir)
    store.initProject('success-pattern-test')
    addGradeANode(store, 'node_a')
    addGradeANode(store, 'node_b')
    addGradeANode(store, 'node_c')
    store.close()

    function touchAndStage(): void {
      writeFileSync(
        join(dir, 'src/core/util.ts'),
        `/** Trims a string. */\nexport function util(s) { return s.trim() } // ${Date.now()}\n`,
      )
      execSync('git add -A', { cwd: dir })
    }

    touchAndStage()
    const first = await runDone('node_a', dir)
    expect(first.ok).toBe(true)
    expect((first.data as { dodGrade: string }).dodGrade).toBe('A')

    touchAndStage()
    const second = await runDone('node_b', dir)
    expect(second.ok).toBe(true)

    const memoriesDir = join(dir, 'workflow-graph', 'memories')
    const memoryDirBefore = existsSync(memoriesDir)
      ? readdirSync(memoriesDir).filter((f) => f.startsWith('strategy_'))
      : []
    expect(memoryDirBefore.length).toBe(0)

    touchAndStage()
    const third = await runDone('node_c', dir)
    expect(third.ok).toBe(true)
    // writeMemory is fire-and-forget (same pattern as fireFeedbackOutcome) —
    // give its microtask a tick to flush before asserting on the filesystem.
    await new Promise((r) => setTimeout(r, 20))

    const strategyFiles = readdirSync(memoriesDir).filter((f) => f.startsWith('strategy_') && f.endsWith('.md'))
    expect(strategyFiles.length).toBe(1)
  })
})
