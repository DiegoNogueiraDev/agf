/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deterministic (~0 token) completeness pre-gate for the autonomous loop.
 *
 * Opt-in via `agf autopilot --gate-gaps`: before implementing each task the
 * loop runs the existing gap detectors and blocks iff a **required** gap is
 * anchored to that exact node — surfacing "this isn't ready" the same way the
 * DoD gate surfaces "this isn't done", but pre-emptively. Reuses
 * `detectAllGaps` + `buildGapReport`; never calls an LLM.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { detectAllGaps, buildGapReport } from '../gaps/index.js'
import type { GapReport } from '../gaps/gap-types.js'
import type { GateDecision } from './autopilot-loop.js'

/**
 * Pure decision: block iff a `required` gap is anchored to `nodeId`. Project-wide
 * gaps (no `nodeId`) do NOT block a single node — they are surfaced by `agf gaps`,
 * not by the per-node loop gate (avoids halting the whole loop on the first task).
 */
export function gapsToGateDecision(report: GapReport, nodeId: string): GateDecision {
  const blockers = report.gaps.filter((g) => g.severity === 'required' && g.nodeId === nodeId)
  if (blockers.length === 0) return { block: false }
  const kinds = [...new Set(blockers.map((g) => g.kind))].join(', ')
  return { block: true, reason: `${blockers.length} required gap(s): ${kinds}` }
}

/**
 * Build a `beforeImplement` hook bound to a store. Recomputes the deterministic
 * gap report from the live graph on each call.
 */
export function buildGapsGate(store: SqliteStore): (node: { id: string; title: string }) => GateDecision {
  return (node) => {
    const report = buildGapReport(detectAllGaps(store.toGraphDocument()))
    return gapsToGateDecision(report, node.id)
  }
}
