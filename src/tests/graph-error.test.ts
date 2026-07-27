import { describe, it, expect } from 'vitest'
import { GraphError } from '../core/errors/graph-error.js'

describe('GraphError', () => {
  it('is an instance of Error', () => {
    const e = new GraphError('test message')
    expect(e).toBeInstanceOf(Error)
  })

  it('sets name to GraphError', () => {
    const e = new GraphError('oops')
    expect(e.name).toBe('GraphError')
  })

  it('stores message', () => {
    const e = new GraphError('something went wrong')
    expect(e.message).toBe('something went wrong')
  })

  it('stores context', () => {
    const e = new GraphError('ctx error', { nodeId: 'n1', code: 42 })
    expect(e.context).toEqual({ nodeId: 'n1', code: 42 })
  })

  it('defaults context to empty object', () => {
    const e = new GraphError('no ctx')
    expect(e.context).toEqual({})
  })

  it('can be caught as Error', () => {
    expect(() => {
      throw new GraphError('catchable')
    }).toThrow('catchable')
  })
})
