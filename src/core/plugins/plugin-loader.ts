/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Plugin Loader — dynamic ESM import with error boundaries.
 * Validates manifests, resolves dependencies via topological sort,
 * and activates plugins with PluginContext.
 * v1: blessed plugins only (local paths), no sandbox.
 */

import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import { PluginRegistry } from './plugin-registry.js'
import type { PluginManifest } from './plugin-registry.js'
import type { ExtensionRegistryBuilder } from './extension-registry.js'
import type { TurnLifecycleContributor, ToolLifecycleContributor } from '../../schemas/extension-lifecycle.schema.js'

const log = createLogger({ layer: 'core', source: 'plugin-loader.ts' })

export interface PluginContext {
  registerTool: (name: string, handler: unknown) => void
  registerAnalyzer: (name: string, handler: unknown) => void
  registerValidator: (name: string, handler: unknown) => void
  registerClassifierPattern: (nodeType: string, patterns: string[]) => void
  registerTemplate: (name: string, template: unknown) => void
  registerTurnHook: (contributor: TurnLifecycleContributor) => void
  registerToolHook: (contributor: ToolLifecycleContributor) => void
}

export interface PluginInstance {
  activate: (context: PluginContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

export class PluginCircularDependencyError extends McpGraphError {
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' → ')}`)
    this.name = 'PluginCircularDependencyError'
  }
}

/**
 * Topological sort of plugin manifests by dependency order.
 * Throws on circular dependencies.
 */
export function resolveLoadOrder(manifests: PluginManifest[]): PluginManifest[] {
  const nameToManifest = new Map(manifests.map((m) => [m.name, m]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const sorted: PluginManifest[] = []

  function visit(name: string, path: string[]): void {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      throw new PluginCircularDependencyError([...path, name])
    }

    visiting.add(name)
    const manifest = nameToManifest.get(name)
    if (manifest) {
      const deps = manifest.requires?.plugins ?? []
      for (const dep of deps) {
        visit(dep, [...path, name])
      }
      sorted.push(manifest)
    }
    visiting.delete(name)
    visited.add(name)
  }

  for (const manifest of manifests) {
    visit(manifest.name, [])
  }

  return sorted
}

function createPluginContext(registryBuilder?: ExtensionRegistryBuilder): PluginContext {
  return {
    registerTool: (_name: string, _handler: unknown) => {
      log.debug(`Plugin registered tool: ${_name}`)
    },
    registerAnalyzer: (_name: string, _handler: unknown) => {
      log.debug(`Plugin registered analyzer: ${_name}`)
    },
    registerValidator: (_name: string, _handler: unknown) => {
      log.debug(`Plugin registered validator: ${_name}`)
    },
    registerClassifierPattern: (_nodeType: string, _patterns: string[]) => {
      log.debug(`Plugin registered classifier patterns for: ${_nodeType}`)
    },
    registerTemplate: (_name: string, _template: unknown) => {
      log.debug(`Plugin registered template: ${_name}`)
    },
    registerTurnHook: (contributor: TurnLifecycleContributor) => {
      registryBuilder?.addTurnLifecycleContributor(contributor)
      log.debug(`Plugin registered turn lifecycle hook`)
    },
    registerToolHook: (contributor: ToolLifecycleContributor) => {
      registryBuilder?.addToolLifecycleContributor(contributor)
      log.debug(`Plugin registered tool lifecycle hook`)
    },
  }
}

export class PluginLoader {
  private readonly instances: Map<string, PluginInstance> = new Map()

  constructor(private readonly registry: PluginRegistry) {}

  async loadPlugin(
    manifest: PluginManifest,
    instance: PluginInstance,
    registryBuilder?: ExtensionRegistryBuilder,
  ): Promise<void> {
    // Idempotency: loading an already-active plugin again must not re-register
    // its manifest or re-run activate() (which would double-register tools,
    // contributors and hooks). Unload first if a reload is intended.
    if (this.instances.has(manifest.name)) {
      log.debug(`Plugin already loaded, skipping re-load: ${manifest.name}`)
      return
    }

    const context = createPluginContext(registryBuilder)

    // Register in registry first (validates deps/conflicts)
    try {
      this.registry.register(manifest)
    } catch (err) {
      log.error(`Plugin registration failed: ${manifest.name}`, {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }

    // Activate with error boundary
    try {
      await instance.activate(context)
      this.instances.set(manifest.name, instance)
      log.info(`Plugin activated: ${manifest.name}@${manifest.version}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      // Mark as error in registry instead of removing
      const registration = this.registry.get(manifest.name)
      if (registration) {
        registration.status = 'error'
        registration.error = errorMsg
      }
      log.error(`Plugin activation failed: ${manifest.name}`, { error: errorMsg })
    }
  }

  async unloadPlugin(name: string): Promise<void> {
    const instance = this.instances.get(name)
    if (instance?.deactivate) {
      try {
        await instance.deactivate()
      } catch (err) {
        log.error(`Plugin deactivation error: ${name}`, { error: err instanceof Error ? err.message : String(err) })
      }
    }
    this.instances.delete(name)
    this.registry.remove(name)
    log.info(`Plugin unloaded: ${name}`)
  }

  async loadPlugins(manifests: PluginManifest[], instanceMap: Map<string, PluginInstance>): Promise<void> {
    const sorted = resolveLoadOrder(manifests)
    for (const manifest of sorted) {
      const instance = instanceMap.get(manifest.name)
      if (instance) {
        await this.loadPlugin(manifest, instance)
      }
    }
  }
}
