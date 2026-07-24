/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-hermes — E12-T3: Dialectic reasoning engine.
 * 3-pass deterministic algorithm: audit → synthesis → reconciliation.
 * Zero LLM calls — pure function, no side effects.
 */

export interface DialecticFact {
  id: string
  content: string
  updatedAt: string
}

export interface DialecticInput {
  facts: DialecticFact[]
  depth: 1 | 2 | 3
}

export type DialecticPass = 'audit' | 'synthesis' | 'reconciliation'

export interface DialecticResult {
  passesExecuted: DialecticPass[]
  /** Single synthesized string combining non-conflicting facts. */
  synthesized: string
  /** Present when reconciliation was executed (depth=3). */
  reconciled?: DialecticFact[]
  /** Conflicts detected during audit (depth ≥ 2). */
  conflicts?: string[]
}

/**
 * Run dialectic reasoning in up to 3 deterministic passes.
 * Depth 1 = synthesis only.
 * Depth 2 = audit + synthesis.
 * Depth 3 = audit + synthesis + reconciliation.
 */
export function runDialecticEngine(input: DialecticInput): DialecticResult {
  const { facts, depth } = input
  const passes: DialecticPass[] = []
  let conflicts: string[] | undefined
  let reconciled: DialecticFact[] | undefined

  // ── Pass 1: Audit (depth ≥ 2) ─────────────────────────
  if (depth >= 2) {
    passes.push('audit')
    conflicts = detectConflicts(facts)
  }

  // ── Pass 2: Synthesis (always) ────────────────────────
  passes.push('synthesis')
  const synthesized = synthesizeFacts(facts)

  // ── Pass 3: Reconciliation (depth = 3) ───────────────
  if (depth === 3) {
    passes.push('reconciliation')
    reconciled = reconcileFacts(facts)
  }

  return {
    passesExecuted: passes,
    synthesized,
    ...(conflicts !== undefined ? { conflicts } : {}),
    ...(reconciled !== undefined ? { reconciled } : {}),
  }
}

function detectConflicts(facts: DialecticFact[]): string[] {
  const byId = new Map<string, DialecticFact[]>()
  for (const f of facts) {
    const group = byId.get(f.id) ?? []
    group.push(f)
    byId.set(f.id, group)
  }
  const conflicts: string[] = []
  for (const [id, group] of byId) {
    if (group.length > 1) {
      conflicts.push(`id "${id}" has ${group.length} conflicting values`)
    }
  }
  return conflicts
}

function synthesizeFacts(facts: DialecticFact[]): string {
  if (facts.length === 0) return ''
  // Deduplicate by id (keep newest), then join content
  const unique = reconcileFacts(facts)
  return unique.map((f) => f.content).join('; ')
}

function reconcileFacts(facts: DialecticFact[]): DialecticFact[] {
  // For each id group, keep the fact with the latest updatedAt timestamp.
  const byId = new Map<string, DialecticFact>()
  for (const f of facts) {
    const existing = byId.get(f.id)
    if (!existing || f.updatedAt > existing.updatedAt) {
      byId.set(f.id, f)
    }
  }
  return Array.from(byId.values())
}
