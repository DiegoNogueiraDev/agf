/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'

describe('createBudgetGuard', () => {
  it('is unbounded by default (no ceiling) — current behavior', () => {
    // arrange
    const guard = createBudgetGuard()

    // act
    guard.add(1_000_000)

    // assert
    expect(guard.spent()).toBe(1_000_000)
    expect(guard.remaining()).toBe(Infinity)
    expect(guard.exceeded()).toBe(false)
  })

  it('accumulates spend across add() calls', () => {
    // arrange
    const guard = createBudgetGuard(100)

    // act
    guard.add(30)
    guard.add(20)

    // assert
    expect(guard.spent()).toBe(50)
    expect(guard.remaining()).toBe(50)
    expect(guard.exceeded()).toBe(false)
  })

  it('is exceeded once spent() >= maxTokens', () => {
    // arrange
    const guard = createBudgetGuard(100)

    // act
    guard.add(100)

    // assert
    expect(guard.exceeded()).toBe(true)
    expect(guard.remaining()).toBe(0)
  })

  it('clamps remaining() to 0 when overspent', () => {
    // arrange
    const guard = createBudgetGuard(100)

    // act
    guard.add(150)

    // assert
    expect(guard.spent()).toBe(150)
    expect(guard.remaining()).toBe(0)
    expect(guard.exceeded()).toBe(true)
  })

  it('treats a non-positive add as a no-op (defensive)', () => {
    // arrange
    const guard = createBudgetGuard(100)

    // act
    guard.add(-10)
    guard.add(0)

    // assert
    expect(guard.spent()).toBe(0)
    expect(guard.exceeded()).toBe(false)
  })
})
