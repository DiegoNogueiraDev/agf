import { describe, it, expect, vi } from 'vitest'
import { PluginLoader, type PluginContext } from '../core/plugins/plugin-loader.js'
import { PluginRegistry } from '../core/plugins/plugin-registry.js'
import { ExtensionRegistryBuilder } from '../core/plugins/extension-registry.js'
import type { PluginManifest } from '../schemas/plugin.schema.js'

describe('PluginLoader + Extension Hooks', () => {
  it('should register lifecycle hooks from plugin context', async () => {
    const builder = new ExtensionRegistryBuilder()
    const registry = new PluginRegistry()
    const loader = new PluginLoader(registry)

    const manifest: PluginManifest = {
      name: 'test-hooks',
      version: '1.0.0',
      description: 'Test plugin with lifecycle hooks',
      entryPoint: 'test.js',
      capabilities: ['event_handler'],
      lifecycleHooks: ['turn', 'tool'],
    }

    const onTurnStart = vi.fn()
    const onTurnStop = vi.fn()
    const onToolStart = vi.fn()
    const onToolFinish = vi.fn()

    const instance = {
      activate: (ctx: PluginContext) => {
        ctx.registerTurnHook({ onTurnStart, onTurnStop })
        ctx.registerToolHook({ onToolStart, onToolFinish })
      },
    }

    await loader.loadPlugin(manifest, instance, builder)
    const loadedRegistry = builder.build()

    expect(loadedRegistry.turnLifecycleContributors()).toHaveLength(1)
    expect(loadedRegistry.toolLifecycleContributors()).toHaveLength(1)
  })

  it('should dispatch turn hooks in order', async () => {
    const builder = new ExtensionRegistryBuilder()
    const registry = new PluginRegistry()
    const loader = new PluginLoader(registry)

    const order: string[] = []
    const instance = {
      activate: (ctx: PluginContext) => {
        ctx.registerTurnHook({
          onTurnStart: () => order.push('start'),
          onTurnStop: () => order.push('stop'),
        })
      },
    }

    const manifest: PluginManifest = {
      name: 'order-test',
      version: '1.0.0',
      description: 'Order test',
      entryPoint: 'test.js',
      capabilities: ['event_handler'],
      lifecycleHooks: ['turn'],
    }

    await loader.loadPlugin(manifest, instance, builder)
    const loadedRegistry = builder.build()
    const contributors = loadedRegistry.turnLifecycleContributors()

    await contributors[0]!.onTurnStart!()
    await contributors[0]!.onTurnStop!()

    expect(order).toEqual(['start', 'stop'])
  })

  it('should work without lifecycle hooks in manifest', async () => {
    const builder = new ExtensionRegistryBuilder()
    const registry = new PluginRegistry()
    const loader = new PluginLoader(registry)

    const manifest: PluginManifest = {
      name: 'no-hooks',
      version: '1.0.0',
      description: 'Plugin without hooks',
      entryPoint: 'test.js',
      capabilities: ['tool'],
    }

    const instance = {
      activate: vi.fn(),
    }

    await loader.loadPlugin(manifest, instance, builder)
    const loadedRegistry = builder.build()
    expect(loadedRegistry.turnLifecycleContributors()).toHaveLength(0)
    expect(instance.activate).toHaveBeenCalled()
  })

  it('should handle multiple plugins with hooks', async () => {
    const builder = new ExtensionRegistryBuilder()
    const registry = new PluginRegistry()
    const loader = new PluginLoader(registry)

    const instance1 = {
      activate: (ctx: PluginContext) => {
        ctx.registerTurnHook({ onTurnStart: vi.fn() })
      },
    }
    const instance2 = {
      activate: (ctx: PluginContext) => {
        ctx.registerTurnHook({ onTurnStart: vi.fn() })
      },
    }

    await Promise.all([
      loader.loadPlugin(
        {
          name: 'p1',
          version: '1.0.0',
          description: 'p1',
          entryPoint: 'p1.js',
          capabilities: ['event_handler'],
          lifecycleHooks: ['turn'],
        },
        instance1,
        builder,
      ),
      loader.loadPlugin(
        {
          name: 'p2',
          version: '1.0.0',
          description: 'p2',
          entryPoint: 'p2.js',
          capabilities: ['event_handler'],
          lifecycleHooks: ['turn'],
        },
        instance2,
        builder,
      ),
    ])

    const loadedRegistry = builder.build()
    expect(loadedRegistry.turnLifecycleContributors()).toHaveLength(2)
  })
})
