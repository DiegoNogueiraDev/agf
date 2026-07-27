/*!
 * spectra-regression-gate — detects spectra score regression at task finalization.
 *
 * WHY: spectra-score (spectra-score.ts) computes 5 behaviour spectra. This gate
 * makes them enforced at done-time: if a task finishes and any spectrum drops by
 * more than deltaThreshold points vs the prior baseline, the hook signals a
 * regression so the operator can triage without waiting for manual checks.
 *
 * Disabled via AGF_SPECTRA_GATE=0 — same opt-out pattern as other guards.
 * Pure function (no IO) — call site owns baseline persistence + hook emission.
 *
 * Composes with: spectra-score.ts (source data), finalization-lifecycle-hooks.ts.
 */

export interface SpectraScores {
  autonomy: number
  precision: number
  selfLearning: number
  selfHealing: number
  memory: number
}

export interface SpectraRegressionInput {
  baseline: SpectraScores
  current: SpectraScores
  /** Points drop allowed before triggering regression. Default: 10. */
  deltaThreshold?: number
  /** When true the gate is disabled (opt-out via env). */
  disabled: boolean
}

export interface SpectraRegressionResult {
  regression: boolean
  /** Names of spectra that dropped beyond threshold. Empty when no regression. */
  regressedSpectra: string[]
  /** True when gate was explicitly disabled. */
  skipped?: boolean
}

const SPECTRA_KEYS: (keyof SpectraScores)[] = ['autonomy', 'precision', 'selfLearning', 'selfHealing', 'memory']

/**
 * Compare current spectra scores against baseline. Returns regression=true when
 * any spectrum dropped more than deltaThreshold points.
 */
export function checkSpectraRegression(input: SpectraRegressionInput): SpectraRegressionResult {
  if (input.disabled) {
    return { regression: false, regressedSpectra: [], skipped: true }
  }

  const threshold = input.deltaThreshold ?? 10
  const regressedSpectra: string[] = []

  for (const key of SPECTRA_KEYS) {
    const drop = input.baseline[key] - input.current[key]
    if (drop > threshold) {
      regressedSpectra.push(key)
    }
  }

  return { regression: regressedSpectra.length > 0, regressedSpectra }
}

/** Reads AGF_SPECTRA_GATE env var; returns true when gate is disabled. */
export function isSpectraGateDisabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.AGF_SPECTRA_GATE === '0'
}
