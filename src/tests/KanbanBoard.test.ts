import { describe, it, expect } from 'vitest'
import { KanbanBoard } from '../tui/components/KanbanBoard.js'

describe('KanbanBoard', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof KanbanBoard).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(KanbanBoard.name).toBeTruthy()
  })
})
