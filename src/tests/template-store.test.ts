/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_17a412e426c7 AC coverage: template-store.ts
 *
 * AC1: GIVEN empty DB WHEN listTaskTemplates THEN returns []
 * AC2: GIVEN createTaskTemplate WHEN valid input THEN persists and returns template
 * AC3: GIVEN getTaskTemplateByName WHEN name exists THEN returns template
 * AC4: GIVEN duplicate name WHEN createTaskTemplate THEN throws ValidationError
 * AC5: GIVEN deleteTaskTemplate WHEN valid id THEN removed
 * AC6: GIVEN deleteTaskTemplate WHEN unknown id THEN throws ValidationError
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  createTaskTemplate,
  listTaskTemplates,
  getTaskTemplateByName,
  deleteTaskTemplate,
} from '../core/skills/template-store.js'
import { ValidationError } from '../core/utils/errors.js'

// ── DB helpers ────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE task_templates (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      subtasks    TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      UNIQUE(project_id, name)
    );
  `)
  return db
}

const PROJECT = 'proj-test'

const INPUT = {
  name: 'feature-template',
  description: 'Standard feature delivery',
  subtasks: [
    { title: 'Write tests', description: '', status: 'backlog', priority: 2 },
    { title: 'Implement', description: '', status: 'backlog', priority: 2 },
  ],
}

// ── listTaskTemplates ─────────────────────────────────────────────────────────

describe('listTaskTemplates', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('AC1: returns [] when no templates exist', () => {
    expect(listTaskTemplates(db, PROJECT)).toEqual([])
  })

  it('returns all templates for project after creation', () => {
    createTaskTemplate(db, PROJECT, INPUT)
    const list = listTaskTemplates(db, PROJECT)
    expect(list).toHaveLength(1)
    expect(list[0]!.name).toBe('feature-template')
  })

  it('isolates templates by projectId', () => {
    createTaskTemplate(db, 'proj-a', INPUT)
    createTaskTemplate(db, 'proj-b', { ...INPUT, name: 'other-template' })
    expect(listTaskTemplates(db, 'proj-a')).toHaveLength(1)
    expect(listTaskTemplates(db, 'proj-b')).toHaveLength(1)
  })
})

// ── createTaskTemplate ────────────────────────────────────────────────────────

describe('createTaskTemplate', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('AC2: returns template with id, projectId, name, description', () => {
    const tmpl = createTaskTemplate(db, PROJECT, INPUT)
    expect(tmpl.id).toMatch(/^tmpl_/)
    expect(tmpl.projectId).toBe(PROJECT)
    expect(tmpl.name).toBe('feature-template')
    expect(tmpl.description).toBe('Standard feature delivery')
  })

  it('AC2: persists subtasks as parsed array', () => {
    const tmpl = createTaskTemplate(db, PROJECT, INPUT)
    expect(tmpl.subtasks).toHaveLength(2)
    expect(tmpl.subtasks[0]!.title).toBe('Write tests')
  })

  it('AC2: has createdAt and updatedAt timestamps', () => {
    const tmpl = createTaskTemplate(db, PROJECT, INPUT)
    expect(typeof tmpl.createdAt).toBe('string')
    expect(typeof tmpl.updatedAt).toBe('string')
  })

  it('AC4: throws ValidationError on duplicate name in same project', () => {
    createTaskTemplate(db, PROJECT, INPUT)
    expect(() => createTaskTemplate(db, PROJECT, INPUT)).toThrow(ValidationError)
  })

  it('AC4: allows same name in different projects', () => {
    createTaskTemplate(db, 'proj-a', INPUT)
    expect(() => createTaskTemplate(db, 'proj-b', INPUT)).not.toThrow()
  })
})

// ── getTaskTemplateByName ─────────────────────────────────────────────────────

describe('getTaskTemplateByName', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('AC3: returns template when found', () => {
    createTaskTemplate(db, PROJECT, INPUT)
    const result = getTaskTemplateByName(db, PROJECT, 'feature-template')
    expect(result).toBeDefined()
    expect(result!.name).toBe('feature-template')
  })

  it('AC3: returns undefined when name not found', () => {
    const result = getTaskTemplateByName(db, PROJECT, 'nonexistent')
    expect(result).toBeUndefined()
  })

  it('AC3: returns undefined when project has no templates', () => {
    expect(getTaskTemplateByName(db, 'other-proj', 'feature-template')).toBeUndefined()
  })

  it('parsed subtasks are correct', () => {
    createTaskTemplate(db, PROJECT, INPUT)
    const result = getTaskTemplateByName(db, PROJECT, 'feature-template')!
    expect(result.subtasks).toHaveLength(2)
  })
})

// ── deleteTaskTemplate ────────────────────────────────────────────────────────

describe('deleteTaskTemplate', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('AC5: removes template by id', () => {
    const tmpl = createTaskTemplate(db, PROJECT, INPUT)
    deleteTaskTemplate(db, PROJECT, tmpl.id)
    expect(listTaskTemplates(db, PROJECT)).toHaveLength(0)
  })

  it('AC5: only removes the matching template (other templates untouched)', () => {
    const t1 = createTaskTemplate(db, PROJECT, INPUT)
    createTaskTemplate(db, PROJECT, { ...INPUT, name: 'second-template' })
    deleteTaskTemplate(db, PROJECT, t1.id)
    expect(listTaskTemplates(db, PROJECT)).toHaveLength(1)
    expect(listTaskTemplates(db, PROJECT)[0]!.name).toBe('second-template')
  })

  it('AC6: throws ValidationError when id not found', () => {
    expect(() => deleteTaskTemplate(db, PROJECT, 'tmpl_nonexistent')).toThrow(ValidationError)
  })

  it('AC6: throws ValidationError when wrong projectId', () => {
    const tmpl = createTaskTemplate(db, PROJECT, INPUT)
    expect(() => deleteTaskTemplate(db, 'other-proj', tmpl.id)).toThrow(ValidationError)
  })
})
