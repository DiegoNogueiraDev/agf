/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Template Store — persistence layer for task templates.
 * Stores reusable task patterns with predefined subtasks.
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'
import { ValidationError } from '../utils/errors.js'
import type { TaskTemplate, TaskTemplateInput, TemplateSubtask } from '../../schemas/skill.schema.js'

const log = createLogger({ layer: 'core', source: 'template-store.ts' })

interface TemplateRow {
  id: string
  project_id: string
  name: string
  description: string
  subtasks: string
  created_at: string
  updated_at: string
}

function rowToTemplate(row: TemplateRow): TaskTemplate {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    subtasks: JSON.parse(row.subtasks) as TemplateSubtask[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Create a new reusable task template with predefined subtasks. */
export function createTaskTemplate(db: Database.Database, projectId: string, data: TaskTemplateInput): TaskTemplate {
  const id = generateId('tmpl')
  const timestamp = now()

  log.info('template-store:create', { projectId, name: data.name })

  try {
    db.prepare(
      `
      INSERT INTO task_templates (id, project_id, name, description, subtasks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(id, projectId, data.name, data.description, JSON.stringify(data.subtasks), timestamp, timestamp)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      throw new ValidationError(`Template '${data.name}' already exists in this project`, [])
    }
    throw err
  }

  return {
    id,
    projectId,
    name: data.name,
    description: data.description,
    subtasks: data.subtasks,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** List all task templates for a project ordered by creation date. */
export function listTaskTemplates(db: Database.Database, projectId: string): TaskTemplate[] {
  const rows = db
    .prepare('SELECT * FROM task_templates WHERE project_id = ? ORDER BY created_at')
    .all(projectId) as TemplateRow[]

  return rows.map(rowToTemplate)
}

/** Look up a task template by its unique name within a project. */
export function getTaskTemplateByName(
  db: Database.Database,
  projectId: string,
  name: string,
): TaskTemplate | undefined {
  const row = db.prepare('SELECT * FROM task_templates WHERE project_id = ? AND name = ?').get(projectId, name) as
    TemplateRow | undefined

  return row ? rowToTemplate(row) : undefined
}

/** Delete a task template by ID, throwing if not found. */
export function deleteTaskTemplate(db: Database.Database, projectId: string, id: string): void {
  log.info('template-store:delete', { projectId, id })
  const resultValue = db.prepare('DELETE FROM task_templates WHERE id = ? AND project_id = ?').run(id, projectId)

  if (resultValue.changes === 0) {
    throw new ValidationError(`Template not found: ${id}`, [])
  }
}
