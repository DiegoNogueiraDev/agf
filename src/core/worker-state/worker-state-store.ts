/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-E2 — claw-clone CLI / Task E2.1
 *
 * Persistent .mcp-graph/worker-state.json store.
 *
 * Write is atomic: writes to `worker-state.json.tmp`, fsyncs, then renames.
 * Read returns null on missing file, malformed JSON, or Zod-invalid payload —
 * never throws. Callers test the return value.
 *
 * The store is filesystem-only; the session reference inside the state record
 * (`session_ref`) is the foreign key into src/core/context/session-store.ts.
 */

import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { WorkerStateSchema, type WorkerState } from './worker-state-schema.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'worker-state/worker-state-store.ts' })

export type { WorkerState } from './worker-state-schema.js'

const STATE_DIR = '.mcp-graph'
const STATE_FILE = 'worker-state.json'

export class WorkerStateStore {
  constructor(
    private readonly cwd: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Absolute path to the worker-state file under the cwd. */
  path(): string {
    return join(this.cwd, STATE_DIR, STATE_FILE)
  }

  /**
   * Read and validate the persisted state.
   * Returns null when:
   *   - the file does not exist,
   *   - JSON.parse fails, or
   *   - the payload fails WorkerStateSchema validation.
   */
  read(): WorkerState | null {
    const filePath = this.path()
    if (!existsSync(filePath)) return null
    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    } catch {
      return null
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const result = WorkerStateSchema.safeParse(parsed)
    return result.success ? result.data : null
  }

  /** Atomic write: tmp + fsync + rename. */
  write(state: WorkerState): void {
    const filePath = this.path()
    const dir = dirname(filePath)
    mkdirSync(dir, { recursive: true })
    const tmpPath = `${filePath}.tmp`
    const payload = JSON.stringify(state)
    writeFileSync(tmpPath, payload, 'utf-8')
    // fsync the file so rename happens against durable bytes.
    const fd = openSync(tmpPath, 'r')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmpPath, filePath)
  }

  /** Remove the state file. No-op when absent. */
  clear(): void {
    const filePath = this.path()
    if (!existsSync(filePath)) return
    try {
      unlinkSync(filePath)
    } catch (err) {
      void err // best-effort
    }
  }

  /**
   * Bump `last_turn_at` to the current clock and persist.
   * Returns the updated state, or null if no state was found to update.
   */
  touchLastTurn(): WorkerState | null {
    const current = this.read()
    if (!current) return null
    const updated: WorkerState = {
      ...current,
      last_turn_at: this.clock().toISOString(),
    }
    this.write(updated)
    return updated
  }
}
