/*!
 * connectivity-regression-guard — detects new dormant capabilities introduced by a done.
 *
 * WHY: after wiring the connectivity dimension into the harness, we need a
 * deterministic guard that fires at task-finalization time and warns when the
 * task being closed added new unreachable core files. This closes the feedback
 * loop automatically without requiring a manual `agf harness --dormant`.
 *
 * Disabled via AGF_CONNECTIVITY_GUARD=0 — same opt-out pattern as wip-cap-guard.
 * Pure function (no IO) — call site in finalization-lifecycle-hooks owns the scan.
 *
 * Composes with: connectivity-scanner.ts (source data), finalization-lifecycle-hooks.ts.
 */

export interface ConnectivityRegressionInput {
  /** Dormant-file count measured BEFORE the done (baseline). */
  baselineDormantCount: number
  /** Dormant-file count measured AFTER the done (current). */
  currentDormantCount: number
  /** Optional lists for diff reporting. */
  baselineDormantFiles?: string[]
  currentDormantFiles?: string[]
  /** When true the guard is disabled (opt-out via env). */
  disabled: boolean
}

export interface ConnectivityRegressionResult {
  regression: boolean
  newDormant: number
  addedFiles?: string[]
  /** True when the guard was explicitly disabled and skipped. */
  skipped?: boolean
}

/**
 * Check whether the current done introduced new dormant capabilities.
 * Returns regression=false when disabled or when dormant count has not grown.
 * Pure — no IO, no side effects.
 */
export function checkConnectivityRegression(input: ConnectivityRegressionInput): ConnectivityRegressionResult {
  if (input.disabled) {
    return { regression: false, newDormant: 0, skipped: true }
  }

  const newDormant = Math.max(0, input.currentDormantCount - input.baselineDormantCount)

  if (newDormant === 0) {
    return { regression: false, newDormant: 0 }
  }

  const addedFiles =
    input.baselineDormantFiles && input.currentDormantFiles
      ? input.currentDormantFiles.filter((f) => !input.baselineDormantFiles!.includes(f))
      : undefined

  return { regression: true, newDormant, addedFiles }
}

/** Reads AGF_CONNECTIVITY_GUARD env var; returns true when guard is disabled. */
export function isConnectivityGuardDisabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.AGF_CONNECTIVITY_GUARD === '0'
}
