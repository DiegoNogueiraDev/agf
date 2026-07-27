/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-shell-safety — Deterministic shell command safety classifier.
 *
 * Zero side effects. Zero LLM. Pure regex/string analysis.
 * Called BEFORE any shell exec to classify safety.
 *
 * Features:
 *   - Wraps and extends bash-validator.ts (inline exec, destructive cmds, warns)
 *   - Fork bomb detection (classic and variants)
 *   - bash -lc / -lic / --login -c script unwrapping (analyzes inner content)
 *   - sudo detection (privilege escalation)
 *   - Simple boolean API: is_dangerous_command / is_safe_command
 *   - Initial mode: detection only (caller decides warn vs block)
 *
 * Sources: codex (shell-command crate), existing bash-validator.ts & exec-policy.ts
 */
import { validateCommand } from './bash-validator.js'

// ---------------------------------------------------------------------------
// Fork bomb patterns
// ---------------------------------------------------------------------------

const FORK_BOMB_RE = /:\(\s*\)\s*{\s*:\|\s*:\s*&\s*}\s*;:/
const FORK_BOMB_VARIANT_RE = /\.\(\s*\)\s*{\s*\.\|\s*\.\s*&\s*}\s*;\./
const FORK_BOMB_NAMED_RE = /\w+\(\s*\)\s*{\s*\w+\|\s*\w+\s*&\s*}\s*;\s*\w+/
const FORK_BOMB_PIPE_RE = /\)\s*{\s*[^}|]+\|\s*[^}&]+\s*&\s*}\s*;/

// ---------------------------------------------------------------------------
// bash -lc / zsh -lic / sh -lc / --login -c unwrapping
// Only unwraps login-shell wrappers, NOT plain sh -c / bash -c
// (plain -c is already caught as forbidden by bash-validator's INLINE_EXEC_RE)
// ---------------------------------------------------------------------------

const WRAPPER_RE = /^(?:bash|zsh|sh)\s+(?:--login\s+-c|-[li]+c)\s+(['"])(.+)\1$/

/** Unwrap a `bash -lc '...'` or `sh -ic '...'` wrapper and return the inner command string. */
export function unwrap_bash_lc(command: string): string {
  const cmd = command.trim()
  const match = cmd.match(WRAPPER_RE)
  if (match?.[2]) {
    return match[2].trim()
  }
  return cmd
}

// ---------------------------------------------------------------------------
// Additional dangerous patterns beyond what bash-validator catches
// ---------------------------------------------------------------------------

function hasForkBomb(cmd: string): boolean {
  return (
    FORK_BOMB_RE.test(cmd) ||
    FORK_BOMB_VARIANT_RE.test(cmd) ||
    FORK_BOMB_NAMED_RE.test(cmd) ||
    FORK_BOMB_PIPE_RE.test(cmd)
  )
}

function hasSudo(cmd: string): boolean {
  return /^sudo\b/.test(cmd) || /\bsudo\b/.test(cmd)
}

function hasDeviceWrite(cmd: string): boolean {
  return />\s*\/dev\/(sd|nvme|hd|mmcblk|xvd)/i.test(cmd)
}

function hasMkfs(cmd: string): boolean {
  return /\bmkfs(?:\.\w+)?\b/i.test(cmd)
}

function hasChmod777(cmd: string): boolean {
  return /\bchmod\s+(?:-R\s+)?777\b/.test(cmd)
}

function hasPipeToSh(cmd: string): boolean {
  return /\|\s*(?:sh|bash|zsh)\b/i.test(cmd)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return true when a shell command is classified as dangerous (fork bombs, sudo, device writes, pipe-to-sh, etc.). */
export function is_dangerous_command(command: string): boolean {
  const cmd = command.trim()
  if (!cmd) return false

  // 1. Unwrap bash -lc / -lic / --login -c wrappers and re-check inner content
  const unwrapped = unwrap_bash_lc(cmd)
  if (unwrapped !== cmd) {
    if (is_dangerous_command(unwrapped)) return true
    // Fall through to also check the raw command (wrapper itself is inline exec)
  }

  // 2. Fork bombs (not covered by bash-validator)
  if (hasForkBomb(cmd)) return true

  // 3. sudo — privilege escalation
  if (hasSudo(cmd)) return true

  // 4. Device writes (not covered by bash-validator)
  if (hasDeviceWrite(cmd)) return true

  // 5. mkfs (not covered by bash-validator)
  if (hasMkfs(cmd)) return true

  // 6. chmod 777 (covered by exec-policy DEFAULT_DENY but not bash-validator)
  if (hasChmod777(cmd)) return true

  // 7. Pipe to sh/bash/zsh
  if (hasPipeToSh(cmd)) return true

  // 8. Delegate to existing bash-validator (catches sh -c, bash -c, eval, $(), backticks, destructive cmds, npm publish, git force push, path escape)
  const result = validateCommand(cmd)
  return result.risk === 'forbidden' || result.risk === 'destructive' || result.risk === 'warn'
}

/** Return true when a shell command is classified as safe to execute. */
export function is_safe_command(command: string): boolean {
  return !is_dangerous_command(command)
}

export { unwrap_bash_lc as unwrapBashLc }
