/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_db92ff894c33 — agf compress trajectory
 *
 * AC1: Trajectory > 5 turns: removes obsolete tool outputs, done reasoning, fixed errors.
 * AC2: Compressed trajectory has ≥ 30% token reduction vs original.
 * AC3: Returns tokens_removed + compression_ratio in result.
 */

import { describe, it, expect } from 'vitest'
import { compressTrajectory, type Turn } from '../core/tool-compress/trajectory-compressor.js'

function makeTurns(n: number, content?: string): Turn[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'assistant' : 'user',
    content: content ?? `Turn ${i}: ${'x'.repeat(200)}`,
    type: 'text' as const,
  }))
}

// ── AC1 — removes noise from long trajectories ────────────────────────────────

describe('compressTrajectory (AC1 — noise removal)', () => {
  it('does not compress short trajectories (≤5 turns)', () => {
    const turns = makeTurns(4)
    const result = compressTrajectory(turns)
    expect(result.turns.length).toBe(4)
    expect(result.tokensRemoved).toBe(0)
  })

  it('removes completed tool-output turns from long trajectories', () => {
    const turns: Turn[] = [
      ...makeTurns(3),
      { role: 'assistant', content: '<tool_result>npm install output...</tool_result>', type: 'tool_output' },
      { role: 'assistant', content: 'Installation complete, moving on.', type: 'text' },
      ...makeTurns(4),
    ]
    const result = compressTrajectory(turns)
    const toolOutputs = result.turns.filter((t) => t.type === 'tool_output')
    expect(toolOutputs.length).toBe(0)
  })

  it('removes completed error context turns', () => {
    const turns: Turn[] = [
      ...makeTurns(3),
      { role: 'assistant', content: 'Error: TS2345 cannot assign...', type: 'error_context' },
      { role: 'assistant', content: 'Fixed the type error.', type: 'text' },
      ...makeTurns(3),
    ]
    const result = compressTrajectory(turns)
    const errors = result.turns.filter((t) => t.type === 'error_context')
    expect(errors.length).toBe(0)
  })

  it('keeps text turns', () => {
    const turns = makeTurns(8)
    const result = compressTrajectory(turns)
    const textTurns = result.turns.filter((t) => t.type === 'text')
    expect(textTurns.length).toBeGreaterThan(0)
  })
})

// ── AC2 — ≥30% token reduction ────────────────────────────────────────────────

describe('compressTrajectory (AC2 — ≥30% reduction)', () => {
  it('achieves ≥30% reduction on trajectory with many tool outputs', () => {
    const bigContent = 'x'.repeat(500)
    const turns: Turn[] = [
      { role: 'user', content: 'Build it', type: 'text' },
      { role: 'assistant', content: bigContent, type: 'tool_output' },
      { role: 'assistant', content: bigContent, type: 'tool_output' },
      { role: 'assistant', content: bigContent, type: 'tool_output' },
      { role: 'assistant', content: bigContent, type: 'tool_output' },
      { role: 'assistant', content: 'All done.', type: 'text' },
      { role: 'user', content: 'Great.', type: 'text' },
    ]
    const result = compressTrajectory(turns)
    expect(result.compressionRatio).toBeLessThan(0.7)
    expect(result.tokensRemoved).toBeGreaterThan(0)
  })
})

// ── AC3 — ledger fields ───────────────────────────────────────────────────────

describe('compressTrajectory (AC3 — ledger fields)', () => {
  it('returns tokensRemoved and compressionRatio', () => {
    const turns = makeTurns(8)
    const result = compressTrajectory(turns)
    expect(typeof result.tokensRemoved).toBe('number')
    expect(typeof result.compressionRatio).toBe('number')
    expect(result.compressionRatio).toBeGreaterThan(0)
    expect(result.compressionRatio).toBeLessThanOrEqual(1)
  })

  it('compressionRatio is 1.0 when nothing removed', () => {
    const turns = makeTurns(3) // < 5 turns, no compression
    const result = compressTrajectory(turns)
    expect(result.compressionRatio).toBe(1.0)
  })
})
