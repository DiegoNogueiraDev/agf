/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { runMutationGate, type MutationGateDeps } from '../core/quality/mutation-gate-runner.js'
import type { MutationSpec } from '../core/quality/mutation-runner.js'

/** Source with one `&&` and one `===` so two default-ish specs match. */
const SOURCE = 'export const ok = (a: number, b: number): boolean => a === b && a > 0\n'

const SPECS: MutationSpec[] = [
  { name: 'equality-strict', pattern: /===/, replacement: '!==' },
  { name: 'logical-and', pattern: /&&/, replacement: '||' },
  { name: 'never-matches', pattern: /ZZZ_NO_MATCH/, replacement: 'X' },
]

function makeDeps(runTest: (testFile: string) => boolean): { deps: MutationGateDeps; writes: string[] } {
  const writes: string[] = []
  let current = SOURCE
  const deps: MutationGateDeps = {
    readSource: () => current,
    writeSource: (_f, content) => {
      current = content
      writes.push(content)
    },
    runTest,
  }
  return { deps, writes }
}

describe('runMutationGate', () => {
  it('kills every mutant when the test run fails (tests catch the change)', () => {
    const { deps } = makeDeps(() => false) // tests fail → mutant killed
    const { summary, gate } = runMutationGate({ sourceFile: 's.ts', testFile: 't.ts', specs: SPECS }, deps)
    expect(summary.total).toBe(2) // never-matches generates no mutant
    expect(summary.killed).toBe(2)
    expect(gate.pass).toBe(true)
  })

  it('reports survivors and fails the gate when the test run passes', () => {
    const { deps } = makeDeps(() => true) // tests pass → mutant survived
    const { summary, gate } = runMutationGate({ sourceFile: 's.ts', testFile: 't.ts', specs: SPECS }, deps)
    expect(summary.survived).toBe(2)
    expect(gate.pass).toBe(false)
    expect(gate.survivedCount).toBe(2)
  })

  it('always restores the original source as the final write', () => {
    const { deps, writes } = makeDeps(() => false)
    runMutationGate({ sourceFile: 's.ts', testFile: 't.ts', specs: SPECS }, deps)
    expect(writes[writes.length - 1]).toBe(SOURCE)
  })

  it('treats a crashing test runner as a kill (no false-negative)', () => {
    const { deps } = makeDeps(() => {
      throw new Error('runner blew up')
    })
    const { summary, gate } = runMutationGate({ sourceFile: 's.ts', testFile: 't.ts', specs: SPECS }, deps)
    expect(summary.killed).toBe(2)
    expect(gate.pass).toBe(true)
  })

  it('passes the gate with total=0 when no spec matches (no false positive)', () => {
    const { deps } = makeDeps(() => true)
    const onlyNoMatch: MutationSpec[] = [{ name: 'never', pattern: /ZZZ_NO_MATCH/, replacement: 'X' }]
    const { summary, gate } = runMutationGate({ sourceFile: 's.ts', testFile: 't.ts', specs: onlyNoMatch }, deps)
    expect(summary.total).toBe(0)
    expect(gate.pass).toBe(true)
  })
})
