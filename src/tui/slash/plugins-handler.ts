/*!
 * plugins-handler — pure handler for /plugins list|enable|disable|info.
 *
 * WHY: plugin-registry.ts exists in CLI only; this surfaces it via the TUI
 * slash dispatch without importing Ink or process I/O.
 *
 * Composes with: dispatch-ports.ts (consumer), core/plugins/plugin-registry.ts.
 */

import { PluginRegistry, PluginNotFoundError } from '../../core/plugins/plugin-registry.js'

export interface PluginsCommandResult {
  ok: boolean
  message: string
  code?: string
}

/**
 * Handles /plugins <sub> [name] and returns a structured result.
 * Subcommands: list, enable, disable, info.
 */
export function handlePluginsCommand(args: string[], registry: PluginRegistry): PluginsCommandResult {
  const [sub, name] = args

  if (!sub || sub === 'list') {
    const plugins = registry.list()
    if (plugins.length === 0) return { ok: true, message: 'Nenhum plugin registrado.' }
    const lines = plugins.map((p) => `  ${p.manifest.name}@${p.manifest.version} [${p.status}]`)
    return { ok: true, message: lines.join('\n') }
  }

  if (sub === 'enable' || sub === 'disable') {
    if (!name) return { ok: false, code: 'USAGE', message: `Uso: /plugins ${sub} <name>` }
    try {
      if (sub === 'enable') registry.enable(name)
      else registry.disable(name)
      return { ok: true, message: `Plugin "${name}" ${sub === 'enable' ? 'habilitado' : 'desabilitado'}.` }
    } catch (e) {
      if (e instanceof PluginNotFoundError) {
        return { ok: false, code: 'NOT_FOUND', message: `Plugin não encontrado: "${name}".` }
      }
      throw e
    }
  }

  if (sub === 'info') {
    if (!name) return { ok: false, code: 'USAGE', message: 'Uso: /plugins info <name>' }
    const plugin = registry.get(name)
    if (!plugin) return { ok: false, code: 'NOT_FOUND', message: `Plugin não encontrado: "${name}".` }
    return {
      ok: true,
      message: `${plugin.manifest.name}@${plugin.manifest.version}\nStatus: ${plugin.status}\nHooks: ${(plugin.manifest.lifecycleHooks ?? []).length}`,
    }
  }

  return { ok: false, code: 'USAGE', message: `Subcomando desconhecido: "${sub}". Use list|enable|disable|info.` }
}
