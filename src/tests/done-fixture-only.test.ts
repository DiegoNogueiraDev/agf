/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_61e14cd0711a — fixture_only gate: refuse done on core modules
 * without a corpus test. Most expensive real pattern this session: test
 * green on a small hand-built fixture, bug only appeared against the real
 * corpus. isFixtureOnlyDelivery mirrors detect-phantom-done.ts's pure DIP
 * shape — no filesystem I/O, just content strings the gate reads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isFixtureOnlyDelivery } from '../core/gaps/detect-fixture-only.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { doneCommand } from '../cli/commands/done-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('isFixtureOnlyDelivery', () => {
  it('flags a core module (parser) whose test only imports __fixtures__', () => {
    const flagged = isFixtureOnlyDelivery(['src/core/parser.ts'], ["import { x } from '../__fixtures__/x.js'\n"])
    expect(flagged).toBe(true)
  })

  it('does not flag a core module whose test imports from corpus/', () => {
    const flagged = isFixtureOnlyDelivery(['src/core/parser.ts'], ["import { x } from '../corpus/real.js'\n"])
    expect(flagged).toBe(false)
  })

  it('does not flag a non-core module (exempt) even with fixture-only tests', () => {
    const flagged = isFixtureOnlyDelivery(['src/ui/button.ts'], ["import { x } from '../__fixtures__/x.js'\n"])
    expect(flagged).toBe(false)
  })

  it('does not flag when there are no test files at all (a different DoD concern)', () => {
    expect(isFixtureOnlyDelivery(['src/core/parser.ts'], [])).toBe(false)
  })

  it('recognizes interpreter/compiler/lexer/tokenizer path patterns as corpus-scale modules too', () => {
    expect(isFixtureOnlyDelivery(['src/interpreter.ts'], ['no corpus ref here\n'])).toBe(true)
    expect(isFixtureOnlyDelivery(['src/compiler.ts'], ['no corpus ref here\n'])).toBe(true)
    expect(isFixtureOnlyDelivery(['src/lexer.ts'], ['no corpus ref here\n'])).toBe(true)
    expect(isFixtureOnlyDelivery(['src/tokenizer.ts'], ['no corpus ref here\n'])).toBe(true)
  })

  it('node_927af0ce2f93: does NOT flag a generic src/core/ file that is not a parser/interpreter/compiler', () => {
    // Regression: the previous (^|\/)core\//i fallback matched almost every
    // file under src/core/, forcing --force on 10 legitimate pure-function
    // wires this session with zero actual corpus-scale parsers among them.
    expect(isFixtureOnlyDelivery(['src/core/utils/helper.ts'], ['no corpus ref here\n'])).toBe(false)
  })

  it('node_30c368c6e1a5: does NOT flag a file merely UNDER a parser/ directory (dir-only match)', () => {
    // Medido: dos 27 arquivos que casavam o padrão de PATH, 20 (74%) casavam só
    // pelo diretório src/core/parser/ (classify.ts, read-yaml.ts, normalize.ts…),
    // que são classificadores/leitores, não parsers de gramática — forçando
    // --force (que pula os testes) em trabalho legítimo. O papel vem do BASENAME.
    expect(isFixtureOnlyDelivery(['src/core/parser/classify.ts'], ['fixtures only\n'])).toBe(false)
    expect(isFixtureOnlyDelivery(['src/core/parser/read-yaml.ts'], ['fixtures only\n'])).toBe(false)
  })

  it('AINDA flaga um parser de verdade pelo basename (prd-format-parser.ts)', () => {
    // A guarda continua mordendo o caso real: um módulo cujo NOME diz que parseia.
    expect(isFixtureOnlyDelivery(['src/core/parser/prd-format-parser.ts'], ['fixtures only\n'])).toBe(true)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runDone(taskId: string, dir: string, extraArgs: string[] = []): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await doneCommand().parseAsync([taskId, '-d', dir, '--skip-test', ...extraArgs], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf done — FIXTURE_ONLY gate', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-fixture-only-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    mkdirSync(join(dir, 'src/tests'), { recursive: true })
    writeFileSync(join(dir, 'src/core/parser.ts'), 'export function parse(s: string) { return s }\n')
    writeFileSync(join(dir, 'src/tests/parser.test.ts'), "import '../__fixtures__/x.js'\n")
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function addNode(store: SqliteStore, overrides: Partial<GraphNode> & { id: string }): void {
    const now = new Date().toISOString()
    store.insertNode({
      type: 'task',
      title: overrides.id,
      status: 'in_progress',
      priority: 2,
      acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as GraphNode)
  }

  it('refuses done with FIXTURE_ONLY when a core module test only imports __fixtures__', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('fixture-only-test')
    addNode(store, {
      id: 'node_1',
      implementationFiles: ['src/core/parser.ts'],
      testFiles: ['src/tests/parser.test.ts'],
    })
    store.close()

    writeFileSync(join(dir, 'src/core/parser.ts'), 'export function parse(s: string) { return s.trim() }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_1', dir)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('FIXTURE_ONLY')
  })

  it('passes the gate when the test references corpus/', async () => {
    mkdirSync(join(dir, 'src/corpus'), { recursive: true })
    writeFileSync(join(dir, 'src/corpus/real.ts'), 'export const real = 1\n')
    writeFileSync(join(dir, 'src/tests/parser.test.ts'), "import '../corpus/real.js'\n")
    execSync('git add -A && git commit -q -m corpus', { cwd: dir })

    const store = SqliteStore.open(dir)
    store.initProject('fixture-only-test')
    addNode(store, {
      id: 'node_2',
      implementationFiles: ['src/core/parser.ts'],
      testFiles: ['src/tests/parser.test.ts'],
    })
    store.close()

    writeFileSync(join(dir, 'src/core/parser.ts'), 'export function parse(s: string) { return s.trim() }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_2', dir)
    expect(envelope.ok).toBe(true)
  })

  it('passes the gate for a non-core module even with fixture-only tests', async () => {
    mkdirSync(join(dir, 'src/ui'), { recursive: true })
    writeFileSync(join(dir, 'src/ui/button.ts'), 'export function Button() { return null }\n')
    execSync('git add -A && git commit -q -m ui', { cwd: dir })

    const store = SqliteStore.open(dir)
    store.initProject('fixture-only-test')
    addNode(store, {
      id: 'node_3',
      implementationFiles: ['src/ui/button.ts'],
      testFiles: ['src/tests/parser.test.ts'],
    })
    store.close()

    writeFileSync(join(dir, 'src/ui/button.ts'), 'export function Button() { return "x" }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_3', dir)
    expect(envelope.ok).toBe(true)
  })

  it('--force bypasses FIXTURE_ONLY', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('fixture-only-test')
    addNode(store, {
      id: 'node_4',
      implementationFiles: ['src/core/parser.ts'],
      testFiles: ['src/tests/parser.test.ts'],
    })
    store.close()

    writeFileSync(join(dir, 'src/core/parser.ts'), 'export function parse(s: string) { return s.trim() }\n')
    execSync('git add -A', { cwd: dir })

    const envelope = await runDone('node_4', dir, ['--force'])
    expect(envelope.ok).toBe(true)
  })
})
