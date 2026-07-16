/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Context diff — predictive-coding "send only the surprise" for input context.
 *
 * Anchor: Friston's Free-Energy Principle; Rao & Ballard (1999) predictive coding —
 * the cortex transmits only the *prediction error*, not the raw stimulus. Across a
 * multi-turn session the executor already holds prior context; re-sending it wastes
 * tokens. Using a per-session {@link SeenSketch} as the prior, we forward only chunks
 * the executor has not yet received (the surprising residual) — diff-edits, but for
 * the **input** instead of the output. No prior (fresh sketch) ⇒ full context.
 *
 * Pure-ish: mutates the supplied sketch (marks forwarded chunks as seen). Token lever `context_diff`.
 */

import type { SeenSketch } from '../economy/seen-sketch.js'
import { estimateTokensCalibrated, DEFAULT_CHARS_PER_TOKEN } from './zipf-estimator.js'

export interface ContextChunk {
  /** Stable identity of the chunk (e.g. a content hash or `${source}:${id}`). */
  key: string
  /** The chunk text that would be sent to the executor. */
  text: string
}

export interface ContextDiffResult {
  /** Chunks not previously seen — the surprising residual to actually send. */
  fresh: ContextChunk[]
  /** Indices (into the input) skipped because the prior already held them. */
  skippedIndices: number[]
  /** Estimated tokens saved by not re-sending the skipped chunks. */
  savedTokens: number
}

/**
 * Forward only the chunks absent from the session prior; mark the forwarded ones as seen.
 *
 * A skip collapses the chunk to a no-op marker downstream with no CCR fallback, so it
 * MUST only happen for content the executor genuinely already holds. The Bloom probe
 * ({@link SeenSketch.has}) has false POSITIVES — trusting it alone would irreversibly
 * drop a never-sent message (AUDIT-044). We use Bloom as a fast negative pre-filter but
 * confirm every hit against exact membership ({@link SeenSketch.confirmedHas}) before
 * skipping, so a false positive can never discard real content.
 */
export function contextDiff(chunks: ContextChunk[], prior: SeenSketch): ContextDiffResult {
  const fresh: ContextChunk[] = []
  const skippedIndices: number[] = []
  let savedTokens = 0

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    const definitelySeen = prior.has(c.key) && prior.confirmedHas(c.key)
    if (definitelySeen) {
      skippedIndices.push(i)
      savedTokens += estimateTokensCalibrated(c.text, DEFAULT_CHARS_PER_TOKEN)
    } else {
      prior.add(c.key)
      fresh.push(c)
    }
  }

  return { fresh, skippedIndices, savedTokens }
}
