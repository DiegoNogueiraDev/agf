/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * MDL selector — choose the compression with the shortest total description length.
 *
 * Anchor: Rissanen's Minimum Description Length (1978); cost echoes Landauer's principle
 * (erasing a bit has a physical cost). The best compression minimizes `model + residual`,
 * not raw bytes saved. Picking by max-saved alone leads to over-crushing that then needs
 * CCR retrieval (a hidden cost); folding a retrieval penalty into the description length
 * makes that explicit, so the selector prefers compressions that are net-cheap to reverse.
 *
 * Pure & deterministic — **additive**: the content-router / CCR defaults are untouched;
 * a caller opts in by scoring its candidate compressions here.
 */

export interface CompressionOption {
  /** Identifier of the candidate compression (e.g. filter name). */
  id: string
  /** Bytes of the compressed payload (the residual). */
  residualBytes: number
  /** Bytes needed to describe the model/codebook/dictionary to reverse it. */
  modelBytes: number
  /** Extra cost if reversing requires a CCR retrieval round-trip. Default 0. */
  retrievalPenaltyBytes?: number
}

export interface MDLSelection {
  /** The minimum-description-length option, or null when none were given. */
  chosen: CompressionOption | null
  /** Each option's total description length, in input order. */
  lengths: Array<{ id: string; length: number }>
}

/** Total description length: model + residual + retrieval penalty. */
export function descriptionLength(option: CompressionOption): number {
  return option.modelBytes + option.residualBytes + (option.retrievalPenaltyBytes ?? 0)
}

/**
 * Pick the option with the smallest total description length. Ties resolve to the
 * earliest option (deterministic). Returns null when given no options.
 */
export function selectByMDL(options: CompressionOption[]): MDLSelection {
  const lengths = options.map((o) => ({ id: o.id, length: descriptionLength(o) }))
  let chosen: CompressionOption | null = null
  let best = Infinity
  for (const o of options) {
    const len = descriptionLength(o)
    if (len < best) {
      best = len
      chosen = o
    }
  }
  return { chosen, lengths }
}
