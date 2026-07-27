/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ScaffoldChange } from '../init/scaffold.js'

/**
 * Install / uninstall mcp-graph hooks in `.claude/settings.local.json`.
 *
 * We always scope to the project (`settings.local.json`), never to the user's
 * global Claude Code config. Each hook entry carries our marker tag so we can
 * cleanly remove just our entries on uninstall without disturbing user hooks.
 */

export type HookProfile = 'minimal' | 'balanced' | 'aggressive'

export interface HookInstallOptions {
  readonly profile?: HookProfile
  readonly dryRun?: boolean
}

interface HookEntry {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string }>
  __mg__?: { version: string; profile: HookProfile; tag: string }
}

interface SettingsShape {
  hooks?: Record<string, HookEntry[]>
  [key: string]: unknown
}

const TAG = 'mcp-graph-hook'
const VERSION = 'v1'

/**
 * Hook map: which Claude Code event fires which `mcp-graph hook <name>` invocation.
 * The `mcp-graph hook <name>` dispatcher (Sprint 7.5/7.6) runs the actual handler.
 *
 * Matcher regexes scope when each hook fires.
 */
const PROFILES: Record<
  HookProfile,
  ReadonlyArray<{
    event: string
    matcher?: string
    command: string
  }>
> = {
  minimal: [
    {
      event: 'SessionStart',
      command: 'mcp-graph hook session-start',
    },
  ],
  balanced: [
    {
      event: 'SessionStart',
      command: 'mcp-graph hook session-start',
    },
    {
      event: 'PreToolUse',
      matcher: 'mcp__mcp-graph__.*',
      command: 'mcp-graph hook pre-tool-use',
    },
    {
      event: 'PostToolUse',
      matcher: 'Edit|Write|MultiEdit',
      command: 'mcp-graph hook post-edit',
    },
    {
      event: 'PostToolUse',
      matcher: 'mcp__mcp-graph__finish_task',
      command: 'mcp-graph hook post-finish-task',
    },
    {
      event: 'Stop',
      command: 'mcp-graph hook session-stop',
    },
  ],
  aggressive: [
    {
      event: 'SessionStart',
      command: 'mcp-graph hook session-start',
    },
    {
      event: 'PreToolUse',
      matcher: 'mcp__mcp-graph__.*',
      command: 'mcp-graph hook pre-tool-use',
    },
    {
      event: 'PostToolUse',
      matcher: 'Edit|Write|MultiEdit',
      command: 'mcp-graph hook post-edit',
    },
    {
      event: 'PostToolUse',
      matcher: 'Bash',
      command: 'mcp-graph hook post-bash',
    },
    {
      event: 'PostToolUse',
      matcher: 'mcp__mcp-graph__finish_task',
      command: 'mcp-graph hook post-finish-task',
    },
    {
      event: 'UserPromptSubmit',
      command: 'mcp-graph hook pre-prompt',
    },
    {
      event: 'Stop',
      command: 'mcp-graph hook session-stop',
    },
  ],
}

export function installHooks(cwd: string, opts: HookInstallOptions = {}): ScaffoldChange {
  const profile = opts.profile ?? 'balanced'
  const path = join(cwd, '.claude', 'settings.local.json')
  const existing = readSettings(path)
  const next = applyProfile(existing, profile)
  return write(path, next, opts.dryRun ?? false)
}

export function uninstallHooks(cwd: string, opts: { dryRun?: boolean } = {}): ScaffoldChange {
  const path = join(cwd, '.claude', 'settings.local.json')
  if (!existsSync(path)) {
    return { path, action: 'skipped-noop', bytes: 0 }
  }
  const existing = readSettings(path)
  const next = stripOurHooks(existing)
  return write(path, next, opts.dryRun ?? false)
}

export interface InstalledHookSummary {
  readonly event: string
  readonly matcher?: string
  readonly command: string
  readonly profile?: HookProfile
}

export function listInstalledHooks(cwd: string): InstalledHookSummary[] {
  const path = join(cwd, '.claude', 'settings.local.json')
  if (!existsSync(path)) return []
  const settings = readSettings(path)
  const out: InstalledHookSummary[] = []
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries) {
      if (entry.__mg__?.tag !== TAG) continue
      for (const cmd of entry.hooks) {
        out.push({
          event,
          matcher: entry.matcher,
          command: cmd.command,
          profile: entry.__mg__.profile,
        })
      }
    }
  }
  return out
}

/**
 * Sprint 7.4 #7.4.10 — Config drift detection.
 *
 * Compares the installed hooks' `__mg__.version` stamp against the current
 * installer's VERSION constant. Drift surfaces when:
 *   - the schema bumped (e.g. a profile gained a new hook entry but the
 *     installed config still reflects the old shape)
 *   - the user upgraded the CLI without re-running `mcp-graph hooks install`
 *
 * Returns a structured detail object the SessionStart hook surfaces back
 * to Claude Code so the host can prompt the user to re-sync. Status:
 *   - "ok"           — versions match (or no hooks installed)
 *   - "stale"        — hooks present at older VERSION; suggest re-install
 *   - "uninstalled"  — settings file missing; nothing to drift against
 */
export type ConfigDriftStatus = 'ok' | 'stale' | 'uninstalled'

export interface ConfigDriftReport {
  readonly status: ConfigDriftStatus
  readonly currentVersion: string
  readonly installedVersion?: string
  readonly installedProfile?: HookProfile
  readonly hint?: string
}

export function detectConfigDrift(cwd: string): ConfigDriftReport {
  const path = join(cwd, '.claude', 'settings.local.json')
  if (!existsSync(path)) {
    return { status: 'uninstalled', currentVersion: VERSION }
  }
  const settings = readSettings(path)
  let installedVersion: string | undefined
  let installedProfile: HookProfile | undefined
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const entry of entries) {
      if (entry.__mg__?.tag !== TAG) continue
      installedVersion = entry.__mg__.version
      installedProfile = entry.__mg__.profile
      break
    }
    if (installedVersion) break
  }
  if (!installedVersion) {
    return { status: 'uninstalled', currentVersion: VERSION }
  }
  if (installedVersion === VERSION) {
    return {
      status: 'ok',
      currentVersion: VERSION,
      installedVersion,
      installedProfile,
    }
  }
  return {
    status: 'stale',
    currentVersion: VERSION,
    installedVersion,
    installedProfile,
    hint: `mcp-graph hooks install${installedProfile ? ` --profile ${installedProfile}` : ''}`,
  }
}

function readSettings(path: string): SettingsShape {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SettingsShape
  } catch {
    return {}
  }
}

function applyProfile(settings: SettingsShape, profile: HookProfile): SettingsShape {
  // Drop any pre-existing mcp-graph hooks first (idempotent re-install).
  const cleared = stripOurHooks(settings)
  const hooks = { ...(cleared.hooks ?? {}) }

  for (const spec of PROFILES[profile]) {
    const list = hooks[spec.event] ?? []
    list.push({
      matcher: spec.matcher,
      hooks: [{ type: 'command', command: spec.command }],
      __mg__: { version: VERSION, profile, tag: TAG },
    })
    hooks[spec.event] = list
  }

  return { ...cleared, hooks }
}

function stripOurHooks(settings: SettingsShape): SettingsShape {
  if (!settings.hooks) return settings
  const out: Record<string, HookEntry[]> = {}
  for (const [event, entries] of Object.entries(settings.hooks)) {
    const kept = entries.filter((e) => e.__mg__?.tag !== TAG)
    if (kept.length > 0) out[event] = kept
  }
  return {
    ...settings,
    hooks: Object.keys(out).length > 0 ? out : undefined,
  }
}

function write(path: string, settings: SettingsShape, dryRun: boolean): ScaffoldChange {
  const exists = existsSync(path)
  const desired = `${JSON.stringify(settings, null, 2)}\n`

  if (exists) {
    const current = readFileSync(path, 'utf8')
    if (current === desired) {
      return { path, action: 'skipped-noop', bytes: current.length }
    }
  }

  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, desired, 'utf8')
  }
  return {
    path,
    action: exists ? 'patched' : 'created',
    bytes: desired.length,
  }
}
