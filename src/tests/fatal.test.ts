import { describe, it, expect } from 'vitest'
import { buildFatalEnvelope } from '../cli/fatal.js'
import { AgentDriverError } from '../core/errors/agent-driver-error.js'

describe('buildFatalEnvelope', () => {
  it('stamps AGENT_DRIVER_ERROR for an AgentDriverError instead of generic UNCAUGHT', () => {
    const err = new AgentDriverError('LLM call failed', { model: 'claude-sonnet', attempt: 3 })
    const envelope = buildFatalEnvelope(err)
    expect(envelope.code).toBe('AGENT_DRIVER_ERROR')
    expect(envelope.error).toBe('LLM call failed')
    expect(envelope.ok).toBe(false)
  })

  it('still stamps UNCAUGHT for an unrelated error', () => {
    const envelope = buildFatalEnvelope(new Error('boom'))
    expect(envelope.code).toBe('UNCAUGHT')
  })
})
