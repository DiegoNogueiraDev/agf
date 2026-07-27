/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_f3249b9b8ab4 — Auto-refresh polling config and stale detection.
 *
 * Stale status:
 *   fresh — data refreshed within STALE_THRESHOLD
 *   stale — last refresh is older than STALE_THRESHOLD
 *   never — never refreshed
 */

export const REFRESH_INTERVAL = 20_000
export const STALE_THRESHOLD = 30_000

export type StaleStatus = 'fresh' | 'stale' | 'never'

/** Returns 'fresh', 'stale', or 'never' based on how long ago the last refresh occurred relative to the threshold. */
export function staleStatus(lastRefreshAt: number | null, threshold: number = STALE_THRESHOLD): StaleStatus {
  if (lastRefreshAt === null || lastRefreshAt === 0) return 'never'
  return Date.now() - lastRefreshAt <= threshold ? 'fresh' : 'stale'
}
