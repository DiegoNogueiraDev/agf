/*!
 * bash-compress-hook — install the Bash compression PostToolUse hook idempotently.
 *
 * WHY: agf init/update should wire the compress-bash-output.mjs hook into the
 * project's .claude/settings.json so Bash output is automatically compressed
 * on every PostToolUse event, reducing token consumption.
 *
 * Composes with: install.ts (mcp-graph hook installer), init-cmd.ts (caller).
 * Idempotency: the hook entry is identified by its `command` string; if it is
 * already present in PostToolUse entries the function exits without mutating the file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { materializeHookScript } from './materialize-hook-script.js'
import { COMPRESS_BASH_OUTPUT_MJS } from './hook-script-bodies.js'

const HOOK_COMMAND = 'node scripts/hooks/compress-bash-output.mjs'
const HOOK_SCRIPT_REL = 'scripts/hooks/compress-bash-output.mjs'

interface HookEntry {
  matcher: string
  hooks: Array<{ type: 'command'; command: string }>
}

interface SettingsShape {
  hooks?: {
    PostToolUse?: HookEntry[]
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

function isAlreadyInstalled(postToolUse: HookEntry[]): boolean {
  return postToolUse.some((entry) => entry.hooks?.some((h) => h.command === HOOK_COMMAND))
}

/**
 * Install the compress-bash-output.mjs PostToolUse hook into `.claude/settings.json`.
 * Idempotent — re-running never duplicates the entry and preserves existing hooks.
 */
export function installBashCompressHook(projectDir: string): void {
  // Materialize the referenced script so settings.json never dangles (fail-open,
  // runs on every call so re-inits self-heal a missing file).
  materializeHookScript(projectDir, HOOK_SCRIPT_REL, COMPRESS_BASH_OUTPUT_MJS)

  const claudeDir = join(projectDir, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  mkdirSync(claudeDir, { recursive: true })

  const settings = readSettings(settingsPath)
  const hooks = settings.hooks ?? {}
  const postToolUse: HookEntry[] = (hooks.PostToolUse as HookEntry[]) ?? []

  if (isAlreadyInstalled(postToolUse)) return

  const bashEntry: HookEntry = {
    matcher: 'Bash',
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  }

  const updated: SettingsShape = {
    ...settings,
    hooks: {
      ...hooks,
      PostToolUse: [...postToolUse, bashEntry],
    },
  }

  writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
}
