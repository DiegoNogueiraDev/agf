/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * open-browser — zero-dep utility that opens a URL in the default browser.
 *
 * WHY: agf init needs to auto-open the dashboard after startProgressServer
 * resolves with the real URL. Extracted from mcp-client.ts to be reusable and
 * testable via spawner DI (no real process needed in tests).
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { platform as osPlatform } from 'node:os'

export type Spawner = (cmd: string, args: string[]) => void

export interface OpenBrowserOptions {
  /** OS platform override (default: os.platform()). */
  platform?: string
  /** Child-process spawner override for testing. */
  spawn?: Spawner
}

const defaultSpawn: Spawner = (cmd, args) => {
  const child = nodeSpawn(cmd, args, { stdio: 'ignore', detached: true })
  // ENOENT (missing browser command — headless/CI/container) surfaces as an
  // async 'error' event, not a sync throw. Without this listener Node treats
  // it as unhandled and crashes the whole process — the exact failure this
  // fire-and-forget helper exists to avoid.
  child.on('error', () => {
    /* best-effort: the user can open the URL manually */
  })
  child.unref()
}

export interface SkipAutoOpenInput {
  env: Record<string, string | undefined>
  isTty: boolean
}

/**
 * True when auto-opening a browser would be pointless or unsafe: CI, an SSH
 * session (no local display to open), or stdout piped/redirected (not an
 * interactive terminal the user is watching).
 */
export function shouldSkipAutoOpen(input: SkipAutoOpenInput): boolean {
  if (!input.isTty) return true
  if (input.env.CI) return true
  if (Object.keys(input.env).some((key) => key.startsWith('SSH_'))) return true
  return false
}

/** Open `url` in the default browser. Fire-and-forget — never throws. */
export function openBrowser(url: string, opts: OpenBrowserOptions = {}): void {
  const plat = opts.platform ?? osPlatform()
  const spawner = opts.spawn ?? defaultSpawn
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'start' : 'xdg-open'
  try {
    spawner(cmd, [url])
  } catch {
    // Best-effort: if the command fails, the user can open the URL manually.
  }
}
