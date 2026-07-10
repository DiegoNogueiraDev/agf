/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { Command } from 'commander'
import { PluginStore, type PluginRow } from '../../core/plugins/plugin-store.js'
import { validateInstallGate } from '../../core/plugins/install-gate.js'
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
  return { ok: true }
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
    .option('--remove <name>', 'Remove a plugin')
    .option('--enable <name>', 'Enable a plugin')
    .option('--disable <name>', 'Disable a plugin')
    .option('--list', 'List all plugins')
    .option('--info <name>', 'Show plugin info')
    .action((opts: Record<string, string | boolean>) => {
      const out = createCliOutput('plugin')
      const store = openStoreOrFail(String(opts.dir), { requireExisting: true })
      try {
        if (typeof opts.install === 'string') {
          if (typeof opts.path !== 'string') {
            out.err('INVALID_INPUT', 'plugin --install requer --path <path>.')
            return
          }
          const result = installPlugin(store, {
            name: opts.install,
            path: opts.path,
            version: typeof opts.pluginVersion === 'string' ? opts.pluginVersion : undefined,
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
