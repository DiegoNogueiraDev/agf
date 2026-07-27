/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Config loader — supports JSON + TOML, env var overrides, source tracking,
 * and cross-field validation. Backward-compatible with existing JSON configs.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { ConfigSchema, type McpGraphConfig } from './config-schema.js'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'config-loader.ts' })

const JSON_FILENAME = 'mcp-graph.config.json'
const TOML_FILENAME = 'mcp-graph.config.toml'

const ENV_OVERRIDE_MAP: Record<string, string> = {
  MCP_PORT: 'port',
  MCP_GRAPH_DB_PATH: 'dbPath',
  MCP_GRAPH_BASE_PATH: 'basePath',
  MCP_GRAPH_CONTEXT_MODE: 'contextMode',
  MCP_GRAPH_PROFILE: 'profile',
}

const ENV_BOOL_MAP: Record<string, string> = {
  CODE_GRAPH_AUTO_INDEX: 'integrations.codeGraphAutoIndex',
}

export interface ParsedConfig {
  config: McpGraphConfig
  /** true if the file was found at the default project location */
  isFromDefaultLocation: boolean
}

export interface ConfigSource {
  isDefault: boolean
  hasFile: boolean
}

/** Check whether a loaded config comes from a project-level file (vs pure defaults). */
export function isBuiltinConfig(config: McpGraphConfig): ConfigSource {
  // When port and dbPath are defaults and non-standard fields are absent,
  // we assume it's a clean default load.
  const hasNonDefaults = config.port !== 3000 || config.dbPath !== 'workflow-graph' || config.basePath !== undefined
  return {
    isDefault: !hasNonDefaults,
    hasFile: hasNonDefaults,
  }
}

/**
 * Parse the config file(s) at the given directory. Returns the parsed result
 * with source location metadata. Prefers JSON over TOML when both exist.
 */
export function parseConfigFile(basePath?: string): ParsedConfig {
  const resolvedBase = basePath ?? process.cwd()
  const jsonPath = path.join(resolvedBase, JSON_FILENAME)
  const tomlPath = path.join(resolvedBase, TOML_FILENAME)

  let fileConfig: Record<string, unknown> = {}
  let isFromDefaultLocation = false

  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, '')
      fileConfig = JSON.parse(raw) as Record<string, unknown>
      isFromDefaultLocation = true
      log.info(`Config loaded from ${jsonPath}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new McpGraphError(`Invalid config at ${jsonPath}: ${msg}`)
    }
  } else if (existsSync(tomlPath)) {
    try {
      const raw = readFileSync(tomlPath, 'utf-8').replace(/^\uFEFF/, '')
      fileConfig = parseToml(raw) as Record<string, unknown>
      isFromDefaultLocation = true
      log.info(`Config loaded from ${tomlPath}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new McpGraphError(`Invalid TOML config at ${tomlPath}: ${msg}`)
    }
  } else {
    log.info('No config file found, using defaults')
  }

  // Apply env var overrides (string fields)
  for (const [envKey, configPath] of Object.entries(ENV_OVERRIDE_MAP)) {
    const val = process.env[envKey]
    if (val !== undefined && val !== '') {
      if (configPath === 'port') {
        const num = parseInt(val, 10)
        if (!isNaN(num)) fileConfig[configPath] = num
      } else {
        fileConfig[configPath] = val
      }
      isFromDefaultLocation = true
    }
  }

  // Apply boolean env overrides (nested fields)
  for (const [envKey, dottedPath] of Object.entries(ENV_BOOL_MAP)) {
    const val = process.env[envKey]
    if (val !== undefined) {
      const parts = dottedPath.split('.')
      let target: Record<string, unknown> = fileConfig
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!
        if (!target[part]) target[part] = {}
        target = target[part] as Record<string, unknown>
      }
      const last = parts[parts.length - 1]!
      target[last] = val !== 'false'
      isFromDefaultLocation = true
    }
  }

  const config = ConfigSchema.parse(fileConfig)
  return { config, isFromDefaultLocation }
}

/** Load project config from file with env var overrides. */
export function loadConfig(basePath?: string): McpGraphConfig {
  return parseConfigFile(basePath).config
}
