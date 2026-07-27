import { describe, it, expect } from 'vitest'
import { PluginToolRegistry } from '../../core/plugins/plugin-tool-registry.js'

describe('PluginToolRegistry', () => {
  it('register() stores a tool and list() returns it', () => {
    const reg = new PluginToolRegistry()
    const handler = async () => 'ok'
    reg.register({ toolName: 'my-tool', pluginName: 'p1', handler })
    const tools = reg.list()
    expect(tools).toHaveLength(1)
    expect(tools[0].toolName).toBe('my-tool')
    expect(tools[0].pluginName).toBe('p1')
  })

  it('isPluginTool() returns true for registered tools', () => {
    const reg = new PluginToolRegistry()
    reg.register({ toolName: 'exists', pluginName: 'p1', handler: async () => 'ok' })
    expect(reg.isPluginTool('exists')).toBe(true)
    expect(reg.isPluginTool('unknown')).toBe(false)
  })

  it('getPluginForTool() returns the owning plugin name', () => {
    const reg = new PluginToolRegistry()
    reg.register({ toolName: 't1', pluginName: 'plugin-a', handler: async () => 'ok' })
    expect(reg.getPluginForTool('t1')).toBe('plugin-a')
    expect(reg.getPluginForTool('missing')).toBeUndefined()
  })

  it('enablePlugin / disablePlugin toggles enabled state', () => {
    const reg = new PluginToolRegistry()
    expect(reg.isPluginEnabled('p1')).toBe(true)
    reg.disablePlugin('p1')
    expect(reg.isPluginEnabled('p1')).toBe(false)
    reg.enablePlugin('p1')
    expect(reg.isPluginEnabled('p1')).toBe(true)
  })

  it('removePlugin() removes all tools and disabled state for a plugin', () => {
    const reg = new PluginToolRegistry()
    reg.register({ toolName: 't1', pluginName: 'p1', handler: async () => 'ok' })
    reg.register({ toolName: 't2', pluginName: 'p1', handler: async () => 'ok' })
    reg.register({ toolName: 't3', pluginName: 'p2', handler: async () => 'ok' })
    reg.disablePlugin('p1')
    reg.removePlugin('p1')
    expect(reg.list()).toHaveLength(1)
    expect(reg.list()[0].toolName).toBe('t3')
    expect(reg.isPluginEnabled('p1')).toBe(true) // disabled state cleared
  })

  it('markWrapped / isWrapped tracks wrapped tools', () => {
    const reg = new PluginToolRegistry()
    reg.register({ toolName: 'w', pluginName: 'p1', handler: async () => 'ok' })
    expect(reg.isWrapped('w')).toBe(false)
    reg.markWrapped('w')
    expect(reg.isWrapped('w')).toBe(true)
  })

  it('getUnwrappedTools() returns only tools not yet wrapped', () => {
    const reg = new PluginToolRegistry()
    reg.register({ toolName: 'a', pluginName: 'p1', handler: async () => 'ok' })
    reg.register({ toolName: 'b', pluginName: 'p1', handler: async () => 'ok' })
    reg.markWrapped('a')
    const unwrapped = reg.getUnwrappedTools()
    expect(unwrapped).toHaveLength(1)
    expect(unwrapped[0].toolName).toBe('b')
  })
})
