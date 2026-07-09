/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Preset Gate Adapter — bridges preset resolver with lifecycle/gate system.
 * Provides thin functions that the unified-gate can call to get effective
 * settings, with backward compatibility when no preset is active.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { resolvePresets } from './preset-resolver.js'

const ACTIVE_PRESET_KEY = 'active_preset'
const ALL_PHASES = ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING']

function getActivePresetName(store: SqliteStore): string | undefined {
  return store.getProjectSetting(ACTIVE_PRESET_KEY) ?? undefined
}

/**
 * Get effective strictness mode, considering preset + project override.
 * Project setting always wins over preset (highest priority layer).
 * When no preset is active, falls back to direct project setting (backward compatible).
 */
export function getEffectiveStrictness(store: SqliteStore): string {
  const presetName = getActivePresetName(store)
  const projectOverride = store.getProjectSetting('lifecycle_strictness_mode')

  // If project explicitly sets strictness, it always wins
  if (projectOverride) {
    return projectOverride
  }

  // If preset is active, use its strictness
  if (presetName) {
    const resolved = resolvePresets({
      activePreset: presetName,
      pluginPresets: [],
      projectOverrides: {},
    })
    return resolved.strictness.value
  }

  // Default fallback
  return 'strict'
}

/**
 * Get effective lifecycle phases from the active preset.
 * When no preset is active, returns all 9 phases (backward compatible).
 */
export function getEffectivePhases(store: SqliteStore): string[] {
  const presetName = getActivePresetName(store)

  if (presetName) {
    const resolved = resolvePresets({
      activePreset: presetName,
      pluginPresets: [],
      projectOverrides: {},
    })
    return resolved.phases.value
  }

  return [...ALL_PHASES]
}

/**
 * Get effective DoD checks from the active preset.
 * When no preset is active, returns empty (backward compatible — uses hardcoded defaults).
 */
export function getEffectiveDodChecks(store: SqliteStore): Record<string, boolean> {
  const presetName = getActivePresetName(store)

  if (presetName) {
    const resolved = resolvePresets({
      activePreset: presetName,
      pluginPresets: [],
      projectOverrides: {},
    })
    return resolved.dodChecks.value
  }

  return {}
}
