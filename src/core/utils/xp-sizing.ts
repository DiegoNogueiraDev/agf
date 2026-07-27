/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * XP sizing constants — single source of truth.
 *
 * Two distinct mappings by design:
 * - ORDER: sequential ordinal (1-5) for sorting and comparison
 * - POINTS: fibonacci-like story points for velocity and capacity
 *
 * They agree for XS/S/M but diverge for L/XL:
 *   ORDER: L=4, XL=5 (linear ranking)
 *   POINTS: L=5, XL=8 (effort scales non-linearly)
 */

/** Ordinal ranking — sorting/comparison */
export const XP_SIZE_ORDER: Readonly<Record<string, number>> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
}

/** Fibonacci story points — velocity/capacity */
export const XP_SIZE_POINTS: Readonly<Record<string, number>> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
}
