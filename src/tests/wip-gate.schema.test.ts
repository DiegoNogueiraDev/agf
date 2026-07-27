import { describe, it, expect } from 'vitest'
import { MultiAgentWipGate } from '../schemas/wip-gate.schema.js'

describe('MultiAgentWipGate', () => {
  it('acquires a slot for an agent', () => {
    const gate = new MultiAgentWipGate()
    expect(gate.tryAcquire('agent-1', 'worker').acquired).toBe(true)
  })

  it('blocks duplicate acquisition by same agent', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('agent-1', 'worker')
    const result = gate.tryAcquire('agent-1', 'worker')
    expect(result.acquired).toBe(false)
    expect(result.reason).toContain('agent-1')
  })

  it('respects default capacity of 1', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('agent-1', 'worker')
    const result = gate.tryAcquire('agent-2', 'worker')
    expect(result.acquired).toBe(false)
  })

  it('allows higher capacity with roleCapacities', () => {
    const gate = new MultiAgentWipGate({ roleCapacities: { worker: 2 } })
    expect(gate.tryAcquire('agent-1', 'worker').acquired).toBe(true)
    expect(gate.tryAcquire('agent-2', 'worker').acquired).toBe(true)
    expect(gate.tryAcquire('agent-3', 'worker').acquired).toBe(false)
  })

  it('releases slot and allows re-acquire', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('agent-1', 'worker')
    gate.release('agent-1', 'worker')
    expect(gate.tryAcquire('agent-2', 'worker').acquired).toBe(true)
  })

  it('throws when releasing non-existent agent', () => {
    const gate = new MultiAgentWipGate()
    expect(() => gate.release('ghost', 'worker')).toThrow()
  })

  it('reports activeCount and isActive', () => {
    const gate = new MultiAgentWipGate({ roleCapacities: { worker: 5 } })
    gate.tryAcquire('agent-1', 'worker')
    gate.tryAcquire('agent-2', 'worker')
    expect(gate.activeCount('worker')).toBe(2)
    expect(gate.isActive('agent-1')).toBe(true)
    expect(gate.isActive('agent-3')).toBe(false)
    expect(gate.totalActive()).toBe(2)
  })

  it('lists active agents', () => {
    const gate = new MultiAgentWipGate({ roleCapacities: { worker: 5 } })
    gate.tryAcquire('agent-1', 'worker')
    const list = gate.listActive()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ agentId: 'agent-1', roleName: 'worker' })
  })
})
