/*!
 * Tests for generate-prd AC inclusion in generated markdown.
 * AC:
 *   - buildPrdPrompt output includes per-task AC section instruction
 *   - generatePrd with a template fake emits tasks with ≥2 Given-When-Then bullets
 *   - extractEntities + convertToGraph picks up AC natively (no synthesizer)
 */

import { describe, it, expect } from 'vitest'
import { buildPrdPrompt, generatePrd } from '../core/prd/generate-prd.js'
import { extractEntities } from '../core/parser/extract.js'
import { convertToGraph } from '../core/importer/index.js'

describe('buildPrdPrompt', () => {
  it('instructs the LLM to include per-task Acceptance Criteria with Given-When-Then', () => {
    const prompt = buildPrdPrompt('Build a task manager app')
    // Must guide the LLM to emit per-task AC sections parseable by extractEntities
    expect(prompt).toMatch(/crit[eé]rios?\s+de\s+aceita[cç]|acceptance\s+criteria/i)
    expect(prompt).toMatch(/given|quando|when/i)
    expect(prompt).toMatch(/task|tarefa/i)
  })
})

describe('generatePrd with template fake', () => {
  const fakePrd = `
## Objetivo
Build a simple task manager.

## Épicos

### EPIC-1: Task Management

#### TASK-1.1: Create task
Create a new task with title and description.

##### Acceptance Criteria
- Given a user provides a title, When they submit, Then a task is created with that title
- Given no title is provided, When they submit, Then an error is shown

#### TASK-1.2: List tasks
View all tasks in a list.

##### Acceptance Criteria
- Given tasks exist, When the user views the list, Then all tasks are displayed
- Given no tasks exist, When the user views the list, Then an empty state is shown
`

  it('generatePrd returns the LLM output unchanged', async () => {
    const result = await generatePrd('task manager', { generate: async () => fakePrd })
    expect(result).toBe(fakePrd)
  })

  it('extractEntities picks up per-task AC from the template output', () => {
    const result = extractEntities(fakePrd)
    const tasks = result.blocks.filter((b) => b.type === 'task')
    expect(tasks.length).toBeGreaterThanOrEqual(2)
    for (const task of tasks) {
      expect(task.acceptanceCriteria?.length ?? 0).toBeGreaterThanOrEqual(2)
    }
  })

  it('convertToGraph produces tasks with acceptanceCriteria without synthesizer', () => {
    const result = extractEntities(fakePrd)
    const graph = convertToGraph(result, 'test.md')
    const taskNodes = graph.nodes.filter((n) => n.type === 'task')
    expect(taskNodes.length).toBeGreaterThanOrEqual(1)
    for (const node of taskNodes) {
      const ac = node.acceptanceCriteria ?? []
      expect(ac.length).toBeGreaterThanOrEqual(2)
      // Real AC contains Given/When/Then — synthesizer fallback does not
      const hasRealAc = ac.some((a) => /given|when|then/i.test(a))
      expect(hasRealAc).toBe(true)
    }
  })
})
