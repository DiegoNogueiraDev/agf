/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/kanban/validation.ts — previously dormant (no-surface),
 * now wired into `agf kanban --sprint <id>` (see cli/kanban-cmd.test.ts).
 */

import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod/v4'
import { validateKanbanInput } from '../core/kanban/validation.js'

describe('validateKanbanInput', () => {
  it('accepts an empty input (all fields optional)', () => {
    expect(validateKanbanInput({})).toEqual({})
  })

  it('accepts a valid sprintId', () => {
    expect(validateKanbanInput({ sprintId: 'sprint-1' })).toEqual({ sprintId: 'sprint-1' })
  })

  it('accepts a valid groupBy enum value', () => {
    expect(validateKanbanInput({ groupBy: 'sprint' })).toEqual({ groupBy: 'sprint' })
  })

  it('rejects an invalid groupBy value', () => {
    expect(() => validateKanbanInput({ groupBy: 'invalid-field' })).toThrow(ZodError)
  })

  it('rejects a non-string sprintId', () => {
    expect(() => validateKanbanInput({ sprintId: 42 })).toThrow(ZodError)
  })
})
