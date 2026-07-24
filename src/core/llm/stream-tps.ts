/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-streaming — Task 2.3: measureStreamTps
 *
 * Pure utility — no DB, no LLM. Measures tokens/second emitted by an
 * AsyncIterable<string> stream. Each yielded value counts as 1 token.
 * Handles interruptions gracefully and guards against divide-by-zero.
 */

export interface StreamTpsResult {
  /** Tokens emitted per second (0 when durationMs === 0). */
  tps: number
  /** Total chunks yielded before the stream ended or was interrupted. */
  tokenCount: number
  /** Wall-clock milliseconds from first to last chunk (inclusive). */
  durationMs: number
}

/**
 * Consumes `stream` and returns tokens-per-second throughput.
 * Each yielded string counts as 1 token regardless of length.
 * If the stream throws before finishing, returns the partial measurement.
 */
export async function measureStreamTps(stream: AsyncIterable<string>): Promise<StreamTpsResult> {
  let tokenCount = 0
  const startMs = Date.now()
  try {
    for await (const _chunk of stream) {
      tokenCount++
    }
  } catch (_e) {
    void _e // stream interrupted — fall through to partial result
  }
  const durationMs = Date.now() - startMs
  const durationSec = durationMs / 1_000
  const tps = durationSec > 0 ? tokenCount / durationSec : 0
  return { tps, tokenCount, durationMs }
}
