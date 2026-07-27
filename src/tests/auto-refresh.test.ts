/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { staleStatus, REFRESH_INTERVAL, STALE_THRESHOLD } from '../tui/auto-refresh.js'

describe('staleStatus', () => {
  it('returns fresh when recently refreshed', () => {
    expect(staleStatus(Date.now(), STALE_THRESHOLD)).toBe('fresh')
  })

  it('returns stale when past threshold', () => {
    expect(staleStatus(Date.now() - STALE_THRESHOLD * 2, STALE_THRESHOLD)).toBe('stale')
  })

  it('returns fresh when exactly at threshold', () => {
    expect(staleStatus(Date.now() - STALE_THRESHOLD, STALE_THRESHOLD)).toBe('fresh')
  })

  it('returns never when no timestamp', () => {
    expect(staleStatus(null, STALE_THRESHOLD)).toBe('never')
  })

  it('returns never when timestamp is 0', () => {
    expect(staleStatus(0, STALE_THRESHOLD)).toBe('never')
  })

  it('REFRESH_INTERVAL is 20000ms', () => {
    expect(REFRESH_INTERVAL).toBe(20000)
  })

  it('STALE_THRESHOLD is 30000ms', () => {
    expect(STALE_THRESHOLD).toBe(30000)
  })
})
