/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_ee79a94204e0 — extractEntities folds bullets from an AC section into the
 * parent task block's acceptanceCriteria[] (no ownerless acceptance_criteria nodes).
 */
import { describe, it, expect } from 'vitest'
import { extractEntities } from '../core/parser/extract.js'

function findTask(text: string) {
  const { blocks } = extractEntities(text)
  return blocks.find((b) => b.type === 'task')
}

describe('extractEntities — AC bullets fold into parent task (node_ee79a94204e0)', () => {
  it('collects the 3 bullets of an Acceptance Criteria section into the parent task', () => {
    const md = `# Epic Login

### Task: Build login form

Implement the login UI.

#### Acceptance Criteria

- User can enter email and password
- Invalid credentials show an error
- Successful login redirects to dashboard
`
    const task = findTask(md)
    expect(task).toBeDefined()
    expect(task?.acceptanceCriteria).toBeDefined()
    expect(task?.acceptanceCriteria).toHaveLength(3)
    expect(task?.acceptanceCriteria?.[0]).toContain('email and password')
  })

  it('leaves acceptanceCriteria undefined for a task with no AC section, without throwing', () => {
    const md = `### Task: Plain task

Just a body, no acceptance criteria here.
`
    expect(() => extractEntities(md)).not.toThrow()
    const task = findTask(md)
    expect(task?.acceptanceCriteria).toBeUndefined()
  })

  it('recognizes AC, Critérios de Aceite and Given-When-Then section headers', () => {
    for (const header of ['AC', 'Critérios de Aceite', 'Given-When-Then']) {
      const md = `### Task: Build the widget

Body.

#### ${header}

- first criterion
- second criterion
`
      const task = findTask(md)
      expect(task?.acceptanceCriteria, `header "${header}" should be recognized`).toBeDefined()
      expect(task?.acceptanceCriteria?.length, `header "${header}"`).toBeGreaterThanOrEqual(2)
    }
  })
})
