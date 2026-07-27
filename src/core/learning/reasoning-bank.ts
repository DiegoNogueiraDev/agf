/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-5.T04 — Reasoning bank (store/recall trajectories).
 *
 * A trajectory is a record of {nodeId, tool_sequence, outcomeScore, ts}
 * captured during task execution. Sona-router can recall similar past
 * trajectories to bias model + agent selection.
 *
 * This module is pure. SQLite-backed adapter plugs into TrajectoryStore
 * at the caller; in-memory adapter ships for tests.
 */

import { z } from 'zod/v4'
import { InvalidArgumentError } from '../utils/errors.js'

export const OUTCOME_SCORE_MIN = 0
export const OUTCOME_SCORE_MAX = 1

export const TrajectorySchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  toolSequence: z.array(z.string()).min(1),
  outcomeScore: z.number().min(OUTCOME_SCORE_MIN).max(OUTCOME_SCORE_MAX),
  notes: z.string().optional(),
  ts: z.number(),
})

export type Trajectory = z.infer<typeof TrajectorySchema>

export interface TrajectoryStore {
  insert(t: Trajectory): void
  all(): Trajectory[]
  count(): number
}

/** createMemoryTrajectoryStore —  */
export function createMemoryTrajectoryStore(initial: Trajectory[] = []): TrajectoryStore {
  let rows = [...initial]
  return {
    insert: (t) => {
      rows = [...rows, t]
    },
    all: () => [...rows],
    count: () => rows.length,
  }
}

/**
 * Validate + persist a trajectory. Throws if the payload doesn't satisfy
 * TrajectorySchema (Zod). Caller layers SQLite-backed store via the
 * TrajectoryStore interface.
 */
export function storeTrajectory(store: TrajectoryStore, payload: unknown): Trajectory {
  const parsed = TrajectorySchema.safeParse(payload)
  if (!parsed.success) {
    throw new InvalidArgumentError(
      `reasoning-bank:invalid-trajectory — ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  store.insert(parsed.data)
  return parsed.data
}

/** Jaccard similarity between two tool sequences (treated as sets). */
export function toolSequenceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const AVar = new Set(a)
  const BVar = new Set(b)
  let inter = 0
  for (const tVar of AVar) if (BVar.has(tVar)) inter++
  const unionSize = AVar.size + BVar.size - inter
  return unionSize === 0 ? 0 : inter / unionSize
}

export interface RecallMatch {
  trajectory: Trajectory
  similarity: number
}

/**
 * Recall top-k trajectories by sequence similarity. Stable secondary sort
 * by outcomeScore DESC so ties favor known-good trajectories.
 */
export function recallSimilar(store: TrajectoryStore, query: string[], topK: number = 5): RecallMatch[] {
  const all = store.all()
  const scored: RecallMatch[] = all.map((trajectory) => ({
    trajectory,
    similarity: toolSequenceSimilarity(query, trajectory.toolSequence),
  }))
  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity
    return b.trajectory.outcomeScore - a.trajectory.outcomeScore
  })
  return scored.slice(0, Math.max(0, topK))
}

/** Filter to trajectories whose outcomeScore meets a minimum bar. */
export function recallSuccessful(
  store: TrajectoryStore,
  query: string[],
  minScore: number,
  topK: number = 5,
): RecallMatch[] {
  return recallSimilar(store, query, store.count())
    .filter((m) => m.trajectory.outcomeScore >= minScore)
    .slice(0, Math.max(0, topK))
}
