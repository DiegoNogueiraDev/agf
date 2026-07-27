/*!
 * spectra-score — 5 autonomous-agent telemetry spectra (pure, zero IO).
 *
 * WHY: The harness measures code quality. spectra-score measures RUNTIME
 * agent behaviour: how autonomous, precise, self-learning, self-healing,
 * and memory-efficient the agent actually is — the "soul" complement to
 * the harness' "skeleton".
 *
 * Each spectrum is a ratio in [0,100]:
 *   autonomy      = done-without-human-override / done × 100
 *   precision     = done-passed-and-not-reopened / done × 100
 *   selfLearning  = (last-cycle-resolveRate - first-cycle-resolveRate) × 100
 *                   (positive = improving; clamped [0,100])
 *   selfHealing   = healed-failures / total-failures × 100
 *   memory        = hitRate × freshness × (1 - dedupRatio) × 100
 *
 * Pure function (no DB / no IO) — callers query their stores and pass
 * typed fixture objects. Composes with insights/behavioral-metrics.ts.
 */

export interface TaskRecord {
  status: string
  hadOverride?: boolean
}

export interface PrecisionTaskRecord {
  /** Did the task pass DoD+blast on first submission? */
  passed: boolean
  /** Was the task later reopened or regressed? (makes it imprecise even if passed) */
  reopened: boolean
}

export interface LearningCycle {
  /** Resolve rate (0–1) for this cycle — drawn from flow-tracker or learning-store. */
  resolveRate: number
}

export interface HealingEvent {
  /** True when the quarantine/immune failure was auto-recovered. */
  healed: boolean
}

export interface MemoryRecall {
  /** True when the recall returned a valid (non-empty) result. */
  hit: boolean
  /** True when the recalled memory was stale (outdated/invalidated). */
  stale: boolean
  /** True when the recalled memory was a near-duplicate of another recall in the same session. */
  duplicate: boolean
}

export interface SpectraInput {
  tasks: TaskRecord[]
  precisionTasks: PrecisionTaskRecord[]
  learningCycles: LearningCycle[]
  healingEvents: HealingEvent[]
  memoryRecalls: MemoryRecall[]
}

export interface SpectraScore {
  /** % of done tasks completed without human override. */
  autonomy: number
  /** % of done tasks that passed DoD+blast AND were never reopened. */
  precision: number
  /** Improvement delta in resolve-rate across cycles (clamped [0,100]). */
  selfLearning: number
  /** % of failures that were auto-healed (quarantine resolved). */
  selfHealing: number
  /** Composite memory quality: hitRate × freshness × dedup-factor × 100. */
  memory: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function computeSpectraScore(input: SpectraInput): SpectraScore {
  // --- autonomy ---
  const done = input.tasks.filter((t) => t.status === 'done')
  const autonomy = done.length === 0 ? 0 : round1((done.filter((t) => !t.hadOverride).length / done.length) * 100)

  // --- precision ---
  const pt = input.precisionTasks
  const precise = pt.filter((t) => t.passed && !t.reopened).length
  const precision = pt.length === 0 ? 0 : round1((precise / pt.length) * 100)

  // --- self-learning ---
  const cycles = input.learningCycles
  let selfLearning = 0
  if (cycles.length >= 2) {
    const delta = (cycles[cycles.length - 1].resolveRate - cycles[0].resolveRate) * 100
    selfLearning = round1(Math.min(100, Math.max(0, delta)))
  }

  // --- self-healing ---
  const he = input.healingEvents
  const selfHealing = he.length === 0 ? 0 : round1((he.filter((e) => e.healed).length / he.length) * 100)

  // --- memory ---
  const mr = input.memoryRecalls
  let memory = 0
  if (mr.length > 0) {
    const hits = mr.filter((r) => r.hit)
    const hitRate = hits.length / mr.length
    const freshHits = hits.filter((r) => !r.stale).length
    const freshness = hits.length === 0 ? 0 : freshHits / hits.length
    const dupHits = hits.filter((r) => r.duplicate).length
    const dedupRatio = hits.length === 0 ? 0 : dupHits / hits.length
    memory = round1(hitRate * freshness * (1 - dedupRatio) * 100)
  }

  return { autonomy, precision, selfLearning, selfHealing, memory }
}
