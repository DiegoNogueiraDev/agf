/*!
 * Git pre-commit hook installer for agf.
 *
 * WHY: Enforces the 800-line file-size gate cross-agent and cross-platform
 * at commit time (fail-open when agf is not in PATH).
 *
 * Composes with: agf init (init-cmd.ts), agf lint-files --staged.
 * Contract: idempotent — repeated calls never duplicate the hook block.
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const MARKER_BEGIN = '# AGF:BEGIN pre-commit'
const MARKER_END = '# AGF:END pre-commit'

const HOOK_BLOCK = `${MARKER_BEGIN}
if command -v agf > /dev/null 2>&1; then
  agf lint-files --staged
  if [ $? -ne 0 ]; then
    echo "[agf] Commit blocked: staged source files exceed the 800-line limit. Modularize before committing." >&2
    exit 1
  fi
else
  echo "[agf] Warning: agf not found in PATH — file-size gate skipped." >&2
  exit 0
fi
${MARKER_END}`

/**
 * Install (or append) the agf pre-commit hook into the given git repo root.
 * Idempotent: does nothing if the marker block already exists.
 */
export function installPreCommitHook(repoRoot: string): void {
  const hookPath = join(repoRoot, '.git', 'hooks', 'pre-commit')

  let existing = ''
  if (existsSync(hookPath)) {
    existing = readFileSync(hookPath, 'utf-8')
    if (existing.includes(MARKER_BEGIN)) return // already installed
  }

  const shebang = existing.startsWith('#!') ? '' : '#!/bin/sh\n'
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
  const content = `${shebang}${existing}${separator}${HOOK_BLOCK}\n`

  writeFileSync(hookPath, content, 'utf-8')
  chmodSync(hookPath, 0o755)
}
