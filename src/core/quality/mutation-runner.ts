/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface MutationSpec {
  name: string
  pattern: RegExp
  replacement: string
}

export interface MutantResult {
  mutantId: number
  spec: string
  killed: boolean
  testOutput?: string
}

export interface MutationRunSummary {
  file: string
  total: number
  killed: number
  survived: number
  score: number // killed / total, or 0 when total === 0
  mutants: MutantResult[]
}

export const DEFAULT_MUTATION_SPECS: MutationSpec[] = [
  { name: 'arithmetic-add', pattern: /\+(?!=)/, replacement: '-' },
  { name: 'arithmetic-sub', pattern: /-(?![-=>])/, replacement: '+' },
  { name: 'equality-strict', pattern: /===/, replacement: '!==' },
  { name: 'equality-loose', pattern: /!==/, replacement: '===' },
  { name: 'bool-true', pattern: /\btrue\b/, replacement: 'false' },
  { name: 'bool-false', pattern: /\bfalse\b/, replacement: 'true' },
  { name: 'logical-and', pattern: /&&/, replacement: '||' },
  { name: 'logical-or', pattern: /\|\|/, replacement: '&&' },
  { name: 'gt', pattern: / > /, replacement: ' < ' },
  { name: 'lt', pattern: / < (?!=)/, replacement: ' > ' },
]

/**
 * Apply a single mutation to the first match in source.
 * Returns the original source unchanged when the pattern doesn't match.
 * Pure function — no I/O.
 */
export function applyMutation(source: string, spec: MutationSpec): string {
  const match = spec.pattern.exec(source)
  if (!match) return source
  return source.slice(0, match.index) + spec.replacement + source.slice(match.index + match[0].length)
}

/**
 * Aggregate mutant results into a kill summary.
 * Pure function — no I/O.
 */
export function summarizeMutants(file: string, mutants: MutantResult[]): MutationRunSummary {
  const total = mutants.length
  const killed = mutants.filter((m) => m.killed).length
  return {
    file,
    total,
    killed,
    survived: total - killed,
    score: total === 0 ? 0 : killed / total,
    mutants,
  }
}
