/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Presets — configuracao de workflow que afeta comportamento de todos os slash commands.
 * strict-tdd: WIP=1, harness>=70, gates strict, TDD obrigatorio
 * agile-light: WIP=3, gates off, sem prerequisites
 * enterprise: WIP=1, security_scan obrigatorio, doc_completeness required
 * default: WIP=1, gates advisory
 */
import { createLogger } from '../core/utils/logger.js'

const _log = createLogger({ layer: 'cli', source: 'tui/presets.ts' })

export interface PresetConfig {
  name: string
  wip: number
  gates: 'strict' | 'advisory' | 'off'
  harnessMinimum: number
  requireSecurityScan: boolean
  requireDocCompleteness: boolean
}

const PRESETS: Record<string, PresetConfig> = {
  default: {
    name: 'default',
    wip: 1,
    gates: 'advisory',
    harnessMinimum: 0,
    requireSecurityScan: false,
    requireDocCompleteness: false,
  },
  'strict-tdd': {
    name: 'strict-tdd',
    wip: 1,
    gates: 'strict',
    harnessMinimum: 70,
    requireSecurityScan: false,
    requireDocCompleteness: false,
  },
  'agile-light': {
    name: 'agile-light',
    wip: 3,
    gates: 'off',
    harnessMinimum: 0,
    requireSecurityScan: false,
    requireDocCompleteness: false,
  },
  enterprise: {
    name: 'enterprise',
    wip: 1,
    gates: 'strict',
    harnessMinimum: 55,
    requireSecurityScan: true,
    requireDocCompleteness: true,
  },
}

let active: PresetConfig = PRESETS.default

/** Returns all available workflow preset configurations. */
export function listPresets(): PresetConfig[] {
  return Object.values(PRESETS)
}

/** Activates the named preset; silently ignores unknown names. */
export function applyPreset(name: string): void {
  const preset = PRESETS[name]
  if (preset) {
    active = { ...preset }
  }
}

/** Returns a copy of the currently active workflow preset. */
export function getActivePreset(): PresetConfig {
  return { ...active }
}
