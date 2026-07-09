/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-shell-escalation — Shell command escalation and approval policy.
 * Cascading decision: Engine rules > Learned rules > Approval policy > Safe/Dangerous classification.
 */

import { ExecPolicyEngine } from './exec-policy-engine.js'
import { validateCommand } from './bash-validator.js'
import type { ExecApprovalRequirement } from '../../schemas/exec-policy.schema.js'

export type ApprovalPolicy = 'Never' | 'OnFailure' | 'OnRequest' | 'UnlessTrusted' | 'Granular'

export interface EscalationResult {
  requirement: ExecApprovalRequirement
  reason?: string
  bypassSandbox: boolean
}

const KNOWN_SAFE_PREFIXES = new Set([
  'git status',
  'git log',
  'git diff',
  'git show',
  'git branch',
  'ls',
  'cat',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'echo',
  'pwd',
  'npm test',
  'npm run',
  'cd',
  'mkdir',
  'touch',
])

const DANGEROUS_PATTERNS = [
  { pattern: 'rm -rf', description: 'recursive force removal' },
  { pattern: 'dd ', description: 'low-level disk operations' },
  { pattern: 'chmod -R', description: 'recursive permission changes' },
  { pattern: 'chown -R', description: 'recursive ownership changes' },
  { pattern: 'mkfs', description: 'filesystem creation' },
  { pattern: 'mount', description: 'filesystem mounting' },
]

// Download-and-execute: a fetcher piped into an interpreter/shell.
const DANGEROUS_PIPE_RE = /\b(?:curl|wget|fetch)\b.*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python|perl|node|ruby)\b/i
const DANGEROUS_DEV_WRITE_RE = />\s*\/dev\//i
// Interpreter inline-eval (e.g. `node -e`, `python -c`): arbitrary code, never sandbox-safe.
// AUDIT-056: match single-dash short flags (-e/-p/-c) AND double-dash long flags
// (--eval/--print) via `--?`; the previous `\s-(?:-e|…)` required a literal `--e`
// (two dashes), so real `node -e` slipped through and OnFailure auto-allowed it.
const INTERPRETER_INLINE_EVAL_RE =
  /^(?:node|npx|deno|bun|python\d?|python3|perl|ruby|php)\b[^|;&]*\s--?(?:eval|print|e|p|c)\b/i

function isKnownSafe(command: string): boolean {
  const cmd = command.trim()
  for (const prefix of KNOWN_SAFE_PREFIXES) {
    if (cmd === prefix || cmd.startsWith(prefix + ' ')) return true
  }
  return false
}

function isDangerous(command: string): boolean {
  const cmd = command.trim()
  for (const dp of DANGEROUS_PATTERNS) {
    if (cmd.startsWith(dp.pattern) || cmd.includes(dp.pattern)) return true
  }
  if (DANGEROUS_PIPE_RE.test(cmd)) return true
  if (DANGEROUS_DEV_WRITE_RE.test(cmd)) return true
  if (INTERPRETER_INLINE_EVAL_RE.test(cmd)) return true
  return false
}

export class ShellEscalation {
  private engine: ExecPolicyEngine
  private learnedRules: Array<{ command: string; allowed: boolean }> = []

  constructor(engine: ExecPolicyEngine) {
    this.engine = engine
  }

  check(command: string, approvalPolicy: ApprovalPolicy, cwd?: string): EscalationResult {
    const cmd = command.trim()
    if (!cmd) {
      return { requirement: 'Skip', bypassSandbox: true }
    }

    const engineResult = this.engine.check(cmd, cwd)
    if (engineResult) {
      if (engineResult.decision === 'Forbidden') {
        return {
          requirement: 'Forbidden',
          reason:
            ('justification' in engineResult.rule
              ? (engineResult.rule as { justification?: string }).justification
              : undefined) || 'blocked by policy rule',
          bypassSandbox: false,
        }
      }
      if (engineResult.decision === 'Allow') {
        return { requirement: 'Skip', bypassSandbox: true }
      }
    }

    const normCmd = cmd.replace(/\s+/g, ' ')
    for (const rule of this.learnedRules) {
      if (normCmd === rule.command) {
        if (rule.allowed) {
          return { requirement: 'Skip', reason: 'previously approved', bypassSandbox: true }
        }
        return { requirement: 'Forbidden', reason: 'previously rejected', bypassSandbox: false }
      }
    }

    const dangerous = isDangerous(cmd)
    const safe = isKnownSafe(cmd)

    switch (approvalPolicy) {
      case 'Never':
        if (dangerous)
          return {
            requirement: 'Forbidden',
            reason: 'destructive command forbidden by Never policy',
            bypassSandbox: false,
          }
        if (safe) return { requirement: 'Skip', bypassSandbox: true }
        return { requirement: 'Forbidden', reason: 'forbidden by Never policy', bypassSandbox: false }

      case 'OnFailure':
        if (dangerous)
          return { requirement: 'NeedsApproval', reason: 'destructive command requires approval', bypassSandbox: false }
        if (safe) return { requirement: 'Skip', bypassSandbox: true }
        // node_0be82c17fcad: an UNKNOWN command may run without pre-approval under
        // OnFailure (low friction), but it must stay INSIDE the sandbox. Only the
        // explicit known-safe list above earns bypassSandbox. Bypassing here let
        // arbitrary unrecognized commands escape isolation.
        return { requirement: 'Skip', reason: 'unknown command runs sandboxed under OnFailure', bypassSandbox: false }

      case 'OnRequest':
      case 'Granular':
        if (dangerous)
          return { requirement: 'NeedsApproval', reason: 'destructive command requires approval', bypassSandbox: false }
        if (safe) return { requirement: 'Skip', bypassSandbox: true }
        return { requirement: 'NeedsApproval', reason: 'command requires approval', bypassSandbox: false }

      case 'UnlessTrusted':
        return {
          requirement: 'NeedsApproval',
          reason: 'approval required by UnlessTrusted policy',
          bypassSandbox: false,
        }
    }
  }

  recordApproval(command: string): void {
    const normCmd = command.trim().replace(/\s+/g, ' ')
    this.learnedRules = this.learnedRules.filter((r) => r.command !== normCmd)
    this.learnedRules.push({ command: normCmd, allowed: true })
  }

  recordRejection(command: string): void {
    const normCmd = command.trim().replace(/\s+/g, ' ')
    this.learnedRules = this.learnedRules.filter((r) => r.command !== normCmd)
    this.learnedRules.push({ command: normCmd, allowed: false })
  }
}

/** Validate a shell command against the active escalation policy; returns allow/deny with reason. */
export function validateWithPolicy(
  command: string,
  engine: ExecPolicyEngine,
  cwd?: string,
): { risk: string; policyDecision?: string } {
  const validationResult = validateCommand(command)
  const engineResult = engine.check(command, cwd)
  return {
    risk: validationResult.risk,
    policyDecision: engineResult?.decision,
  }
}
