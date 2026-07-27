/*!
 * config-view — pure formatter for /config layered settings display.
 *
 * WHY: exposes the 4-layer config system (default→project→local→env) in the
 * TUI so users can see the effective value and which layer set it — read-only
 * for now; project-layer edits hook in via the SlashCommand handler.
 *
 * Composes with: core/config/layered-config.ts (data), dispatch-ports.ts
 * (consumer for 'config' case).
 */

import type { LayeredConfigResult, ConfigField } from '../core/config/layered-config.js'

/** Format a single config field row: "  key = value  [source]" */
function formatField(key: string, field: ConfigField<unknown>): string {
  return `  ${key.padEnd(16)} = ${String(field.value).padEnd(24)} [${field.source}]`
}

/** Render the full layered config as a terminal-readable string. */
export function formatConfigView(cfg: LayeredConfigResult): string {
  const lines: string[] = ['── Config Layers (default → project → local → env) ──']
  lines.push(formatField('port', cfg.port))
  lines.push(formatField('dbPath', cfg.dbPath))
  lines.push(formatField('contextMode', cfg.contextMode))
  return lines.join('\n')
}
