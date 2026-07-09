/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/done-cmd.ts — wires case-distillation.ts's
 * buildCaseMemory (node_wire_3111ce1fe056) so a single grade-A finish with a
 * meaningful rationale + observed test files distills into a case-based
 * memory the next similar task can retrieve via RAG. Mirrors the existing
 * success-pattern-memory path (same grade-A block), but per-task, not
 * aggregate-across-3-finishes.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
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
    await new Promise((r) => setTimeout(r, 20))
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf done — case-distillation integration (node_wire_3111ce1fe056)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a case_<nodeId>_<date>.md memory after a single grade-A finish with a real rationale + testFiles', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-case-distill-'))
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
    store.initProject('case-distill-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_case',
      type: 'task',
      title: 'Trim helper',
      status: 'in_progress',
      priority: 2,
      description:
        'Extracted a shared trim helper used by three call sites. Kept the API minimal and covered edge cases (empty string, all-whitespace) with dedicated assertions.',
      acceptanceCriteria: [
        'Given the string \'  a  \', When util(s) is called, Then the returned string equals "a" (length 1)',
      ],
      implementationFiles: ['src/core/util.ts'],
      testFiles: ['src/tests/util.test.ts'],
      tags: ['string-utils'],
      xpSize: 'S',
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    writeFileSync(
      join(dir, 'src/core/util.ts'),
      `/** Trims a string. */\nexport function util(s) { return s.trim() } // ${Date.now()}\n`,
    )
    execSync('git add -A', { cwd: dir })

    const result = await runDone('node_case', dir)
    expect(result.ok).toBe(true)
    expect((result.data as { dodGrade: string }).dodGrade).toBe('A')

    const memoriesDir = join(dir, 'workflow-graph', 'memories')
    expect(existsSync(memoriesDir)).toBe(true)
    const caseFiles = readdirSync(memoriesDir).filter((f) => f.startsWith('case_node_case_'))
    expect(caseFiles).toHaveLength(1)
    const content = readFileSync(join(memoriesDir, caseFiles[0]), 'utf-8')
    expect(content).toContain('Trim helper')
    expect(content).toContain('src/tests/util.test.ts')
  })
})
