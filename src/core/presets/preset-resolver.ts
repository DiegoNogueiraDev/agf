/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'
import { getPreset } from './built-in-presets.js'
import type { PresetDefinition } from '../../schemas/preset.schema.js'

const log = createLogger({ layer: 'core', source: 'preset-resolver.ts' })

export interface ResolvedField<T> {
  value: T
  source: string
}

export interface ResolvedConfig {
  port: ResolvedField<number>
  strictness: ResolvedField<string>
  codeIntelligence: ResolvedField<string>
  prerequisites: ResolvedField<string>
  phases: ResolvedField<string[]>
  dodChecks: ResolvedField<Record<string, boolean>>
  classifierPatterns: ResolvedField<Record<string, string[]>>
  templates: ResolvedField<string[]>
}

const ALL_PHASES = ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING']

function buildDefaults(): ResolvedConfig {
  return {
    port: { value: 3000, source: 'default' },
    strictness: { value: 'advisory', source: 'default' },
    codeIntelligence: { value: 'advisory', source: 'default' },
    prerequisites: { value: 'advisory', source: 'default' },
    phases: { value: [...ALL_PHASES], source: 'default' },
    dodChecks: { value: {}, source: 'default' },
    classifierPatterns: { value: {}, source: 'default' },
    templates: { value: [], source: 'default' },
  }
}

function applyPreset(config: ResolvedConfig, preset: PresetDefinition, sourcePrefix: string): void {
  const source = `${sourcePrefix}:${preset.name}`

  if (preset.lifecycle?.strictness) {
    config.strictness = { value: preset.lifecycle.strictness, source }
  }
  if (preset.lifecycle?.codeIntelligence) {
    config.codeIntelligence = { value: preset.lifecycle.codeIntelligence, source }
  }
  if (preset.lifecycle?.prerequisites) {
    config.prerequisites = { value: preset.lifecycle.prerequisites, source }
  }
  if (preset.lifecycle?.phases) {
    config.phases = { value: [...preset.lifecycle.phases], source }
  }

  // DoD checks: additive merge
  if (preset.dod?.checks) {
    const merged = { ...config.dodChecks.value, ...preset.dod.checks }
    config.dodChecks = { value: merged, source }
  }

  // Classifier patterns: additive merge per nodeType
  if (preset.classifierPatterns) {
    const merged = { ...config.classifierPatterns.value }
    for (const [nodeType, patterns] of Object.entries(preset.classifierPatterns)) {
      const existing = merged[nodeType] ?? []
      const combined = [...existing, ...patterns]
      merged[nodeType] = [...new Set(combined)] // dedup
    }
    config.classifierPatterns = { value: merged, source }
  }

  // Templates: replace
  if (preset.templates) {
    config.templates = { value: [...preset.templates], source }
  }
}

export interface ResolvePresetsOptions {
  activePreset?: string
  pluginPresets: PresetDefinition[]
  projectOverrides: Record<string, unknown>
}

/** resolvePresets —  */
export function resolvePresets(options: ResolvePresetsOptions): ResolvedConfig {
  const { activePreset, pluginPresets, projectOverrides } = options
  const config = buildDefaults()

  // Layer 1: Built-in preset
  if (activePreset) {
    const preset = getPreset(activePreset)
    if (preset) {
      applyPreset(config, preset, 'preset')
      log.debug(`Preset applied: ${activePreset}`)
    }
  }

  // Layer 2: Plugin presets (in order = priority ascending, last wins)
  for (const pluginPreset of pluginPresets) {
    applyPreset(config, pluginPreset, 'plugin')
    log.debug(`Plugin preset applied: ${pluginPreset.name}`)
  }

  // Layer 3: Project overrides (highest priority)
  if (projectOverrides.strictness !== undefined) {
    config.strictness = { value: String(projectOverrides.strictness), source: 'project' }
  }
  if (projectOverrides.codeIntelligence !== undefined) {
    config.codeIntelligence = { value: String(projectOverrides.codeIntelligence), source: 'project' }
  }
  if (projectOverrides.prerequisites !== undefined) {
    config.prerequisites = { value: String(projectOverrides.prerequisites), source: 'project' }
  }
  if (projectOverrides.port !== undefined) {
    config.port = { value: Number(projectOverrides.port), source: 'project' }
  }
  if (projectOverrides.phases !== undefined) {
    config.phases = { value: projectOverrides.phases as string[], source: 'project' }
  }

  return config
}
