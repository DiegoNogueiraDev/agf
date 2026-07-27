/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * profiles.ts — barrel re-exporting all consumer profiles.
 * Split by consumer: profiles-claude-code.ts / profiles-copilot.ts /
 * profiles-opencode.ts / profiles-minimal.ts.
 * WHY split: original 1075-line file violated the <800-line rule.
 *
 * Each profile maps a command name to the dot-paths that the consuming agent
 * actually needs. The profile is resolved BEFORE `--select` — if both are
 * provided, `--select` wins (explicit override).
 *
 * Profiles cut ~40-75% of tokens per response by returning only the fields
 * the agent will use, without requiring the agent to remember `--select` paths.
 *
 * Coverage: 100% of CLI commands (120+ subcommands).
 */

import type { ProfileName, CommandProfile } from './profiles-types.js'
import { PROFILE_CLAUDE_CODE } from './profiles-claude-code.js'
import { PROFILE_COPILOT } from './profiles-copilot.js'
import { PROFILE_OPENCODE } from './profiles-opencode.js'
import { PROFILE_MINIMAL } from './profiles-minimal.js'

export type { ProfileName }
export type { CommandProfile } from './profiles-types.js'

const PROFILES: Record<ProfileName, Record<string, CommandProfile>> = {
  'claude-code': PROFILE_CLAUDE_CODE,
  copilot: PROFILE_COPILOT,
  opencode: PROFILE_OPENCODE,
  minimal: PROFILE_MINIMAL,
}

// ── Public API ───────────────────────────────────────────

/** All available profile names. */
export const PROFILE_NAMES: ProfileName[] = Object.keys(PROFILES) as ProfileName[]

/**
 * Resolve the effective `--select` paths and `--compressed` flag for a given
 * profile + command combination.
 *
 * Returns `null` if no profile is set or the command has no profile entry
 * (caller falls back to normal `--select` behavior).
 */
export function resolveProfile(
  profileName: ProfileName | undefined,
  command: string,
): { select: string[] | null; compressed: boolean } | null {
  if (!profileName) return null

  const profile = PROFILES[profileName]
  if (!profile) return null

  const cmdProfile = profile[command]
  if (!cmdProfile) return null

  return {
    select: cmdProfile.select && cmdProfile.select.length > 0 ? cmdProfile.select : null,
    compressed: cmdProfile.compressed ?? false,
  }
}
