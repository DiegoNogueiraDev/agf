/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * improve-batch-tasks [P2] — Batch selector for small unblocked tasks.
 *
 * `selectTaskBatch` groups up to N (default 5) small (size 'S'/'XS') UNBLOCKED
 * tasks into one delegation. WIP=1 is preserved conceptually: the batch is a
 * selection only — each task is still validated/closed individually by the
 * caller. Pure selector, not wired into a live loop.
 *
 * AC: grouping cap (≤N); only size-S/XS unblocked tasks are grouped; larger
 *     (M/L/XL) and blocked tasks are NOT batched.
 */
import { describe, it, expect } from 'vitest'
import { selectTaskBatch, type BatchableTask } from '../core/autonomy/delegate.js'

const tasks: BatchableTask[] = [
  { id: 't1', title: 'XS one', xpSize: 'XS' },
  { id: 't2', title: 'S two', xpSize: 'S' },
  { id: 't3', title: 'M three', xpSize: 'M' },
  { id: 't4', title: 'S four blocked', xpSize: 'S', blocked: true },
  { id: 't5', title: 'XS five', xpSize: 'XS' },
  { id: 't6', title: 'L six', xpSize: 'L' },
  { id: 't7', title: 'S seven', xpSize: 'S' },
]

describe('improve-batch-tasks: selectTaskBatch', () => {
  it('groups only small (S/XS) unblocked tasks; excludes M/L/XL and blocked', () => {
    const batch = selectTaskBatch(tasks)
    expect(batch.map((t) => t.id)).toEqual(['t1', 't2', 't5', 't7'])
    // larger tasks are NOT batched
    expect(batch.some((t) => t.xpSize === 'M' || t.xpSize === 'L' || t.xpSize === 'XL')).toBe(false)
    // blocked task excluded even though it is size S
    expect(batch.some((t) => t.id === 't4')).toBe(false)
  })

  it('caps the batch at N (default 5)', () => {
    const many: BatchableTask[] = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`,
      title: `small ${i}`,
      xpSize: 'S',
    }))
    const batch = selectTaskBatch(many)
    expect(batch).toHaveLength(5)
    expect(batch.map((t) => t.id)).toEqual(['s0', 's1', 's2', 's3', 's4'])
  })

  it('respects a custom maxBatch cap', () => {
    const many: BatchableTask[] = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`,
      title: `small ${i}`,
      xpSize: 'XS',
    }))
    expect(selectTaskBatch(many, { maxBatch: 3 })).toHaveLength(3)
  })

  it('returns empty when no small unblocked task exists', () => {
    const onlyLarge: BatchableTask[] = [
      { id: 'a', title: 'a', xpSize: 'L' },
      { id: 'b', title: 'b', xpSize: 'M', blocked: true },
      { id: 'c', title: 'c' /* size unknown */ },
    ]
    expect(selectTaskBatch(onlyLarge)).toEqual([])
  })

  it('does not batch a task with no xpSize (only explicit S/XS qualify)', () => {
    const mixed: BatchableTask[] = [
      { id: 'x', title: 'no size' },
      { id: 'y', title: 'S yes', xpSize: 'S' },
    ]
    expect(selectTaskBatch(mixed).map((t) => t.id)).toEqual(['y'])
  })

  it('allows widening the eligible sizes via options (e.g. include M)', () => {
    const batch = selectTaskBatch(tasks, { sizes: ['XS', 'S', 'M'] })
    // t3 (M) now qualifies; t4 stays out (blocked), t6 stays out (L)
    expect(batch.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't5', 't7'])
  })
})
