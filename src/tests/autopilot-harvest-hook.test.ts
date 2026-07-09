/*!
 * TDD: autopilot harvest hook at NO_TASKS (node_ed1f6c33b7b9).
 *
 * Backlog-empty must be the TRIGGER for a harvest pass, not the end. When
 * nextTask() returns null and onHarvest is provided, the loop runs harvest;
 * if it generated new tasks, the loop re-enters and drains them. Only when
 * harvest is also dry does it stop with 'no_more_tasks'. Without onHarvest,
 * behaviour is byte-identical to the legacy loop (stops immediately).
 *
 * AC1: empty backlog + onHarvest generating a task ⇒ loop processes it (self-feeds).
 * AC2: harvest is called when the backlog is empty.
 * AC3: no onHarvest ⇒ stops immediately (zero regression).
 */

import { describe, it, expect } from 'vitest'
import { runAutopilot, type AutopilotGraphPort } from '../core/autonomy/autopilot-loop.js'

function harvestablePort(): AutopilotGraphPort {
  let harvested = false
  let served = false
  return {
    nextTask() {
      if (!harvested) return null // empty backlog until harvest runs
      if (!served) {
        served = true
        return { id: 'h1', title: 'harvested task' }
      }
      return null
    },
    markInProgress() {},
    checkDone: () => ({ ready: true, failedRequired: [] }),
    markDone() {},
    // expose a setter via closure trick: onHarvest flips `harvested`
    __flip() {
      harvested = true
    },
  } as AutopilotGraphPort & { __flip: () => void }
}

describe('AC1+AC2: NO_TASKS triggers harvest and the loop self-feeds', () => {
  it('harvest generates a task ⇒ loop drains it instead of stopping', async () => {
    const port = harvestablePort() as AutopilotGraphPort & { __flip: () => void }
    let harvestCalls = 0
    const result = await runAutopilot(port, {
      maxIterations: 10,
      onHarvest: () => {
        harvestCalls++
        port.__flip()
        return { generated: 1 }
      },
    })
    expect(harvestCalls).toBeGreaterThan(0)
    expect(result.completed).toBe(1)
  })
})

describe('AC3: no onHarvest ⇒ stops immediately (zero regression)', () => {
  it('empty backlog without onHarvest stops with no_more_tasks', async () => {
    const port: AutopilotGraphPort = {
      nextTask: () => null,
      markInProgress() {},
      checkDone: () => ({ ready: true, failedRequired: [] }),
      markDone() {},
    }
    const result = await runAutopilot(port, { maxIterations: 10 })
    expect(result.stopped).toBe('no_more_tasks')
    expect(result.completed).toBe(0)
  })
})
