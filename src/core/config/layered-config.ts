/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * 4-Layer Configuration System
 * Priority: defaults → project config → local overrides → environment variables.
 * Each field tracks which layer provided its value.
 */

export interface ConfigField<T> {
  value: T
  source: 'default' | 'project' | 'local' | 'env'
}

export interface LayeredConfigResult {
  port: ConfigField<number>
  dbPath: ConfigField<string>
  contextMode: ConfigField<string>
}

interface ConfigLayer {
  port?: number
  dbPath?: string
  contextMode?: string
}

const DEFAULTS: ConfigLayer = {
  port: 3000,
  dbPath: 'workflow-graph',
  contextMode: 'lean',
}

export interface ResolveOptions {
  projectConfig?: ConfigLayer
  localConfig?: ConfigLayer
  envOverrides?: ConfigLayer
}

function applyLayer<K extends keyof ConfigLayer>(
  result: Record<K, ConfigField<unknown>>,
  key: K,
  layer: ConfigLayer | undefined,
  source: ConfigField<unknown>['source'],
): void {
  if (layer && layer[key] !== undefined) {
    result[key] = { value: layer[key], source }
  }
}

/** Resolve config by merging defaults, project, local, and env layers. */
export function resolveLayeredConfig(options: ResolveOptions): LayeredConfigResult {
  // Start with defaults
  const resultValue: Record<string, ConfigField<unknown>> = {
    port: { value: DEFAULTS.port ?? 3000, source: 'default' },
    dbPath: { value: DEFAULTS.dbPath ?? 'workflow-graph', source: 'default' },
    contextMode: { value: DEFAULTS.contextMode ?? 'lean', source: 'default' },
  }

  const fields: Array<keyof ConfigLayer> = ['port', 'dbPath', 'contextMode']

  // Layer 2: Project config
  for (const key of fields) {
    applyLayer(resultValue, key, options.projectConfig, 'project')
  }

  // Layer 3: Local overrides
  for (const key of fields) {
    applyLayer(resultValue, key, options.localConfig, 'local')
  }

  // Layer 4: Environment variables
  for (const key of fields) {
    applyLayer(resultValue, key, options.envOverrides, 'env')
  }

  return resultValue as unknown as LayeredConfigResult
}
