/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-bash-validation — E8-T2: Pure deterministic bash command validator.
 *
 * Zero side effects. Zero LLM. Pure regex/string analysis.
 * Called BEFORE any shell exec to classify risk level.
 *
 * Risk taxonomy (§deterministic-first):
 *   forbidden    — path escape, inline execution, dynamic shell invocation
 *   destructive  — rm, dd, truncate, mv-to-null, chmod mass
 *   warn         — npm publish, git push --force, git reset --hard
 *   safe         — read-only operations (ls, cat, grep, git status, etc.)
 */

import type { ValidationResult, CommandRisk } from '../../schemas/bash-validation.schema.js'

// ---------------------------------------------------------------------------
// Rule sets — ordered: forbidden checked first (short-circuit)
// ---------------------------------------------------------------------------

const INLINE_EXEC_RE = /\$\(|`[^`]|^eval\s|;\s*eval\s|\beval\b.*["']|\bsh\s+-c\b|\bbash\s+-c\b|\bzsh\s+-c\b/i
const PATH_ESCAPE_RE = /\.\.[/\\]/
const DESTRUCTIVE_CMDS_RE = /^(rm|dd|truncate|chmod)\b/
const DESTRUCTIVE_MV_RE = /^mv\b.*(\/dev\/null|\brecycle\b)/i
const WARN_CMDS_RE = /\bnpm\s+publish\b|\byarn\s+publish\b|\bpnpm\s+publish\b/i
const WARN_GIT_RE = /\bgit\s+(push\s+.*--force|reset\s+--hard|push\s+.*-f\b)/i

const SAFE_PREFIXES = new Set([
  'git status',
  'git log',
  'git diff',
  'git show',
  'git branch',
  'git tag',
  'git stash list',
  'git remote -v',
  'ls',
  'cat',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'echo',
  'pwd',
  'node',
  'npx',
  'npm test',
  'npm run',
  'npm ci',
  'npm install',
  'vitest',
  'tsc',
  'eslint',
  'curl -s',
  'curl --silent',
  'which',
  'where',
  'type',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startsWithSafePrefix(cmd: string): boolean {
  for (const prefix of SAFE_PREFIXES) {
    if (cmd === prefix || cmd.startsWith(prefix + ' ')) return true
  }
  return false
}

/** Severity order — higher index = more severe. Used to aggregate a command chain. */
const RISK_ORDER: readonly CommandRisk[] = ['safe', 'warn', 'destructive', 'forbidden']

/**
 * Shell separators that start a NEW command: `;` `&&` `||` `|` `&` and newlines. Splitting on
 * these is what makes chaining safe to classify — a destructive segment after a safe one used
 * to slip through because the destructive rules are ^-anchored to a single command's start.
 * Over-splitting (e.g. a `|` inside quotes) is conservative: it only adds checks, never removes
 * them, so a dangerous segment can never be hidden by quoting from the security classifier.
 */
const SEPARATOR_RE = /\s*(?:&&|\|\||;|\||&|\n)\s*/

/** Classify ONE command segment (no separators) against the ordered rule set. */
function classifySegment(cmd: string): ValidationResult {
  if (!cmd) {
    return { risk: 'safe', reasons: [] }
  }

  // 1. Forbidden: inline execution
  if (INLINE_EXEC_RE.test(cmd)) {
    return {
      risk: 'forbidden',
      reasons: ['inline execution or subshell detected ($(…), backticks, eval, or sh -c)'],
    }
  }

  // 2. Forbidden: path traversal
  if (PATH_ESCAPE_RE.test(cmd)) {
    return {
      risk: 'forbidden',
      reasons: ['path escape detected (.. traversal in command arguments)'],
    }
  }

  // 3. Destructive: rm, dd, truncate, chmod, mv→null
  if (DESTRUCTIVE_CMDS_RE.test(cmd) || DESTRUCTIVE_MV_RE.test(cmd)) {
    return {
      risk: 'destructive',
      reasons: [`potentially destructive command: ${cmd.split(' ')[0]}`],
    }
  }

  // 4. Warn: publish, force-push, hard-reset
  if (WARN_CMDS_RE.test(cmd)) {
    return { risk: 'warn', reasons: ['publish command — publishes package to registry'] }
  }
  if (WARN_GIT_RE.test(cmd)) {
    return { risk: 'warn', reasons: ['potentially irreversible git operation'] }
  }

  // 5. Safe: known read-only prefixes
  if (startsWithSafePrefix(cmd)) {
    return { risk: 'safe', reasons: [] }
  }

  // 6. Default: safe for unknown commands (advisory only, not a blocker)
  return { risk: 'safe', reasons: [] }
}

// ---------------------------------------------------------------------------
// validateCommand — main export
// ---------------------------------------------------------------------------

/**
 * Classify a shell command's risk. A chained command (`a; b`, `a && b`, `a | b`, …) is
 * decomposed into segments and classified segment-by-segment; the returned risk is the MOST
 * severe across all segments, with that segment's reasons. This closes the chaining bypass
 * where a destructive command after a safe prefix (`ls; rm -rf /`) was reported `safe`.
 */
export function validateCommand(command: string): ValidationResult {
  const cmd = command.trim()

  if (!cmd) {
    return { risk: 'safe', reasons: [] }
  }

  const segments = cmd
    .split(SEPARATOR_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  let worst: ValidationResult = { risk: 'safe', reasons: [] }
  for (const segment of segments) {
    const result = classifySegment(segment)
    if (RISK_ORDER.indexOf(result.risk) > RISK_ORDER.indexOf(worst.risk)) {
      worst = result
      if (worst.risk === 'forbidden') break // most severe — short-circuit
    }
  }
  return worst
}

export type { ValidationResult, CommandRisk }
