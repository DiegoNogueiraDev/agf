/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'plugin-store.ts' })

export interface PluginRow {
  name: string
  project_id: string
  version: string
  path: string
  enabled: number
  config: Record<string, unknown> | null
  installed_at: string
  updated_at: string
}

interface PluginRowRaw {
  name: string
  project_id: string
  version: string
  path: string
  enabled: number
  config: string | null
  installed_at: string
  updated_at: string
}

export interface InstallPluginParams {
  projectId: string
  name: string
  version: string
  path: string
  config?: Record<string, unknown>
}

function parseRow(raw: PluginRowRaw): PluginRow {
  return {
    ...raw,
    config: raw.config
      ? (() => {
          try {
            return JSON.parse(raw.config) as Record<string, unknown>
          } catch {
            return null
          }
        })()
      : null,
  }
}

export class PluginStore {
  constructor(private readonly db: Database.Database) {}

  install(params: InstallPluginParams): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO plugins (name, project_id, version, path, enabled, config, installed_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `,
      )
      .run(
        params.name,
        params.projectId,
        params.version,
        params.path,
        params.config ? JSON.stringify(params.config) : null,
        now,
        now,
      )
    log.info(`Plugin persisted: ${params.name}@${params.version} for project ${params.projectId}`)
  }

  remove(projectId: string, name: string): void {
    this.db.prepare('DELETE FROM plugins WHERE project_id = ? AND name = ?').run(projectId, name)
    log.info(`Plugin removed from DB: ${name} for project ${projectId}`)
  }

  setEnabled(projectId: string, name: string, enabled: boolean): void {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE plugins SET enabled = ?, updated_at = ? WHERE project_id = ? AND name = ?')
      .run(enabled ? 1 : 0, now, projectId, name)
  }

  get(projectId: string, name: string): PluginRow | undefined {
    const row = this.db.prepare('SELECT * FROM plugins WHERE project_id = ? AND name = ?').get(projectId, name) as
      PluginRowRaw | undefined
    return row ? parseRow(row) : undefined
  }

  list(projectId: string): PluginRow[] {
    const rows = this.db
      .prepare('SELECT * FROM plugins WHERE project_id = ? ORDER BY name')
      .all(projectId) as PluginRowRaw[]
    return rows.map(parseRow)
  }

  listEnabled(projectId: string): PluginRow[] {
    const rows = this.db
      .prepare('SELECT * FROM plugins WHERE project_id = ? AND enabled = 1 ORDER BY name')
      .all(projectId) as PluginRowRaw[]
    return rows.map(parseRow)
  }
}
