/*!
 * node_27ee10d7511b (A2) — run-build wires the harvest hook into its autopilot call,
 * so `agf build`/`deliver` also harvest at NO_TASKS (default-on; --no-harvest opts out).
 * We spy on runAutopilot to capture the options it receives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { runAutopilotSpy } = vi.hoisted(() => ({
  runAutopilotSpy: vi.fn(async () => ({
    steps: [],
    completed: 1,
    escalated: 0,
    stopped: 'no_more_tasks' as const,
  })),
}))
vi.mock('../core/autonomy/autopilot-loop.js', () => ({ runAutopilot: runAutopilotSpy }))

import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { runBuildOrchestration } from '../cli/shared/run-build.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'

function ts(): string {
  return new Date().toISOString()
}
function node(over: Partial<GraphNode> & { type: string; title: string }): GraphNode {
  return {
    id: `node_${Math.random().toString(16).slice(2, 14)}`,
    type: over.type as never,
    title: over.title,
    status: (over.status as never) ?? 'backlog',
    priority: over.priority ?? 3,
    createdAt: ts(),
    updatedAt: ts(),
  }
}

/** Store with a requirement + one ready task so deriveDeliveryState routes to `implement`. */
function readyStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  store.insertNode(node({ type: 'requirement', title: 'REQ' }))
  store.insertNode(node({ type: 'task', title: 'a ready task' }))
  return store
}

function opts(store: SqliteStore, over: { noHarvest?: boolean } = {}): Parameters<typeof runBuildOrchestration>[1] {
  return {
    dir: process.cwd(),
    maxSteps: 3,
    live: false,
    testCmd: 'npm test',
    ledger: new TokenLedger(),
    onLog: () => {},
    ...over,
  }
}

describe('A2: run-build wires onHarvest into runAutopilot', () => {
  beforeEach(() => {
    runAutopilotSpy.mockClear()
    // converge runDelivery: mark the ready task done so the loop stops at done
    runAutopilotSpy.mockImplementation(async () => ({
      steps: [],
      completed: 1,
      escalated: 0,
      stopped: 'no_more_tasks',
    }))
  })

  it('default ⇒ onHarvest is a function (agf build harvests at NO_TASKS)', async () => {
    const store = readyStore()
    await runBuildOrchestration(store, opts(store)).catch(() => {})
    expect(runAutopilotSpy).toHaveBeenCalled()
    const passed = runAutopilotSpy.mock.calls.at(-1)![1] as { onHarvest?: unknown }
    expect(typeof passed.onHarvest).toBe('function')
  })

  it('noHarvest=true ⇒ onHarvest is undefined (opt-out propagates)', async () => {
    const store = readyStore()
    await runBuildOrchestration(store, opts(store, { noHarvest: true })).catch(() => {})
    const passed = runAutopilotSpy.mock.calls.at(-1)![1] as { onHarvest?: unknown }
    expect(passed.onHarvest).toBeUndefined()
  })
})
