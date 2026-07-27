/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * pack-offline-lock — prevent two concurrent `pack-offline.mjs` runs from
 * corrupting the same node_modules (root cause of the better-sqlite3 offline
 * tarball corruption: two sessions writing/staging package.json + node_modules
 * at once). Same pidfile strategy as core/daemon/daemon-lockfile.ts (`kill(pid,
 * 0)` liveness probe, `wx` exclusive create + race re-check, stale reclaim) —
 * NOT a direct import of that module: pack-offline.mjs runs via plain `node`
 * (no tsx/ts-node loader, `engines.node >=20` has no guaranteed native TS
 * support), so a `.ts` import would break the script at runtime even though it
 * transpiles fine under vitest. This mirrors that exact algorithm in plain JS.
 */
import fs from 'node:fs'

/** Inspect the lock file without mutating anything. */
function checkPackLock(lockPath) {
  let raw
  try {
    raw = fs.readFileSync(lockPath, 'utf8')
  } catch {
    return { alive: false }
  }
  const pid = parseInt(raw.trim(), 10)
  if (!Number.isFinite(pid) || pid <= 0) return { alive: false, stale: true }
  try {
    process.kill(pid, 0)
    return { alive: true, pid }
  } catch {
    return { alive: false, pid, stale: true }
  }
}

/**
 * Acquire the pack-offline lock. Throws an Error whose message contains
 * "LOCK_HELD" and the holder PID when a live process already owns it. Stale
 * lock files (dead PID) are reclaimed automatically.
 */
export function acquirePackLock(lockPath) {
  const state = checkPackLock(lockPath)
  if (state.alive) {
    throw new Error(`LOCK_HELD: pack-offline already running (pid=${state.pid})`)
  }
  if (state.stale) {
    try {
      fs.unlinkSync(lockPath)
    } catch {
      // May have vanished between check and unlink — fine, we're about to overwrite it.
    }
  }

  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
    return
  } catch {
    // Race: another process may have acquired between the check and write.
    const recheck = checkPackLock(lockPath)
    if (recheck.alive) {
      throw new Error(`LOCK_HELD: pack-offline already running (pid=${recheck.pid})`)
    }
    // Leftover from a crash in the same millisecond — force-overwrite.
    fs.writeFileSync(lockPath, String(process.pid))
  }
}

/** Remove the lock file. Tolerates already-missing files. */
export function releasePackLock(lockPath) {
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // No-op — release is idempotent.
  }
}
