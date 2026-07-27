/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { Command } from 'commander'
import { PluginStore, type PluginRow } from '../../core/plugins/plugin-store.js'
import { validateInstallGate } from '../../core/plugins/install-gate.js'
import { collectHostValues, injectConfig } from '../../core/plugins/config-injector.js'
import { PluginLoader, type PluginInstance } from '../../core/plugins/plugin-loader.js'
import { PluginRegistry, type PluginManifest } from '../../core/plugins/plugin-registry.js'
import { ExtensionRegistryBuilder } from '../../core/plugins/extension-registry.js'
import { PluginToolRegistry } from '../../core/plugins/plugin-tool-registry.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'plugin-cmd.ts' })

interface PluginCapableStore {
  getDb(): Database.Database
  getProject(): { id: string } | null
}

/** Resolve the plugin store and project id from a plugin-capable store, or null if unavailable. */
export function resolvePluginStore(store: PluginCapableStore): { ps: PluginStore; projectId: string } | null {
  const project = store.getProject()
  if (!project) return null
  return { ps: new PluginStore(store.getDb()), projectId: project.id }
}

/** List all installed plugin rows for the active project, or null if no store. */
export function listPlugins(store: PluginCapableStore): PluginRow[] | null {
  const r = resolvePluginStore(store)
  return r ? r.ps.list(r.projectId) : null
}

/** Look up a single plugin row by name. */
export function getPluginInfo(store: PluginCapableStore, name: string): PluginRow | undefined | null {
  const r = resolvePluginStore(store)
  if (!r) return null
  return r.ps.get(r.projectId, name)
}

export interface InstallPluginResult {
  ok: boolean
  reason?: string
}

/**
 * Install a plugin into the project store — gated by validateInstallGate
 * (node_wire_490bf868a5fd): every install is checked for a valid manifest
 * shape and scanned for suspicious entryPoint patterns (RCE/shell-injection)
 * BEFORE it is persisted. `path` doubles as the manifest's `entryPoint`.
 *
 * When `inject` is given, host values (node_wire_b708c867a680: config-injector)
 * are resolved from `config` and written as a plugin-local config file next to
 * the entry point, so the plugin can read its own `{{host.*}}`-templated secrets
 * without the host process exposing them any other way.
 */
export function installPlugin(
  store: PluginCapableStore,
  params: {
    name: string
    path: string
    version?: string
    config?: Record<string, unknown>
    description?: string
    capabilities?: string[]
    inject?: Record<string, string>
    configFile?: string
  },
): InstallPluginResult {
  const r = resolvePluginStore(store)
  if (!r) return { ok: false, reason: 'Nenhum projeto ativo no grafo.' }

  const gate = validateInstallGate({
    name: params.name,
    version: params.version ?? '0.0.0',
    description: params.description ?? 'CLI-installed plugin',
    entryPoint: params.path,
    capabilities: params.capabilities ?? ['tool'],
  })
  if (!gate.ok) return { ok: false, reason: gate.reason }

  r.ps.install({
    projectId: r.projectId,
    name: params.name,
    version: params.version ?? '0.0.0',
    path: params.path,
    config: params.config,
  })

  if (params.inject && Object.keys(params.inject).length > 0) {
    const hostValues = collectHostValues(params.config ?? {})
    void injectConfig(
      dirname(params.path),
      { name: params.name, config_file: params.configFile, inject: params.inject },
      hostValues,
    )
  }

  return { ok: true }
}

export interface ActivatePluginResult {
  ok: boolean
  reason?: string
  hookCounts?: { turnLifecycle: number; toolLifecycle: number }
  toolCount?: number
}

interface PluginModuleShape {
  manifest?: PluginManifest
  activate?: PluginInstance['activate']
  deactivate?: PluginInstance['deactivate']
  default?: PluginModuleShape
}

/**
 * Dynamically import an installed plugin's entryPoint and activate it via
 * PluginLoader, wiring any lifecycle hooks it registers into a fresh
 * ExtensionRegistryBuilder (node_wire_c5586c79915e: previously neither was
 * instantiated by any surface — install only persisted a DB row).
 */
export async function activatePlugin(
  store: PluginCapableStore,
  name: string,
  importModule: (path: string) => Promise<unknown> = (path) => import(path),
): Promise<ActivatePluginResult> {
  const r = resolvePluginStore(store)
  if (!r) return { ok: false, reason: 'Nenhum projeto ativo no grafo.' }

  const row = r.ps.get(r.projectId, name)
  if (!row) return { ok: false, reason: `Plugin não encontrado: ${name}` }

  let mod: PluginModuleShape
  try {
    const imported = (await importModule(row.path)) as PluginModuleShape
    mod = imported.default ?? imported
  } catch (err) {
    return {
      ok: false,
      reason: `Falha ao importar plugin "${name}": ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (typeof mod.activate !== 'function') {
    return { ok: false, reason: `Plugin "${name}" não exporta activate().` }
  }

  const manifest: PluginManifest =
    mod.manifest ??
    ({
      name: row.name,
      version: row.version,
      description: 'CLI-installed plugin',
      entryPoint: row.path,
      capabilities: ['tool'],
    } as PluginManifest)

  const builder = new ExtensionRegistryBuilder()
  const loader = new PluginLoader(new PluginRegistry())
  const toolRegistry = new PluginToolRegistry()
  const instance: PluginInstance = { activate: mod.activate, deactivate: mod.deactivate }

  await loader.loadPlugin(manifest, instance, builder, toolRegistry)

  const registry = builder.build()
  const toolCount = toolRegistry.list().length
  return {
    ok: true,
    hookCounts: {
      turnLifecycle: registry.turnLifecycleContributors().length,
      toolLifecycle: registry.toolLifecycleContributors().length,
    },
    ...(toolCount > 0 ? { toolCount } : {}),
  }
}

/** Enable or disable an installed plugin by name; returns whether the row was updated. */
export function setPluginEnabled(store: PluginCapableStore, name: string, enabled: boolean): boolean {
  const r = resolvePluginStore(store)
  if (!r) return false
  r.ps.setEnabled(r.projectId, name, enabled)
  return true
}

/** Remove an installed plugin by name; returns whether a row was deleted. */
export function removePlugin(store: PluginCapableStore, name: string): boolean {
  const r = resolvePluginStore(store)
  if (!r) return false
  r.ps.remove(r.projectId, name)
  return true
}

/** Build the `agf plugin` CLI command (install/remove/list/enable). */
export function pluginCommand(): Command {
  log.info('plugin command registered')
  return new Command('plugin')
    .description('Manage plugins (install, remove, enable, disable, list, info)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--install <name>', 'Install a plugin (requer --path)')
    .option('--path <path>', 'Plugin path (com --install)')
    .option('--plugin-version <version>', 'Plugin version (com --install)')
    .option('--config <json>', 'Host config JSON — fonte de {{host.*}} para --inject (com --install)')
    .option('--inject <json>', 'JSON de campos a templatizar em um config file do plugin (com --install)')
    .option('--config-file <name>', 'Nome do config file gerado por --inject (default: config.json)')
    .option('--activate <name>', 'Import and activate an installed plugin, wiring its lifecycle hooks')
    .option('--remove <name>', 'Remove a plugin')
    .option('--enable <name>', 'Enable a plugin')
    .option('--disable <name>', 'Disable a plugin')
    .option('--list', 'List all plugins')
    .option('--info <name>', 'Show plugin info')
    .action(async (opts: Record<string, string | boolean>) => {
      const out = createCliOutput('plugin')
      const store = openStoreOrFail(String(opts.dir), { requireExisting: true })
      try {
        if (typeof opts.activate === 'string') {
          const result = await activatePlugin(store, opts.activate)
          if (!result.ok) {
            out.err('ACTIVATION_FAILED', result.reason ?? `Falha ao ativar plugin: ${opts.activate}`)
            return
          }
          out.ok({ name: opts.activate, action: 'activated', hookCounts: result.hookCounts })
          return
        }
        if (typeof opts.install === 'string') {
          if (typeof opts.path !== 'string') {
            out.err('INVALID_INPUT', 'plugin --install requer --path <path>.')
            return
          }
          let config: Record<string, unknown> | undefined
          let inject: Record<string, string> | undefined
          try {
            if (typeof opts.config === 'string') config = JSON.parse(opts.config) as Record<string, unknown>
            if (typeof opts.inject === 'string') inject = JSON.parse(opts.inject) as Record<string, string>
          } catch {
            out.err('INVALID_INPUT', 'plugin --config/--inject requer JSON válido.')
            return
          }
          const result = installPlugin(store, {
            name: opts.install,
            path: opts.path,
            version: typeof opts.pluginVersion === 'string' ? opts.pluginVersion : undefined,
            config,
            inject,
            configFile: typeof opts.configFile === 'string' ? opts.configFile : undefined,
          })
          if (!result.ok) {
            const code = result.reason?.startsWith('Security gate') ? 'INSTALL_GATE_BLOCKED' : 'NO_PROJECT'
            out.err(code, result.reason ?? 'Nenhum projeto ativo no grafo. Rode um import primeiro.')
            return
          }
          out.ok({ name: opts.install, action: 'installed' })
          return
        }
        if (typeof opts.remove === 'string') {
          if (!removePlugin(store, opts.remove)) {
            out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo. Rode um import primeiro.')
            return
          }
          out.ok({ name: opts.remove, action: 'removed' })
          return
        }
        if (typeof opts.enable === 'string') {
          if (!setPluginEnabled(store, opts.enable, true)) {
            out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo. Rode um import primeiro.')
            return
          }
          out.ok({ name: opts.enable, action: 'enabled' })
          return
        }
        if (typeof opts.disable === 'string') {
          if (!setPluginEnabled(store, opts.disable, false)) {
            out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo. Rode um import primeiro.')
            return
          }
          out.ok({ name: opts.disable, action: 'disabled' })
          return
        }
        if (typeof opts.info === 'string') {
          const row = getPluginInfo(store, opts.info)
          if (row === null) {
            out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo. Rode um import primeiro.')
            return
          }
          if (!row) {
            out.err('NOT_FOUND', `Plugin não encontrado: ${opts.info}`)
            return
          }
          out.ok({ name: row.name, version: row.version, path: row.path, enabled: row.enabled })
          return
        }
        const rows = listPlugins(store)
        if (rows === null) {
          out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo. Rode um import primeiro.')
          return
        }
        out.ok({ plugins: rows.map((r) => ({ name: r.name, version: r.version, enabled: r.enabled })) })
      } finally {
        store.close()
      }
    })
}
