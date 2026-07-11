/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'
import type { HookChannel } from './hook-types.js'
import type { HookHandlerConfig, HookHandlerKind } from './config-loader.js'

interface HookHandlerRow {
  id: string
  channel: string
  kind: string
  command: string | null
  command_args: string | null
  env: string | null
  timeout_ms: number
  priority: number
  enabled: number
  description: string | null
  origin: string
  created_at: string
  updated_at: string
}

/**
 * DAO for migration v69's `hook_handlers` table. Persists runtime
 * registrations so they survive restart.
 */
export class HookHandlersStore {
  constructor(private readonly db: Database.Database) {}

  upsert(handler: HookHandlerConfig & { origin?: string }): void {
    const ts = now()
    this.db
      .prepare(
        `INSERT INTO hook_handlers
          (id, channel, kind, command, command_args, env, timeout_ms, priority, enabled, description, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           channel=excluded.channel,
           kind=excluded.kind,
           command=excluded.command,
           command_args=excluded.command_args,
           env=excluded.env,
           timeout_ms=excluded.timeout_ms,
           priority=excluded.priority,
           enabled=excluded.enabled,
           description=excluded.description,
           updated_at=excluded.updated_at`,
      )
      .run(
        handler.id,
        handler.channel,
        handler.kind,
        handler.command ?? null,
        handler.commandArgs ? JSON.stringify(handler.commandArgs) : null,
        handler.env ? JSON.stringify(handler.env) : null,
        handler.timeoutMs ?? 5000,
        handler.priority ?? 0,
        handler.enabled === false ? 0 : 1,
        handler.description ?? null,
        handler.origin ?? 'runtime',
        ts,
        ts,
      )
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM hook_handlers WHERE id = ?').run(id)
  }

  list(): Array<HookHandlerConfig & { origin: string }> {
    const rows = this.db
      .prepare('SELECT * FROM hook_handlers WHERE enabled = 1 ORDER BY priority ASC, created_at ASC')
      .all() as HookHandlerRow[]
    return rows.map(rowToConfig)
  }
}

function rowToConfig(row: HookHandlerRow): HookHandlerConfig & { origin: string } {
  return {
    id: row.id,
    channel: row.channel as HookChannel,
    kind: row.kind as HookHandlerKind,
    command: row.command ?? undefined,
    commandArgs: row.command_args ? (JSON.parse(row.command_args) as string[]) : undefined,
    env: row.env ? (JSON.parse(row.env) as Record<string, string>) : undefined,
    timeoutMs: row.timeout_ms,
    priority: row.priority,
    enabled: row.enabled === 1,
    description: row.description ?? undefined,
    origin: row.origin,
  }
}
