/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_457c28c0f400 — C81-T1: tests for memory-dynamics-tick exported constants
 *
 * AC: MEMORY_DYNAMICS_TICK_KEY is a string; DEFAULT_TICK_INTERVAL_MS is 30 minutes in ms;
 *     blast gate passes
 */

import { describe, it, expect } from 'vitest'
import {
  MEMORY_DYNAMICS_TICK_KEY,
  MEMORY_DYNAMICS_TICK_INTERVAL_KEY,
  DEFAULT_TICK_INTERVAL_MS,
} from '../core/rag/memory-dynamics-tick.js'

describe('memory-dynamics-tick constants', () => {
  it('MEMORY_DYNAMICS_TICK_KEY is a non-empty string', () => {
    expect(typeof MEMORY_DYNAMICS_TICK_KEY).toBe('string')
    expect(MEMORY_DYNAMICS_TICK_KEY.length).toBeGreaterThan(0)
  })

  it('MEMORY_DYNAMICS_TICK_INTERVAL_KEY is a non-empty string', () => {
    expect(typeof MEMORY_DYNAMICS_TICK_INTERVAL_KEY).toBe('string')
    expect(MEMORY_DYNAMICS_TICK_INTERVAL_KEY.length).toBeGreaterThan(0)
  })

  it('MEMORY_DYNAMICS_TICK_KEY and MEMORY_DYNAMICS_TICK_INTERVAL_KEY are distinct', () => {
    expect(MEMORY_DYNAMICS_TICK_KEY).not.toBe(MEMORY_DYNAMICS_TICK_INTERVAL_KEY)
  })

  it('DEFAULT_TICK_INTERVAL_MS is 30 minutes in milliseconds', () => {
    const thirtyMinutes = 30 * 60 * 1000
    expect(DEFAULT_TICK_INTERVAL_MS).toBe(thirtyMinutes)
  })

  it('DEFAULT_TICK_INTERVAL_MS is a positive number', () => {
    expect(DEFAULT_TICK_INTERVAL_MS).toBeGreaterThan(0)
  })

  it('DEFAULT_TICK_INTERVAL_MS is a finite number', () => {
    expect(Number.isFinite(DEFAULT_TICK_INTERVAL_MS)).toBe(true)
  })

  it('DEFAULT_TICK_INTERVAL_MS is 1800000 (exact)', () => {
    expect(DEFAULT_TICK_INTERVAL_MS).toBe(1_800_000)
  })
})
