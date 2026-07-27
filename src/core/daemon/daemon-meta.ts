/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Sidecar metadata for a running daemon, written next to `daemon.pid`.
 *
 * The state directory is keyed by a SHA1 hash of the workspace path, which the
 * reaper cannot invert. Persisting the original `workspacePath` here lets the
 * reaper decide whether a daemon's workspace still exists on disk — and reap it
 * when the workspace (e.g. a deleted test temp dir) is gone.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod/v4'

/** File name of the metadata sidecar inside a daemon state dir. */
export const DAEMON_META_FILE = 'daemon.meta.json'

export const DaemonMetaSchema = z.object({
  /** Absolute, realpath-resolved workspace the daemon was started for. */
  workspacePath: z.string().min(1),
  /** PID of the daemon process. */
  pid: z.number().int().positive(),
  /** ISO timestamp of daemon startup. */
  startedAt: z.string().min(1),
})

export type DaemonMeta = z.infer<typeof DaemonMetaSchema>

/** Write the metadata sidecar into `stateDir`. Best-effort; never throws. */
export function writeDaemonMeta(stateDir: string, meta: DaemonMeta): void {
  try {
    fs.writeFileSync(path.join(stateDir, DAEMON_META_FILE), JSON.stringify(meta, null, 2))
  } catch {
    // Metadata is an optimization for the reaper — losing it only means a
    // daemon stays unidentified, which the reaper handles conservatively.
  }
}

/**
 * Read and validate the metadata sidecar from `stateDir`.
 * Returns `undefined` when the file is missing, unreadable, or malformed.
 */
export function readDaemonMeta(stateDir: string): DaemonMeta | undefined {
  let raw: string
  try {
    raw = fs.readFileSync(path.join(stateDir, DAEMON_META_FILE), 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  const result = DaemonMetaSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}
