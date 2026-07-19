import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry } from '../../core/plugins/plugin-registry.js'
import { PluginLoader, resolveLoadOrder, PluginCircularDependencyError } from '../../core/plugins/plugin-loader.js'
import type { PluginManifest, PluginInstance } from '../../core/plugins/plugin-loader.js'

function makeManifest(name: string, opts?: { requires?: string[]; conflicts?: string[] }): PluginManifest {
  return {
    name,
    version: '1.0.0',
    requires: opts?.requires ? { plugins: opts.requires } : undefined,
    conflicts: opts?.conflicts,
  } as PluginManifest
}

describe('resolveLoadOrder (topological sort)', () => {
  function m(name: string, requires?: string[]): PluginManifest {
    return makeManifest(name, requires ? { requires } : undefined)
  }

  it('orders single plugin correctly', () => {
    const result = resolveLoadOrder([m('a')])
    expect(result.map((r) => r.name)).toEqual(['a'])
  })

  it('includes all independent plugins in result', () => {
    const result = resolveLoadOrder([m('b'), m('a')])
    const names = result.map((r) => r.name)
    expect(names).toContain('a')
    expect(names).toContain('b')
    expect(names).toHaveLength(2)
  })

  it('places dependencies before dependents', () => {
    const result = resolveLoadOrder([m('app', ['lib']), m('lib')])
    expect(result.map((r) => r.name)).toEqual(['lib', 'app'])
  })

  it('resolves deep dependency chains', () => {
    const result = resolveLoadOrder([m('frontend', ['backend']), m('backend', ['core']), m('core')])
    expect(result.map((r) => r.name)).toEqual(['core', 'backend', 'frontend'])
  })

  it('throws on circular dependencies', () => {
    const manifests = [m('a', ['b']), m('b', ['a'])]
    expect(() => resolveLoadOrder(manifests)).toThrow(PluginCircularDependencyError)
  })
})

describe('PluginLoader', () => {
  let registry: PluginRegistry
  let loader: PluginLoader

  beforeEach(() => {
    registry = new PluginRegistry()
    loader = new PluginLoader(registry)
  })

  it('loadPlugin registers and activates plugin', async () => {
    const activate = vi.fn().mockResolvedValue(undefined)
    const instance: PluginInstance = { activate }

    await loader.loadPlugin(makeManifest('my-plugin'), instance)

    expect(registry.has('my-plugin')).toBe(true)
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('activation failure marks plugin as error instead of removing', async () => {
    const instance: PluginInstance = {
      activate: vi.fn().mockRejectedValue(new Error('activation error')),
    }

    await loader.loadPlugin(makeManifest('crash-plugin'), instance)

    const reg = registry.get('crash-plugin')
    expect(reg).toBeDefined()
    expect(reg!.status).toBe('error')
    expect(reg!.error).toContain('activation error')
  })

  it('unloadPlugin calls deactivate if available', async () => {
    const deactivate = vi.fn().mockResolvedValue(undefined)
    const instance: PluginInstance = { activate: vi.fn().mockResolvedValue(undefined), deactivate }

    await loader.loadPlugin(makeManifest('plugin'), instance)
    await loader.unloadPlugin('plugin')
    expect(deactivate).toHaveBeenCalledTimes(1)
  })

  it('unloadPlugin removes from registry', async () => {
    const instance: PluginInstance = { activate: vi.fn().mockResolvedValue(undefined) }

    await loader.loadPlugin(makeManifest('plugin'), instance)
    await loader.unloadPlugin('plugin')
    expect(registry.has('plugin')).toBe(false)
  })

  it('loadPlugin re-throws registration errors', async () => {
    const instance: PluginInstance = { activate: vi.fn().mockResolvedValue(undefined) }
    registry.register(makeManifest('existing', { conflicts: ['new-plugin'] }))

    await expect(loader.loadPlugin(makeManifest('new-plugin'), instance)).rejects.toThrow()
  })
})
