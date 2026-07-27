/**
 * AUDIT-001 — `Task 1.1` heading mis-typed as epic.
 *
 * In classifySectionTitle the `level===1 || EPIC` check ran before the
 * explicit-task-heading check, so a top-level `# Task 1.1` was classified as
 * an epic. The explicit task check must win.
 */
import { describe, it, expect } from 'vitest'
import { classifySectionTitle } from '../core/parser/classify.js'

describe('AUDIT-001: explicit task heading wins over the level-1 epic fallback', () => {
  it('classifies a top-level `Task 1.1` heading as task, not epic', () => {
    expect(classifySectionTitle('Task 1.1', 1).type).toBe('task')
  })

  it('classifies `Tarefa 2` at level 1 as task', () => {
    expect(classifySectionTitle('Tarefa 2', 1).type).toBe('task')
  })

  it('still classifies a genuine level-1 epic heading as epic', () => {
    expect(classifySectionTitle('Visão Geral do Produto', 1).type).toBe('epic')
  })
})
