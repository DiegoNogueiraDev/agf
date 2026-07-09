/*!
 * aco-mode — task-selection mode decision for `agf next` / `agf start`.
 *
 * WHY: ACO roulette (pheromone-weighted) selection was the 'auto' smart-default whenever the
 * pheromone field carried any signal — but that let it override strict priority (observed: a
 * priority-3 task picked before a priority-2 one). A weak/delegate model following `agf next`
 * blindly needs the safe path to be deterministic. Strict priority sort is now the default with
 * no flags; the roulette requires the explicit `--aco` opt-in. `auto` is kept as an available
 * mode (still selectable) for callers that want the old field-informative behavior on purpose.
 * Pure functions only; the actual selection lives in aco-select.ts.
 */

/** on = force ACO · off = force deterministic (default) · auto = ACO when the field is informative. */
export type AcoMode = 'on' | 'off' | 'auto'

/** Map CLI flags to a mode. `--no-aco` wins over `--aco`; neither → off (deterministic default). */
export function resolveAcoMode(flags: { aco?: boolean; noAco?: boolean }): AcoMode {
  if (flags.noAco) return 'off'
  if (flags.aco) return 'on'
  return 'off'
}

/**
 * The field is informative when at least one candidate carries a positive pheromone trail —
 * past outcomes have marked something. On a cold/flat field every τ is 0 and the roulette
 * degenerates (α>0 → all scores 0), so auto-mode must fall back to the deterministic sort.
 */
export function isPheromoneFieldInformative(pheromones: readonly number[]): boolean {
  return pheromones.some((p) => p > 0)
}

/** Whether to select via ACO given the mode and the current pheromone field. */
export function shouldUseAco(mode: AcoMode, pheromones: readonly number[]): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  return isPheromoneFieldInformative(pheromones)
}
