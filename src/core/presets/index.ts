/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { BUILT_IN_PRESETS, getPreset, resolvePresetInheritance } from './built-in-presets.js'
export { getEffectiveStrictness, getEffectivePhases, getEffectiveDodChecks } from './preset-gate-adapter.js'
export { resolvePresets } from './preset-resolver.js'
export type { ResolvedField, ResolvedConfig, ResolvePresetsOptions } from './preset-resolver.js'
