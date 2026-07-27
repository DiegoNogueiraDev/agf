/*!
 * AuthoringWizardHandler — SkillHandlerPort for the TUI authoring wizard.
 *
 * WHY: The TUI needs a slash-command entry point (/wizard skill new <name> |
 * hook add --channel X --cmd Y | cancel) that delegates to the SAME core
 * scaffolders as the CLI (scaffoldSkill, addHookEntry) — zero logic duplication.
 *
 * Args format (parsed from the slash command arg string):
 *   "skill new <name>"       → scaffoldSkill(name, dir)
 *   "hook add --channel <c> --cmd <cmd>" → addHookEntry(...)
 *   "cancel"                 → no-op
 *
 * Composes with: skill-cmd.ts (scaffoldSkill), hooks-add.ts (addHookEntry),
 *   skill-handler-port.ts (interface), interactive-app.tsx (slash dispatch).
 * Contract: pure delegate — no duplicate scaffolding logic here.
 */

import { join } from 'node:path'
import type { SkillHandlerPort, SkillExecutionContext } from './skill-handler-port.js'
import { scaffoldSkill } from '../cli/commands/skill-cmd.js'
import { addHookEntry } from '../cli/commands/hooks-add.js'

const USAGE = `Usage:
  skill new <name>   — scaffold a new skill
  hook add --channel <channel> --cmd <command>   — add a hook entry
  cancel             — abort without writing`

export class AuthoringWizardHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const parts = tokenise(args)
    const [sub0, sub1, ...rest] = parts

    // cancel
    if (sub0 === 'cancel') {
      return '✗ Cancelled — nothing was written.'
    }

    // skill new <name>
    if (sub0 === 'skill' && sub1 === 'new') {
      const name = rest[0]?.trim()
      if (!name) return `Missing skill name.\n${USAGE}`
      ctx.onProgress({ step: 1, total: 2, label: `Scaffolding skill "${name}"`, elapsedMs: 0, tokensUsed: 0 })
      const skillsDir = join(ctx.dir, '.agents', 'skills')
      const result = scaffoldSkill(name, skillsDir)
      ctx.onProgress({ step: 2, total: 2, label: 'Done', elapsedMs: 0, tokensUsed: 0 })
      if (!result.ok) return `✗ Failed to scaffold skill "${name}": ${result.error}`
      return `✓ Skill "${name}" created at ${result.path}`
    }

    // hook add --channel <c> --cmd <cmd>
    if (sub0 === 'hook' && sub1 === 'add') {
      const flagArgs = rest.join(' ')
      const channel = extractFlag(flagArgs, '--channel')
      const cmd = extractFlag(flagArgs, '--cmd')
      if (!channel) return `Missing --channel.\n${USAGE}`
      if (!cmd) return `Missing --cmd.\n${USAGE}`
      ctx.onProgress({ step: 1, total: 2, label: `Adding hook on channel "${channel}"`, elapsedMs: 0, tokensUsed: 0 })
      try {
        const result = addHookEntry({ channel, command: cmd, dir: ctx.dir })
        ctx.onProgress({ step: 2, total: 2, label: 'Done', elapsedMs: 0, tokensUsed: 0 })
        return `✓ Hook added on channel "${result.channel}" (id: ${result.id})`
      } catch (err) {
        return `✗ ${(err as Error).message}`
      }
    }

    return USAGE
  }
}

function tokenise(s: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuote: '"' | "'" | null = null
  for (const ch of s.trim()) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
    } else if (ch === ' ') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

function extractFlag(s: string, flag: string): string | undefined {
  // Match quoted or unquoted value (up to next -- flag)
  const re = new RegExp(`${flag}\\s+(?:"([^"]+)"|'([^']+)'|([^-][^\\s]*(?:\\s+(?!--)[^-][^\\s]*)*))`)
  const m = re.exec(s)
  return m ? (m[1] ?? m[2] ?? m[3]?.trim()) : undefined
}
