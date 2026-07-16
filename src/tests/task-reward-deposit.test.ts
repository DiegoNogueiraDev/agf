/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { depositTaskReward, type TaskRewardInput } from '../core/colony/task-reward-deposit.js'
import type { RewardSignals } from '../core/economy/reward-strength.js'

const DELEGATED_PASS: RewardSignals = { tokensSaved: 0, harnessDelta: 0, acPass: true, cycleTimeMs: 0 }
const NO_SIGNAL: RewardSignals = { tokensSaved: 0, harnessDelta: 0, acPass: false, cycleTimeMs: 0 }

describe('depositTaskReward', () => {
  it('deposits non-zero pheromone in delegated mode (tokensSaved=0, acPass=true)', () => {
    // Arrange — fully delegated: no provider, no tokens billed, AC passed.
    const deposit = vi.fn()
    const input: TaskRewardInput = { tags: ['aco', 'colony'], signals: DELEGATED_PASS }

    // Act
    const amount = depositTaskReward(input, deposit)

    // Assert — colony still learns from externally-driven work.
    expect(amount).toBeGreaterThan(0)
    expect(deposit).toHaveBeenCalledTimes(2)
    expect(deposit).toHaveBeenCalledWith('aco', amount)
    expect(deposit).toHaveBeenCalledWith('colony', amount)
  })

  it('does NOT deposit when there is no positive signal (failure path)', () => {
    // Arrange
    const deposit = vi.fn()
    const input: TaskRewardInput = { tags: ['aco'], signals: NO_SIGNAL }

    // Act
    const amount = depositTaskReward(input, deposit)

    // Assert — Δτ=0, trail left to evaporate (no negative reinforcement).
    expect(amount).toBe(0)
    expect(deposit).not.toHaveBeenCalled()
  })

  it('deduplicates tags and skips blanks so each trail is reinforced once', () => {
    // Arrange
    const deposit = vi.fn()
    const input: TaskRewardInput = { tags: ['aco', 'aco', '  ', 'colony'], signals: DELEGATED_PASS }

    // Act
    depositTaskReward(input, deposit)

    // Assert
    expect(deposit).toHaveBeenCalledTimes(2)
    const keys = deposit.mock.calls.map((c) => c[0])
    expect(keys).toEqual(['aco', 'colony'])
  })

  it('does not deposit when the task has no tags', () => {
    // Arrange
    const deposit = vi.fn()
    const input: TaskRewardInput = { tags: [], signals: DELEGATED_PASS }

    // Act
    const amount = depositTaskReward(input, deposit)

    // Assert — amount computed, but nowhere to lay the trail.
    expect(amount).toBeGreaterThan(0)
    expect(deposit).not.toHaveBeenCalled()
  })
})
