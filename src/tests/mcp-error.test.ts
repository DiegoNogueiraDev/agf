import { describe, it, expect } from 'vitest'
import { McpError } from '../core/errors/mcp-error.js'
import { GraphError } from '../core/errors/graph-error.js'

describe('McpError', () => {
  it('is an instance of GraphError', () => {
    expect(new McpError('test')).toBeInstanceOf(GraphError)
  })

  it('is an instance of Error', () => {
    expect(new McpError('test')).toBeInstanceOf(Error)
  })

  it('sets name to McpError', () => {
    const e = new McpError('protocol error')
    expect(e.name).toBe('McpError')
  })

  it('stores message', () => {
    const e = new McpError('connection refused')
    expect(e.message).toBe('connection refused')
  })

  it('stores context', () => {
    const e = new McpError('err', { tool: 'agf' })
    expect(e.context).toEqual({ tool: 'agf' })
  })
})
