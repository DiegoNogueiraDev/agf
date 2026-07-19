/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * win-icon — embed the ant icon (assets/agf.ico) into the Windows PE. Only the
 * win32 target is touched; every other target is a no-op. Best-effort like the darwin
 * codesign step: if rcedit is unavailable it warns and skips instead of failing the
 * build. The `run` command is injected so the decision + wiring stay unit-testable.
 */

/** Only the Windows target carries a PE icon resource. */
export function shouldEmbedIcon(target) {
  return target?.os === 'win32'
}

/**
 * Embed `iconPath` into the Windows exe at `exePath` via rcedit.
 * @param {(cmd: string, args: string[]) => void} run injected runner (execFileSync in prod)
 * @returns {{ applied: boolean, reason?: string }}
 */
export function embedWindowsIcon(exePath, iconPath, { run }) {
  try {
    run('npx', ['--yes', 'rcedit', exePath, '--set-icon', iconPath])
    return { applied: true }
  } catch (err) {
    return { applied: false, reason: err?.message ?? String(err) }
  }
}
