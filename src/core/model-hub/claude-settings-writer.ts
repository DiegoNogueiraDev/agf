/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * claude-settings-writer — writes a gearshift.ts `Gear` (1-4) into
 * `~/.claude/settings.json`'s `model` + `effortLevel` fields, idempotently.
 *
 * Same read→merge→preserve→write pattern as file-size-guard-hook.ts and
 * bash-compress-hook.ts (immutable spread, never drops existing keys), but
 * targets the GLOBAL Claude Code settings file (home dir), not a project's
 * `.claude/settings.json` — gear is a per-session model/effort choice, not a
 * per-project hook wiring.
 *
 * Composes with: gearshift.ts (produces the Gear this module writes).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Gear } from './gearshift.js'

/** `setGear` accepts a Gear (1-4) or 'default' to clear model/effortLevel entirely. */
export type GearSelector = Gear | 'default'

interface GearSetting {
  model: string
  effortLevel: string
}

/** Gear → Claude Code settings.json model alias + effort level. */
export const GEAR_SETTINGS: Record<Gear, GearSetting> = {
  1: { model: 'haiku', effortLevel: 'low' },
  2: { model: 'sonnet', effortLevel: 'low' },
  3: { model: 'sonnet[1m]', effortLevel: 'medium' },
  4: { model: 'opus', effortLevel: 'high' },
}

interface ClaudeSettings {
  model?: string
  effortLevel?: string
  [key: string]: unknown
}

function readSettings(settingsPath: string): ClaudeSettings {
  if (!existsSync(settingsPath)) return {}
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as ClaudeSettings
  } catch {
    return {}
  }
}

/**
 * Write a gear's model+effortLevel into `~/.claude/settings.json` (or
 * `<homeDir>/.claude/settings.json` when `homeDir` is given, e.g. for tests).
 * `'default'` removes both keys instead of setting them. Idempotent: writing
 * the same gear twice produces byte-identical output. Preserves every other
 * key (hooks, etc.) via immutable spread — never mutates the read object.
 */
export function setGear(gear: GearSelector, homeDir: string = homedir()): void {
  const claudeDir = join(homeDir, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')
  mkdirSync(claudeDir, { recursive: true })

  const settings = readSettings(settingsPath)

  let updated: ClaudeSettings
  if (gear === 'default') {
    const { model: _model, effortLevel: _effortLevel, ...rest } = settings
    updated = rest
  } else {
    const { model, effortLevel } = GEAR_SETTINGS[gear]
    updated = { ...settings, model, effortLevel }
  }

  writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
}
