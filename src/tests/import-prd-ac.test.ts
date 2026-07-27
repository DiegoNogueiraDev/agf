/*!
 * TDD: import-prd populates task.ac[] instead of acceptance_criteria child nodes (node_3e2eca9efd3e).
 *
 * AC1: PRD with task + 3 ACs → task has ac[] with 3 criteria, NO acceptance_criteria child node.
 * AC2: Imported task passes has_acceptance_criteria DoD check (AC in field, not in children).
 * AC3: PRD with no AC on a task → ac[] empty, no phantom child node.
 */

import { describe, it, expect } from 'vitest'
import { convertToGraph } from '../core/importer/prd-to-graph.js'
import { extractEntities } from '../core/parser/extract.js'

const PRD_WITH_AC = `
# My Epic

## Task: Build API endpoint

Build the REST API.

### Acceptance Criteria

- Given valid input, When API is called, Then returns 200
- Given missing auth, When API is called, Then returns 401
- Given malformed body, When API is called, Then returns 400
`

const PRD_WITHOUT_AC = `
# My Epic

## Task: Simple task

Just a task with no explicit AC.
`

describe('AC1: task.ac[] populated, no acceptance_criteria child node', () => {
  it('imports 3 AC into task.acceptanceCriteria field', () => {
    const extraction = extractEntities(PRD_WITH_AC)
    const { nodes } = convertToGraph(extraction, 'test.md')

    const task = nodes.find((n) => n.type === 'task')
    expect(task).toBeDefined()
    expect(Array.isArray(task!.acceptanceCriteria)).toBe(true)
    expect(task!.acceptanceCriteria!.length).toBeGreaterThanOrEqual(3)
  })

  it('creates NO acceptance_criteria child node for the task', () => {
    const extraction = extractEntities(PRD_WITH_AC)
    const { nodes } = convertToGraph(extraction, 'test.md')

    const task = nodes.find((n) => n.type === 'task')
    expect(task).toBeDefined()
    const acChildren = nodes.filter((n) => n.type === 'acceptance_criteria' && n.parentId === task!.id)
    expect(acChildren).toHaveLength(0)
  })

  it('AC text is preserved verbatim in the array', () => {
    const extraction = extractEntities(PRD_WITH_AC)
    const { nodes } = convertToGraph(extraction, 'test.md')

    const task = nodes.find((n) => n.type === 'task')
    const ac = task!.acceptanceCriteria ?? []
    expect(ac.some((s) => s.includes('200'))).toBe(true)
  })
})

describe('AC2: DoD check sees AC in field', () => {
  it('task.acceptanceCriteria is non-empty (has_acceptance_criteria passes)', () => {
    const extraction = extractEntities(PRD_WITH_AC)
    const { nodes } = convertToGraph(extraction, 'test.md')
    const task = nodes.find((n) => n.type === 'task')
    expect((task!.acceptanceCriteria ?? []).length).toBeGreaterThan(0)
  })
})

describe('AC3: no AC → empty array, no phantom node', () => {
  it('task has empty or undefined acceptanceCriteria, no ac_criteria child node', () => {
    const extraction = extractEntities(PRD_WITHOUT_AC)
    const { nodes } = convertToGraph(extraction, 'test.md')

    const task = nodes.find((n) => n.type === 'task')
    expect(task).toBeDefined()
    const acChildren = nodes.filter((n) => n.type === 'acceptance_criteria' && n.parentId === task!.id)
    expect(acChildren).toHaveLength(0)
  })
})
