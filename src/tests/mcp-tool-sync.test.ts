import { describe, it, expect, vi } from 'vitest'
import { McpToolRegistry } from '../core/mcp/mcp-tool-sync.js'

describe('McpToolRegistry', () => {
  it('starts empty', () => {
    const reg = new McpToolRegistry()
    expect(reg.count).toBe(0)
    expect(reg.all).toEqual([])
  })

  it('stores tools after setFromServer', () => {
    const reg = new McpToolRegistry()
    reg.setFromServer([{ name: 'agf-next', description: 'Pull next task' }])
    expect(reg.count).toBe(1)
    expect(reg.all[0]?.name).toBe('agf-next')
  })

  it('returns a copy of tools (immutable snapshot)', () => {
    const reg = new McpToolRegistry()
    reg.setFromServer([{ name: 'tool-a' }])
    const snapshot = reg.all
    reg.setFromServer([{ name: 'tool-b' }])
    expect(snapshot[0]?.name).toBe('tool-a')
    expect(reg.all[0]?.name).toBe('tool-b')
  })

  it('fires listener on setFromServer', () => {
    const reg = new McpToolRegistry()
    const listener = vi.fn()
    reg.onChanged(listener)
    reg.setFromServer([{ name: 'tool-x' }])
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]![0][0].name).toBe('tool-x')
  })

  it('fires listener immediately if tools already loaded', () => {
    const reg = new McpToolRegistry()
    reg.setFromServer([{ name: 'pre-existing' }])
    const listener = vi.fn()
    reg.onChanged(listener)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('does not fire listener immediately when no tools loaded', () => {
    const reg = new McpToolRegistry()
    const listener = vi.fn()
    reg.onChanged(listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it('strips inputSchema that cannot be JSON-serialized', () => {
    const reg = new McpToolRegistry()
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    reg.setFromServer([{ name: 'bad-schema', inputSchema: circular }])
    expect(reg.all[0]?.inputSchema).toEqual({ type: 'object', description: 'schema unavailable' })
  })
})
