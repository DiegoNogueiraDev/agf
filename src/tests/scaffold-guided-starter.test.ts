/*!
 * TDD: starter epic+task template with testable AC (node_09d0902a413d).
 *
 * AC: Given the scaffold, when agf check runs on the sample task, then DoD required checks pass.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { scaffoldGuidedStarter } from '../core/init/scaffold-guided-starter.js'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

describe('starter epic+task template', () => {
  it('scaffolded task passes all required DoD checks', () => {
    const store = makeStore()
    const result = scaffoldGuidedStarter(store)

    expect(result.added).toBe(true)
    expect(result.taskId).toBeDefined()

    // Simulate `agf start` — DoD requires in_progress status
    store.updateNodeStatus(result.taskId!, 'in_progress')

    const doc = store.toGraphDocument()
    const taskNode = doc.nodes.find((n) => n.id === result.taskId)
    expect(taskNode).toBeDefined()

    const dod = checkDefinitionOfDone(doc, result.taskId!)
    const failedRequired = dod.checks.filter((c) => c.severity === 'required' && !c.passed)

    expect(failedRequired).toHaveLength(0)
  })

  it('scaffold is idempotent — second call skips on non-empty graph', () => {
    const store = makeStore()
    const r1 = scaffoldGuidedStarter(store)
    const r2 = scaffoldGuidedStarter(store)

    expect(r1.added).toBe(true)
    expect(r2.added).toBe(false)
  })

  it('scaffolded epic has descriptive title', () => {
    const store = makeStore()
    const result = scaffoldGuidedStarter(store)

    const doc = store.toGraphDocument()
    const epic = doc.nodes.find((n) => n.id === result.epicId)
    expect(epic?.title.length).toBeGreaterThan(5)
    expect(epic?.type).toBe('epic')
  })
})
