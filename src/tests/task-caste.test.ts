/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_688f781205e6 AC coverage: task-caste.ts
 *
 * AC: caste derived from node.type + priority + AC complexity score
 * AC: agf model route accepts kind=caste:<name>
 */

import { describe, it, expect } from 'vitest'
import { computeTaskCaste, casteToModelTier, type TaskCasteInput } from '../core/colony/task-caste.js'

function input(overrides: Partial<TaskCasteInput> = {}): TaskCasteInput {
  return {
    type: 'task',
    priority: 3,
    acceptanceCriteria: ['do X and Y'],
    ...overrides,
  }
}

// ── computeTaskCaste ──────────────────────────────────────────────────────────

describe('computeTaskCaste', () => {
  it('bug type → minima', () => {
    expect(computeTaskCaste(input({ type: 'bug' }))).toBe('minima')
  })

  it('epic type → soldado', () => {
    expect(computeTaskCaste(input({ type: 'epic' }))).toBe('soldado')
  })

  it('priority 1 task → soldado', () => {
    expect(computeTaskCaste(input({ type: 'task', priority: 1 }))).toBe('soldado')
  })

  it('priority 2 task → media', () => {
    expect(computeTaskCaste(input({ type: 'task', priority: 2 }))).toBe('media')
  })

  it('priority 3 task (default) → media', () => {
    expect(computeTaskCaste(input({ type: 'task', priority: 3 }))).toBe('media')
  })

  it('priority 4 task → pequena', () => {
    expect(computeTaskCaste(input({ type: 'task', priority: 4 }))).toBe('pequena')
  })

  it('priority 5 task → minima', () => {
    expect(computeTaskCaste(input({ type: 'task', priority: 5 }))).toBe('minima')
  })

  it('high AC count (>=4) bumps caste up: priority 3 → soldado', () => {
    const acs = ['AC1', 'AC2', 'AC3', 'AC4']
    expect(computeTaskCaste(input({ type: 'task', priority: 3, acceptanceCriteria: acs }))).toBe('soldado')
  })

  it('high AC count (>=4) bumps caste up: priority 4 → media', () => {
    const acs = ['AC1', 'AC2', 'AC3', 'AC4']
    expect(computeTaskCaste(input({ type: 'task', priority: 4, acceptanceCriteria: acs }))).toBe('media')
  })

  it('bug with many ACs stays minima', () => {
    const acs = ['AC1', 'AC2', 'AC3', 'AC4']
    expect(computeTaskCaste(input({ type: 'bug', acceptanceCriteria: acs }))).toBe('minima')
  })

  it('subtask type behaves like task', () => {
    expect(computeTaskCaste(input({ type: 'subtask', priority: 3 }))).toBe('media')
  })
})

// ── casteToModelTier ──────────────────────────────────────────────────────────

describe('casteToModelTier', () => {
  it('soldado → frontier', () => {
    expect(casteToModelTier('soldado')).toBe('frontier')
  })

  it('media → build', () => {
    expect(casteToModelTier('media')).toBe('build')
  })

  it('pequena → cheap', () => {
    expect(casteToModelTier('pequena')).toBe('cheap')
  })

  it('minima → cheap', () => {
    expect(casteToModelTier('minima')).toBe('cheap')
  })
})
