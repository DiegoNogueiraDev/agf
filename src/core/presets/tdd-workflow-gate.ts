/*!
 * tdd-workflow-gate — mandatory red-before-green gate for strict-tdd preset.
 *
 * WHY: In strict-tdd mode, advancing a task without a failing test first
 * violates TDD discipline. This gate makes the rule enforceable programmatically
 * so orchestrators (CLI, TUI, agf check) can block early.
 *
 * Pure function — no I/O. Caller supplies the active preset name (from
 * preset-gate-adapter.ts) and whether a red test was observed before green.
 * Default preset (and no preset) leave current non-blocking behavior intact.
 */

const STRICT_PRESETS = new Set(['strict-tdd'])

export interface TddGateInput {
  /** Active preset name, or undefined if none is set. */
  activePreset: string | undefined
  /** True if a failing test was observed before the implementation passed. */
  hasRedTestFirst: boolean
}

export interface TddGateResult {
  blocked: boolean
  /** Human-readable reason when blocked. Empty string when not blocked. */
  reason: string
}

/**
 * Check whether a task may advance given the TDD gate constraints.
 *
 * Blocks only when the active preset requires strict TDD AND no red test
 * was seen before green. All other combinations pass through unchanged.
 */
export function checkTddGate(input: TddGateInput): TddGateResult {
  const isStrict = input.activePreset != null && STRICT_PRESETS.has(input.activePreset)
  if (isStrict && !input.hasRedTestFirst) {
    return {
      blocked: true,
      reason:
        'TDD gate: preset strict-tdd requires a failing test (RED) before implementation (GREEN). Write a failing test first.',
    }
  }
  return { blocked: false, reason: '' }
}
