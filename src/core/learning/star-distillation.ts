/*!
 * star-distillation — STaR (Self-Taught Reasoner) Opus→Haiku distillation.
 *
 * WHY: Expensive model (Opus) reasons through a scenario once; this module
 * extracts the decision chain into DecisionObservation entries that the
 * learning-compiler can group and compile into the decision-table-store.
 * Cheap model (Haiku) then replays the compiled decision at zero token cost
 * via the existing fast-path (decision-table-store.get).
 *
 * Pure function — no I/O, no Date.now() in hot path (ts is injected).
 * Feeds directly into compileDecisions() (learning-compiler.ts).
 */

import { decisionKey, type DecisionContext, type DecisionObservation } from './decision-key.js'

/**
 * A single reasoning trace produced by an expensive model (e.g. Opus).
 * Carries the raw reasoning + final conclusion; distillStar converts it
 * to a DecisionObservation the learning-compiler can consume.
 */
export interface ReasoningTrace {
  /** Matches DecisionContext.domain — area/module where the decision was made. */
  domain: string
  /** Matches DecisionContext.phase — lifecycle phase (e.g. BUILD, SHIP). */
  phase: string
  /** Matches DecisionContext.role — agent role (e.g. implementer, reviewer). */
  role: string
  /** The input prompt/question that triggered reasoning. */
  input: string
  /** The internal chain-of-thought produced by the expensive model (logged, not stored). */
  reasoning: string
  /** The final decision/answer the expensive model reached. */
  conclusion: string
  /** Whether the decision ultimately succeeded (feeds successRate). */
  success: boolean
  /** Observation timestamp in ms — injectable for determinism in tests. */
  ts: number
}

/**
 * Convert an array of ReasoningTrace entries into DecisionObservation[] ready
 * for compileDecisions() in learning-compiler.ts.
 *
 * The `conclusion` and `reasoning` are stored in `decision.conclusion` and
 * `decision.reasoning` so the cheap model can replay without re-reasoning,
 * while the graph learning pipeline tracks success rates and decay.
 */
export function distillStar(traces: ReasoningTrace[]): DecisionObservation[] {
  return traces.map((trace) => {
    const ctx: DecisionContext = {
      domain: trace.domain,
      phase: trace.phase,
      role: trace.role,
      input: trace.input,
    }
    const obs: DecisionObservation = {
      key: decisionKey(ctx),
      context: ctx,
      decision: { conclusion: trace.conclusion, reasoning: trace.reasoning },
      success: trace.success,
      ts: trace.ts,
    }
    return obs
  })
}
