/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import {
  setSkillEnabled,
  getSkillPreferences,
  createCustomSkill,
  getCustomSkills,
  getCustomSkillByName,
  deleteCustomSkill,
} from '../core/skills/skill-store.js'
import type { CustomSkillInput } from '../schemas/skill.schema.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

const PROJECT_ID = 'proj_test_123'

function makeSkillInput(overrides: Partial<CustomSkillInput> = {}): CustomSkillInput {
  return {
    name: 'my-custom-skill',
    description: 'A test custom skill with sufficient description.',
    category: 'know-me',
    phases: ['IMPLEMENT'],
    instructions: 'Do the thing correctly.',
    ...overrides,
  }
}

describe('skill preferences', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
  })

  it('returns empty map when no preferences are set', () => {
    const prefs = getSkillPreferences(db, PROJECT_ID)
    expect(prefs.size).toBe(0)
  })

  it('sets and retrieves a skill preference', () => {
    setSkillEnabled(db, PROJECT_ID, 'graph-implement', true)
    const prefs = getSkillPreferences(db, PROJECT_ID)
    expect(prefs.get('graph-implement')).toBe(true)
  })

  it('updates an existing preference on repeated set', () => {
    setSkillEnabled(db, PROJECT_ID, 'graph-validate', true)
    setSkillEnabled(db, PROJECT_ID, 'graph-validate', false)
    const prefs = getSkillPreferences(db, PROJECT_ID)
    expect(prefs.get('graph-validate')).toBe(false)
  })
})

describe('custom skill CRUD', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
  })

  it('creates and retrieves a custom skill', () => {
    const skill = createCustomSkill(db, PROJECT_ID, makeSkillInput())
    expect(skill.id).toBeTruthy()
    expect(skill.name).toBe('my-custom-skill')
    expect(skill.projectId).toBe(PROJECT_ID)

    const list = getCustomSkills(db, PROJECT_ID)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(skill.id)
  })

  it('looks up a skill by name', () => {
    createCustomSkill(db, PROJECT_ID, makeSkillInput({ name: 'named-skill' }))
    const found = getCustomSkillByName(db, PROJECT_ID, 'named-skill')
    expect(found).toBeDefined()
    expect(found?.name).toBe('named-skill')
  })

  it('returns undefined for unknown skill name', () => {
    const found = getCustomSkillByName(db, PROJECT_ID, 'nonexistent-skill')
    expect(found).toBeUndefined()
  })

  it('deletes a custom skill by id', () => {
    const skill = createCustomSkill(db, PROJECT_ID, makeSkillInput({ name: 'delete-me' }))
    deleteCustomSkill(db, PROJECT_ID, skill.id)
    expect(getCustomSkills(db, PROJECT_ID)).toHaveLength(0)
  })

  it('throws when deleting a non-existent skill', () => {
    expect(() => deleteCustomSkill(db, PROJECT_ID, 'skill_nonexistent')).toThrow()
  })
})
