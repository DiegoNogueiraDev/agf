/*!
 * file-size-guard-hook — install the PreToolUse file-size guard idempotently.
 *
 * WHY: agf init must wire the 800-line guard into Claude Code's .claude/settings.json
 * so every Write|Edit|MultiEdit is checked before writing oversized source files.
 * Mirrors bash-compress-hook.ts (same idempotency + settings-mutation pattern).
 *
 * For hookless CLIs (Copilot/Codex/etc.) this function is a no-op — the git
 * pre-commit hook (install.ts) and advisory messages (D4) remain the enforcement.
 *
 * Composes with: bash-compress-hook.ts (pattern mirror), init-cmd.ts (caller).
 * Contract: never throws; fail-open on any I/O error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { materializeHookScript } from './materialize-hook-script.js'
import { GUARD_FILE_SIZE_MJS } from './hook-script-bodies.js'

const HOOK_COMMAND = 'node scripts/hooks/guard-file-size.mjs'
const HOOK_SCRIPT_REL = 'scripts/hooks/guard-file-size.mjs'
const MATCHER = 'Write|Edit|MultiEdit'

interface HookEntry {
  matcher: string
  hooks: Array<{ type: 'command'; command: string }>
}

interface SettingsShape {
  hooks?: {
    PreToolUse?: HookEntry[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

function readSettings(settingsPath: string): SettingsShape {
  if (!existsSync(settingsPath)) return {}
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as SettingsShape
  } catch {
    return {}
  }
}

function isAlreadyInstalled(preToolUse: HookEntry[]): boolean {
  return preToolUse.some((entry) => entry.matcher === MATCHER && entry.hooks?.some((h) => h.command === HOOK_COMMAND))
}

/**
 * Install the file-size guard PreToolUse hook into `.claude/settings.json`.
 * Idempotent — re-running never duplicates the entry and preserves existing hooks.
 * Scoped to Claude Code only (writes .claude/settings.json).
 */
export function installFileSizeGuardHook(projectDir: string): void {
  // Materialize the referenced script so settings.json never dangles (fail-open,
  // runs on every call so re-inits self-heal a missing file).
  materializeHookScript(projectDir, HOOK_SCRIPT_REL, GUARD_FILE_SIZE_MJS)

  const claudeDir = join(projectDir, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  try {
    mkdirSync(claudeDir, { recursive: true })

    const settings = readSettings(settingsPath)
    const hooks = settings.hooks ?? {}
    const preToolUse: HookEntry[] = (hooks.PreToolUse as HookEntry[]) ?? []

    if (isAlreadyInstalled(preToolUse)) return

    const guardEntry: HookEntry = {
      matcher: MATCHER,
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    }

    const updated: SettingsShape = {
      ...settings,
      hooks: {
        ...hooks,
        PreToolUse: [...preToolUse, guardEntry],
      },
    }

    writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
  } catch {
    // Fail-open — never block init due to a hook installation error
  }
}
