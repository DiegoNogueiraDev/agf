/*!
 * materialize-hook-script — write an embedded hook-script body to disk, fail-open.
 *
 * WHY: agf init wires a `.claude/settings.json` reference to scripts/hooks/*.mjs;
 * this materializes the referenced file so the reference is never dangling. Shared
 * by bash-compress-hook.ts + file-size-guard-hook.ts (DRY). Never throws — a hook
 * that cannot be written must not block init (mirrors the installers' fail-open).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

/** Write `body` to <projectDir>/<relPath>, creating parent dirs. Fail-open. */
export function materializeHookScript(projectDir: string, relPath: string, body: string): void {
  try {
    const target = join(projectDir, relPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body, 'utf-8')
  } catch {
    // Fail-open — never block init if the script cannot be written.
  }
}
