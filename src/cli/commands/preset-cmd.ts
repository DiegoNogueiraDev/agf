/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { BUILT_IN_PRESETS, getPreset, resolvePresetInheritance } from '../../core/presets/built-in-presets.js'
import { getEffectiveStrictness, getEffectivePhases } from '../../core/presets/preset-gate-adapter.js'
import type { PresetDefinition } from '../../schemas/preset.schema.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'preset-cmd.ts' })

const ACTIVE_PRESET_KEY = 'active_preset'

interface PresetSettingStore {
  getProjectSetting(key: string): string | null
  setProjectSetting(key: string, value: string): void
}

function effectiveFields(preset: PresetDefinition): { strictness: string; phaseCount: number } {
  const resolved = resolvePresetInheritance(preset, BUILT_IN_PRESETS)
  return {
    strictness: resolved.lifecycle?.strictness ?? 'strict',
    phaseCount: resolved.lifecycle?.phases?.length ?? 9,
  }
}

export function listPresetLines(): string[] {
  return BUILT_IN_PRESETS.map((p) => {
    const { strictness, phaseCount } = effectiveFields(p)
    return `${p.name.padEnd(13)} strictness=${strictness.padEnd(8)} fases=${phaseCount}  ${p.description}`
  })
}

export function showPresetLines(name: string): string[] | null {
  const preset = getPreset(name)
  if (!preset) return null
  const resolved = resolvePresetInheritance(preset, BUILT_IN_PRESETS)
  const checks = resolved.dod?.checks ?? {}
  const enabledChecks = Object.entries(checks)
    .filter(([, on]) => on)
    .map(([k]) => k)
  return [
    `${resolved.name}`,
    `  ${resolved.description}`,
    `  strictness:   ${resolved.lifecycle?.strictness ?? 'strict'}`,
    `  prerequisites: ${resolved.lifecycle?.prerequisites ?? 'strict'}`,
    `  fases:        ${resolved.lifecycle?.phases?.join(', ') ?? '(todas as 9)'}`,
    `  DoD checks:   ${enabledChecks.length > 0 ? enabledChecks.join(', ') : '(padrão)'}`,
  ]
}

export function applyPreset(
  store: PresetSettingStore & Parameters<typeof getEffectiveStrictness>[0],
  name: string,
): { name: string; strictness: string; phases: string[] } | undefined {
  const preset = getPreset(name)
  if (!preset) return undefined
  store.setProjectSetting(ACTIVE_PRESET_KEY, name)
  return {
    name,
    strictness: getEffectiveStrictness(store),
    phases: getEffectivePhases(store),
  }
}

/** Builds the `agf preset` CLI command (Commander definition). */
export function presetCommand(): Command {
  log.info('preset command registered')
  return new Command('preset')
    .description('Manage workflow presets (list, apply, show)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--list', 'List available presets')
    .option('--apply <name>', 'Apply a preset (persiste como active_preset)')
    .option('--show <name>', 'Show preset details')
    .option('--create <name>', 'Create a custom preset')
    .action((opts: { dir: string; list?: boolean; apply?: string; show?: string; create?: string }) => {
      const out = createCliOutput('preset')

      if (opts.list) {
        out.ok({
          presets: BUILT_IN_PRESETS.map((p) => {
            const { strictness, phaseCount } = effectiveFields(p)
            return { name: p.name, strictness, phases: phaseCount, description: p.description }
          }),
        })
        return
      }
      if (typeof opts.show === 'string') {
        const preset = getPreset(opts.show)
        if (!preset) {
          out.err('NOT_FOUND', `Preset desconhecido: ${opts.show}. Use --list.`)
          return
        }
        const resolved = resolvePresetInheritance(preset, BUILT_IN_PRESETS)
        const checks = resolved.dod?.checks ?? {}
        const enabledChecks = Object.entries(checks)
          .filter(([, on]) => on)
          .map(([k]) => k)
        out.ok({
          name: resolved.name,
          description: resolved.description,
          strictness: resolved.lifecycle?.strictness ?? 'strict',
          prerequisites: resolved.lifecycle?.prerequisites ?? 'strict',
          phases: resolved.lifecycle?.phases ?? [],
          dodChecks: enabledChecks,
        })
        return
      }
      if (typeof opts.create === 'string') {
        out.err('UNSUPPORTED', 'Custom presets não são suportados pelo CLI — use plugin presets (`agf plugin`).')
        return
      }
      if (typeof opts.apply === 'string') {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const result = applyPreset(store, opts.apply)
          if (!result) {
            out.err('NOT_FOUND', `Preset desconhecido: ${opts.apply}. Use --list.`)
            return
          }
          out.ok(result)
        } finally {
          store.close()
        }
        return
      }
      out.err('INVALID_INPUT', 'Preset toolkit. Use --list, --show <name>, ou --apply <name>.')
    })
}
