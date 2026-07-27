import { writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'plugins/config-injector.ts' })

export interface HostValues {
  api_key?: string
  base_url?: string
  [key: string]: unknown
}

export interface PluginInjectSpec {
  name: string
  config_file?: string
  inject?: Record<string, string>
}

export function collectHostValues(config: Record<string, unknown>): HostValues {
  const values: HostValues = {}
  if (config.api_key) values.api_key = String(config.api_key)
  if (config.base_url) values.base_url = String(config.base_url)
  return values
}

function resolveTemplate(template: string, hostValues: HostValues): string {
  return template.replace(/\{\{host\.([^}]+)\}\}/g, (_, key: string) => {
    if (hostValues[key] === undefined) {
      // Surface the gap instead of silently writing an empty (e.g. blank api_key)
      // value that produces a broken-but-valid-looking plugin config.
      log.warn('config-injector: missing host value for template placeholder; substituting empty string', { key })
      return ''
    }
    return String(hostValues[key])
  })
}

export async function injectConfig(
  pluginDir: string,
  pluginSpec: PluginInjectSpec,
  hostValues: HostValues,
): Promise<void> {
  const injectFields = pluginSpec.inject ?? {}
  const config: Record<string, string> = {}

  for (const [key, template] of Object.entries(injectFields)) {
    config[key] = resolveTemplate(template, hostValues)
  }

  const fileName = pluginSpec.config_file ?? 'config.json'
  const configPath = join(pluginDir, fileName)

  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  // The config can embed a resolved api_key — restrict to owner read/write so it
  // is not left world-readable. Best-effort: skip silently where chmod is a no-op
  // (e.g. non-POSIX FS) rather than failing the injection.
  try {
    if (typeof chmodSync === 'function') chmodSync(configPath, 0o600)
  } catch {
    /* best-effort hardening — non-fatal */
  }
}
