import { describe, it, expect } from 'vitest'
import { AgentDriverError } from '../core/errors/agent-driver-error.js'
import { GraphError } from '../core/errors/graph-error.js'

describe('AgentDriverError', () => {
  it('is an instance of GraphError', () => {
    expect(new AgentDriverError('test')).toBeInstanceOf(GraphError)
  })

  it('sets name to AgentDriverError', () => {
    const e = new AgentDriverError('driver crashed')
    expect(e.name).toBe('AgentDriverError')
  })

  it('stores message and context', () => {
    const e = new AgentDriverError('timeout', { agentId: 'a1', ms: 5000 })
    expect(e.message).toBe('timeout')
    expect(e.context).toEqual({ agentId: 'a1', ms: 5000 })
  })
})
