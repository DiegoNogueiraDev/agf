/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Normalizes user-supplied node tags into pheromone-trail-safe keys.
 *
 * Tags double as ACO trail keys (see pheromone-store / task-reward-deposit):
 * `agf done` deposits on each tag, and `agf next --aco` reads trails whose key
 * matches a candidate's tags. So tags must be trimmed, de-duplicated, and free
 * of blanks — otherwise the roulette reads ghost trails or never matches.
 *
 * Delegates the actual split/trim/dedup to utils/normalize-list.ts, shared
 * with node-cmd.ts's --test-files/--implementation-files (same shape of bug,
 * same fix — see that module's docblock).
 */
import { normalizeList } from '../utils/normalize-list.js'

/** Accepts variadic CLI tags and/or comma-separated values; returns clean keys. */
export function normalizeTags(raw: readonly string[] | undefined): string[] {
  return normalizeList(raw)
}
