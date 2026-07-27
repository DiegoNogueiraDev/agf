/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { HookSystem } from './hook-system.js'
export type { HookPoint, HookContext, HookRegistration, HookExecutionResult } from './hook-system.js'
export { PluginCircularDependencyError, resolveLoadOrder, PluginLoader } from './plugin-loader.js'
export type { PluginContext, PluginInstance } from './plugin-loader.js'
export {
  PluginConflictError,
  PluginDependencyError,
  PluginDependentError,
  PluginNotFoundError,
  PluginRegistry,
} from './plugin-registry.js'
export type { PluginManifest, PluginStatus, PluginRegistration } from './plugin-registry.js'
export { PluginStore } from './plugin-store.js'
export type { PluginRow, InstallPluginParams } from './plugin-store.js'
export { PluginToolRegistry } from './plugin-tool-registry.js'
export type { PluginToolRegistration } from './plugin-tool-registry.js'
export { ExtensionRegistryBuilder } from './extension-registry.js'
export type { ExtensionRegistry } from './extension-registry.js'
export { ExtensionData, createSessionStore, createThreadStore, createTurnStore } from './extension-data.js'
export type { TypeKey } from './extension-data.js'
