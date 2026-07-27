import { describe, it, expect } from 'vitest'
import { SandboxError } from '../core/errors/sandbox-error.js'
import { GraphError } from '../core/errors/graph-error.js'

describe('SandboxError', () => {
  it('is an instance of GraphError', () => {
    expect(new SandboxError('test')).toBeInstanceOf(GraphError)
  })

  it('sets name to SandboxError', () => {
    const e = new SandboxError('sandbox failed')
    expect(e.name).toBe('SandboxError')
  })

  it('stores message and context', () => {
    const e = new SandboxError('exec error', { cmd: 'ls' })
    expect(e.message).toBe('exec error')
    expect(e.context).toEqual({ cmd: 'ls' })
  })
})
