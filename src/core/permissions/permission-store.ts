import type Database from 'better-sqlite3'

export interface PermissionRow {
  projectId: string
  action: string
  resource: string
  effect: 'allow' | 'deny' | 'ask'
}

export interface PermissionStore {
  save(row: PermissionRow): void
  delete(projectId: string, action: string, resource: string): void
  list(projectId: string): PermissionRow[]
  check(projectId: string, action: string, resource: string): boolean
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS permissions (
    project_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    effect TEXT NOT NULL CHECK(effect IN ('allow', 'deny', 'ask')),
    PRIMARY KEY (project_id, action, resource)
  )
`

const UPSERT = `
  INSERT INTO permissions (project_id, action, resource, effect)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(project_id, action, resource)
  DO UPDATE SET effect = excluded.effect
`

const DELETE = 'DELETE FROM permissions WHERE project_id = ? AND action = ? AND resource = ?'

const LIST = 'SELECT project_id, action, resource, effect FROM permissions WHERE project_id = ?'

const CHECK = 'SELECT 1 FROM permissions WHERE project_id = ? AND action = ? AND resource = ?'

export function createPermissionStore(db: Database.Database): PermissionStore {
  db.exec(CREATE_TABLE)

  const upsertStmt = db.prepare(UPSERT)
  const deleteStmt = db.prepare(DELETE)
  const listStmt = db.prepare(LIST)
  const checkStmt = db.prepare(CHECK)

  return {
    save(row: PermissionRow): void {
      upsertStmt.run(row.projectId, row.action, row.resource, row.effect)
    },

    delete(projectId: string, action: string, resource: string): void {
      deleteStmt.run(projectId, action, resource)
    },

    list(projectId: string): PermissionRow[] {
      const rows = listStmt.all(projectId) as Array<{
        project_id: string
        action: string
        resource: string
        effect: string
      }>
      return rows.map((r) => ({
        projectId: r.project_id,
        action: r.action,
        resource: r.resource,
        effect: r.effect as PermissionRow['effect'],
      }))
    },

    check(projectId: string, action: string, resource: string): boolean {
      const row = checkStmt.get(projectId, action, resource)
      return row !== undefined
    },
  }
}
