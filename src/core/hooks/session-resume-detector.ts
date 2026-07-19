/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T08 — Session resume detector.
 * Pure decision: dado lastSessionMs + nodes/commits/now, decide se um
 * resume-delta deve ser emitido (gap > GAP_THRESHOLD_MS) e monta o
 * payload {nodesModified, commits}. Caller (hook session:start) lê
 * last_session_ts de project_settings, query nodes/git, e emite o evento.
 */

const HOUR_MS = 60 * 60 * 1000

export const SESSION_GAP_THRESHOLD_MS = 1 * HOUR_MS
export const RESUME_NODES_LIMIT = 20
export const RESUME_COMMITS_LIMIT = 10

export interface NodeRef {
  id: string
  title: string
  updatedAtMs: number
}

export interface CommitRef {
  sha: string
  message: string
  timestampMs: number
}

export interface SessionResumeInput {
  lastSessionMs: number | undefined
  nowMs?: number
  nodes: NodeRef[]
  commits: CommitRef[]
}

export interface ResumeDelta {
  resume: boolean
  reason: 'no_prior_session' | 'gap_below_threshold' | 'delta_emitted'
  gapMs: number
  nodesModified: NodeRef[]
  commits: CommitRef[]
}

/** isSessionResumeDisabled —  */
export function isSessionResumeDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_SESSION_RESUME === 'off'
}

/** computeResumeDelta —  */
export function computeResumeDelta(input: SessionResumeInput): ResumeDelta {
  const now = input.nowMs ?? Date.now()
  if (input.lastSessionMs === undefined) {
    return {
      resume: false,
      reason: 'no_prior_session',
      gapMs: 0,
      nodesModified: [],
      commits: [],
    }
  }
  const lastSessionMs = input.lastSessionMs
  const gapMs = now - lastSessionMs
  if (gapMs <= SESSION_GAP_THRESHOLD_MS) {
    return {
      resume: false,
      reason: 'gap_below_threshold',
      gapMs,
      nodesModified: [],
      commits: [],
    }
  }
  const nodesModified = input.nodes
    .filter((n) => n.updatedAtMs > lastSessionMs)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, RESUME_NODES_LIMIT)
  const commits = input.commits
    .filter((c) => c.timestampMs > lastSessionMs)
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, RESUME_COMMITS_LIMIT)
  return {
    resume: true,
    reason: 'delta_emitted',
    gapMs,
    nodesModified,
    commits,
  }
}
