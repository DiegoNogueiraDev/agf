/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bridges a DoD failure to a reusable lesson. Pure selection logic; the actual
 * persistence reuses `persistLessonFromDodFailure` (lessons-store). Wired into
 * `agf done` so every AC-related DoD failure auto-captures a lesson the builder
 * loop can reuse — no manual `agf dream` needed.
 */

import type { DodCheck } from '../../schemas/implementer-schema.js'

/** DoD checks whose failure signals a weak/missing acceptance criterion. */
const AC_RELATED_CHECKS = ['has_testable_ac', 'ac_quality_pass', 'has_acceptance_criteria']

/**
 * Pick the acceptance-criterion text to record a lesson for, when an AC-related
 * DoD check failed. Returns the node's first AC, else the failed check's details,
 * or null when no AC-related check failed (nothing reusable to learn).
 */
export function selectFailedAcForLesson(
  dod: { checks: readonly DodCheck[] },
  node: { acceptanceCriteria?: readonly string[] | null },
): string | null {
  const failed = dod.checks.find((c) => AC_RELATED_CHECKS.includes(c.name) && !c.passed)
  if (!failed) return null
  const ac = node.acceptanceCriteria?.[0]
  return ac && ac.length > 0 ? ac : failed.details || failed.name
}
