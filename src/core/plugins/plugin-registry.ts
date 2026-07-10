/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import type { PluginManifest as SchemaPluginManifest } from '../../schemas/plugin.schema.js'

const log = createLogger({ layer: 'core', source: 'plugin-registry.ts' })

export type PluginManifest = SchemaPluginManifest

export type PluginStatus = 'enabled' | 'disabled' | 'error'

export interface PluginRegistration {
  manifest: PluginManifest
  status: PluginStatus
  loadedAt: string
  error?: string
}

export class PluginConflictError extends McpGraphError {
  constructor(pluginA: string, pluginB: string) {
    super(`Plugin conflict: "${pluginA}" conflicts with "${pluginB}"`)
    this.name = 'PluginConflictError'
  }
}

export class PluginDependencyError extends McpGraphError {
  constructor(plugin: string, missing: string[]) {
    super(`Plugin dependency error: "${plugin}" requires missing plugin(s): ${missing.join(', ')}`)
    this.name = 'PluginDependencyError'
  }
}

export class PluginDependentError extends McpGraphError {
  constructor(plugin: string, dependents: string[]) {
    super(`Cannot remove "${plugin}": dependent plugin(s) still installed: ${dependents.join(', ')}`)
    this.name = 'PluginDependentError'
  }
}

export class PluginNotFoundError extends McpGraphError {
  constructor(name: string) {
    super(`Plugin not found: "${name}"`)
    this.name = 'PluginNotFoundError'
  }
}

export class PluginRegistry {
  private readonly plugins: Map<string, PluginRegistration> = new Map()

  register(manifest: PluginManifest): void {
    this.validateDependencies(manifest)
    this.validateConflicts(manifest)

    const registration: PluginRegistration = {
      manifest,
      status: 'enabled',
      loadedAt: new Date().toISOString(),
    }

    this.plugins.set(manifest.name, registration)
    log.info(`Plugin registered: ${manifest.name}@${manifest.version}`)
  }

  remove(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new PluginNotFoundError(name)
    }

    const dependents = this.findDependents(name)
    if (dependents.length > 0) {
      throw new PluginDependentError(name, dependents)
    }

    this.plugins.delete(name)
    log.info(`Plugin removed: ${name}`)
  }

  enable(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new PluginNotFoundError(name)
    }
    plugin.status = 'enabled'
    log.info(`Plugin enabled: ${name}`)
  }

  disable(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new PluginNotFoundError(name)
    }
    plugin.status = 'disabled'
    log.info(`Plugin disabled: ${name}`)
  }

  get(name: string): PluginRegistration | undefined {
    return this.plugins.get(name)
  }

  list(): PluginRegistration[] {
    return Array.from(this.plugins.values())
  }

  has(name: string): boolean {
    return this.plugins.has(name)
  }

  private validateDependencies(manifest: PluginManifest): void {
    const requiredPlugins = manifest.requires?.plugins ?? []
    const missing = requiredPlugins.filter((dep) => !this.plugins.has(dep))
    if (missing.length > 0) {
      throw new PluginDependencyError(manifest.name, missing)
    }
  }

  private validateConflicts(manifest: PluginManifest): void {
    // Check if new plugin declares conflicts with existing plugins
    const declaredConflicts = manifest.conflicts ?? []
    for (const conflictName of declaredConflicts) {
      const existingPlugin = this.plugins.get(conflictName)
      if (existingPlugin) {
        if (existingPlugin.status === 'enabled') {
          throw new PluginConflictError(manifest.name, conflictName)
        }
      }
    }

    // Check if any existing plugin declares conflicts with the new one
    for (const [, registration] of this.plugins) {
      if (registration.status !== 'enabled') continue
      const existingConflicts = registration.manifest.conflicts ?? []
      if (existingConflicts.includes(manifest.name)) {
        throw new PluginConflictError(registration.manifest.name, manifest.name)
      }
    }
  }

  private findDependents(pluginName: string): string[] {
    const dependents: string[] = []
    for (const [name, registration] of this.plugins) {
      const deps = registration.manifest.requires?.plugins ?? []
      if (deps.includes(pluginName)) {
        dependents.push(name)
      }
    }
    return dependents
  }
}
