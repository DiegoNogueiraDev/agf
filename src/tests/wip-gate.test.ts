import { describe, it, expect } from 'vitest'
import { MultiAgentWipGate } from '../schemas/wip-gate.schema.js'
import { AgentRoleRegistry } from '../schemas/agent-registry.schema.js'

describe('MultiAgentWipGate', () => {
  it('should allow first agent for a role', () => {
    const gate = new MultiAgentWipGate()
    const result = gate.tryAcquire('agent_1', 'builder')
    expect(result.acquired).toBe(true)
  })

  it('should deny second agent for same role with WIP=1', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('agent_1', 'builder')
    const result = gate.tryAcquire('agent_2', 'builder')
    expect(result.acquired).toBe(false)
    expect(result.reason).toContain('WIP')
  })

  it('should allow different roles simultaneously', () => {
    const gate = new MultiAgentWipGate()
    expect(gate.tryAcquire('agent_1', 'builder').acquired).toBe(true)
    expect(gate.tryAcquire('agent_2', 'explorer').acquired).toBe(true)
  })

  it('should release agent and allow new agent', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('agent_1', 'builder')
    gate.release('agent_1', 'builder')

    const result = gate.tryAcquire('agent_2', 'builder')
    expect(result.acquired).toBe(true)
  })

  it('should accept optional capacity per role', () => {
    const gate = new MultiAgentWipGate({ roleCapacities: { explorer: 3 } })
    expect(gate.tryAcquire('e1', 'explorer').acquired).toBe(true)
    expect(gate.tryAcquire('e2', 'explorer').acquired).toBe(true)
    expect(gate.tryAcquire('e3', 'explorer').acquired).toBe(true)
    expect(gate.tryAcquire('e4', 'explorer').acquired).toBe(false)
  })

  it('should reject release of unknown agent', () => {
    const gate = new MultiAgentWipGate()
    expect(() => gate.release('ghost', 'builder')).toThrow(/not found/)
  })

  it('should report active count per role', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('a1', 'builder')
    gate.tryAcquire('a2', 'explorer')
    expect(gate.activeCount('builder')).toBe(1)
    expect(gate.activeCount('explorer')).toBe(1)
    expect(gate.activeCount('reviewer')).toBe(0)
  })

  it('should integrate with AgentRoleRegistry lease token', () => {
    const gate = new MultiAgentWipGate()
    const registry = new AgentRoleRegistry()

    const token = registry.reserve('builder')
    const acquired = gate.tryAcquire(token.agentId, token.roleName)
    expect(acquired.acquired).toBe(true)
  })

  it('should prevent double-claim of same agentId', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('unique_agent', 'builder')
    const result = gate.tryAcquire('unique_agent', 'builder')
    expect(result.acquired).toBe(false)
    expect(result.reason).toContain('already')
  })
})
