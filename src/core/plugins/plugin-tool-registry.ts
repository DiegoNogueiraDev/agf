/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Plugin Tool Registry — tracks tools contributed by plugins.
 * Supports incremental gate wrapping and enable/disable per plugin.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'plugin-tool-registry.ts' })

export interface PluginToolRegistration {
  toolName: string
  pluginName: string
  handler: (...args: unknown[]) => Promise<unknown>
}

export class PluginToolRegistry {
  private readonly tools: Map<string, PluginToolRegistration> = new Map()
  private readonly wrappedSet: Set<string> = new Set()
  private readonly disabledPlugins: Set<string> = new Set()

  register(registration: PluginToolRegistration): void {
    this.tools.set(registration.toolName, registration)
    log.debug(`Plugin tool registered: ${registration.toolName} from ${registration.pluginName}`)
  }

  list(): PluginToolRegistration[] {
    return Array.from(this.tools.values())
  }

  isPluginTool(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  getPluginForTool(toolName: string): string | undefined {
    return this.tools.get(toolName)?.pluginName
  }

  isPluginEnabled(pluginName: string): boolean {
    return !this.disabledPlugins.has(pluginName)
  }

  enablePlugin(pluginName: string): void {
    this.disabledPlugins.delete(pluginName)
    log.debug(`Plugin enabled in tool registry: ${pluginName}`)
  }

  disablePlugin(pluginName: string): void {
    this.disabledPlugins.add(pluginName)
    log.debug(`Plugin disabled in tool registry: ${pluginName}`)
  }

  removePlugin(pluginName: string): void {
    const toRemove: string[] = []
    for (const [toolName, reg] of this.tools) {
      if (reg.pluginName === pluginName) {
        toRemove.push(toolName)
      }
    }
    for (const toolName of toRemove) {
      this.tools.delete(toolName)
      this.wrappedSet.delete(toolName)
    }
    this.disabledPlugins.delete(pluginName)
    log.debug(`Plugin removed from tool registry: ${pluginName}, tools removed: ${toRemove.length}`)
  }

  markWrapped(toolName: string): void {
    this.wrappedSet.add(toolName)
  }

  isWrapped(toolName: string): boolean {
    return this.wrappedSet.has(toolName)
  }

  getUnwrappedTools(): PluginToolRegistration[] {
    return Array.from(this.tools.values()).filter((reg) => !this.wrappedSet.has(reg.toolName))
  }
}
