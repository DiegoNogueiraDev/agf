/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deterministic Given-When-Then acceptance-criteria synthesizer (~0 token, no LLM).
 *
 * WHY: every task imported via `agf import-prd`/`generate-prd` must be born with
 * ≥1 testable AC, else it fails `agf check` (DoD #1/#2) and floods the graph with
 * ac_coverage_break gaps. When the markdown carries no AC, convertToGraph falls
 * back to this synthesizer (see the WIRE task) — a pure heuristic over the title.
 *
 * Pure function: no randomness, no clock → same title ⇒ same output. Owning
 * module for title→GWT heuristics; keep it small and single-responsibility.
 */

/** Strip a leading `TYPE:` label (IMPLEMENT:, FIX:, WIRE:, TEST:, …) from a title. */
function stripTypePrefix(title: string): string {
  return title.replace(/^\s*[A-Z][A-Z0-9_-]*:\s*/, '').trim()
}

/** Match a "WIRE/CONNECT/INTEGRATE X into/in/to Y" shape → { subject, target }. */
const WIRE_PATTERN = /^(?:wire|connect|integrate|hook|register|plug)\s+(.+?)\s+(?:into|in|to|on)\s+(.+)$/i

/**
 * Synthesize at least one Given-When-Then acceptance criterion from a task title.
 * Returns `[]` for an empty/whitespace-only title (never throws).
 */
export function synthesizeAc(title: string): string[] {
  const trimmed = title.trim()
  if (trimmed.length === 0) return []

  const subject = stripTypePrefix(trimmed)
  const effective = subject.length > 0 ? subject : trimmed

  const wire = WIRE_PATTERN.exec(effective)
  if (wire) {
    const what = wire[1].trim()
    const where = wire[2].trim()
    return [`Given ${where} configurado, When ${what} é invocado, Then o efeito de ${what} é observável em ${where}`]
  }

  return [
    `Given o contexto de "${effective}", When a implementação é exercitada por um teste, Then o comportamento esperado de "${effective}" é observável e verificável`,
  ]
}
