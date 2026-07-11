/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  TASK_TYPES,
  REQUIREMENT_TYPES,
  DESIGN_TYPES,
  DESIGN_ONLY_TYPES,
  FEEDBACK_TYPES,
} from '../core/utils/node-type-sets.js'

describe('TASK_TYPES', () => {
  it('should contain task and subtask', () => {
    expect(TASK_TYPES.has('task')).toBe(true)
    expect(TASK_TYPES.has('subtask')).toBe(true)
  })

  it('should not contain non-task types', () => {
    expect(TASK_TYPES.has('epic')).toBe(false)
    expect(TASK_TYPES.has('requirement')).toBe(false)
    expect(TASK_TYPES.has('decision')).toBe(false)
  })
})

describe('REQUIREMENT_TYPES', () => {
  it('should contain epic and requirement', () => {
    expect(REQUIREMENT_TYPES.has('epic')).toBe(true)
    expect(REQUIREMENT_TYPES.has('requirement')).toBe(true)
  })

  it('should not contain task types', () => {
    expect(REQUIREMENT_TYPES.has('task')).toBe(false)
    expect(REQUIREMENT_TYPES.has('subtask')).toBe(false)
  })
})

describe('DESIGN_TYPES', () => {
  it('should contain decision, constraint, risk, and acceptance_criteria', () => {
    expect(DESIGN_TYPES.has('decision')).toBe(true)
    expect(DESIGN_TYPES.has('constraint')).toBe(true)
    expect(DESIGN_TYPES.has('risk')).toBe(true)
    expect(DESIGN_TYPES.has('acceptance_criteria')).toBe(true)
  })
})

describe('DESIGN_ONLY_TYPES', () => {
  it('should contain all design-phase types', () => {
    const expected = ['requirement', 'epic', 'decision', 'constraint', 'milestone', 'risk', 'acceptance_criteria']
    for (const t of expected) {
      expect(DESIGN_ONLY_TYPES.has(t)).toBe(true)
    }
  })

  it('should not contain task or subtask', () => {
    expect(DESIGN_ONLY_TYPES.has('task')).toBe(false)
    expect(DESIGN_ONLY_TYPES.has('subtask')).toBe(false)
  })

  it('should have exactly 7 entries', () => {
    expect(DESIGN_ONLY_TYPES.size).toBe(7)
  })
})

describe('FEEDBACK_TYPES', () => {
  it('should contain requirement, risk, and constraint', () => {
    expect(FEEDBACK_TYPES.has('requirement')).toBe(true)
    expect(FEEDBACK_TYPES.has('risk')).toBe(true)
    expect(FEEDBACK_TYPES.has('constraint')).toBe(true)
  })

  it('should have exactly 3 entries', () => {
    expect(FEEDBACK_TYPES.size).toBe(3)
  })
})

describe('TASK_TYPES includes bug (node_cb0cd7818f38)', () => {
  it('bug is a task-like type eligible for status flow', () => {
    expect(TASK_TYPES.has('bug')).toBe(true)
  })
})
