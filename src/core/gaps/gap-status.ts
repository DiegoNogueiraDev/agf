/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * gap-status — single source of truth for "is this node's quality gap still
 * actionable?". Quality gaps (weak AC, missing edge-case, …) on a node whose
 * work is already terminal (done/satisfied/quarantined) are HISTORICAL, not
 * pending work: flagging them inflates `agf gaps` with thousands of un-fixable
 * findings and forces `ready:false` forever. Detectors skip terminal nodes so
 * gaps reflect the ACTIONABLE backlog. Phantom-done is the one exception (it
 * intentionally inspects done nodes) and does not use this guard.
 */

/** Terminal statuses — work finished; quality gaps on these are not actionable. */
const TERMINAL_STATUSES = new Set(['done', 'satisfied', 'quarantined'])

/** True when a node's quality gaps are still worth surfacing (work not terminal). */
export function isActionableForGaps(status: string): boolean {
  return !TERMINAL_STATUSES.has(status)
}
