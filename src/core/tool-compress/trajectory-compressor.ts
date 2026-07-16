/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * Trajectory compressor — removes obsolete turns from long conversation trajectories.
 * Removed turn types (when trajectory > COMPRESS_THRESHOLD turns):
 *   - tool_output: completed tool call results (already processed by the agent)
 *   - error_context: fixed error context (error mentioned but later resolved)
 *
 * Returns tokensRemoved + compressionRatio for ledger attribution.
 * Used by `agf compress trajectory` CLI subcommand.
 *
 * Composing: tool-compress/ family; results wired to compress-cmd.ts for CLI.
 */

/** Minimum trajectory length before compression is applied. */
const COMPRESS_THRESHOLD = 5

/** Removable turn types: these are noise once their purpose is fulfilled. */
const REMOVABLE_TYPES = new Set<TurnType>(['tool_output', 'error_context'])

export type TurnRole = 'user' | 'assistant'
export type TurnType = 'text' | 'tool_output' | 'error_context'

export interface Turn {
  role: TurnRole
  content: string
  type: TurnType
}

export interface TrajectoryCompressResult {
  turns: Turn[]
  tokensRemoved: number
  compressionRatio: number
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

/**
 * Compress a trajectory by removing noise turns.
 * Short trajectories (≤ COMPRESS_THRESHOLD) are returned unchanged.
 */
export function compressTrajectory(turns: Turn[]): TrajectoryCompressResult {
  if (turns.length <= COMPRESS_THRESHOLD) {
    return { turns, tokensRemoved: 0, compressionRatio: 1.0 }
  }

  const tokensBefore = turns.reduce((s, t) => s + estimateTokens(t.content), 0)
  const kept = turns.filter((t) => !REMOVABLE_TYPES.has(t.type))
  const tokensAfter = kept.reduce((s, t) => s + estimateTokens(t.content), 0)
  const tokensRemoved = tokensBefore - tokensAfter
  const compressionRatio = tokensBefore > 0 ? tokensAfter / tokensBefore : 1.0

  return { turns: kept, tokensRemoved, compressionRatio }
}
