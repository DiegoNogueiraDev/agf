/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { aggregateAgentLearnings } from '../core/insights/agent-learnings.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('aggregateAgentLearnings', () => {
  let db: Database.Database
  let skillsDir: string

  beforeEach(() => {
    db = createDb()
    // Create a temporary skills directory (empty — no domain skills)
    skillsDir = mkdtempSync(join(tmpdir(), 'agf-skills-test-'))
  })

  it('returns an AgentLearningsResult with expected shape', () => {
    const result = aggregateAgentLearnings(db, skillsDir)
    expect(result).toHaveProperty('domainSkills')
    expect(result).toHaveProperty('failures')
    expect(result).toHaveProperty('policies')
    expect(result).toHaveProperty('rules')
    expect(result).toHaveProperty('learnings')
    expect(result).toHaveProperty('total')
  })

  it('returns empty arrays when DB has no signals and skills dir is empty', () => {
    const result = aggregateAgentLearnings(db, skillsDir)
    expect(result.domainSkills).toHaveLength(0)
    expect(result.failures).toHaveLength(0)
    expect(result.learnings).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('includes domain skills when skills dir has markdown files', () => {
    // Create a domain/topic structure expected by loadDomainSkills
    const domainDir = join(skillsDir, 'auth')
    mkdirSync(domainDir, { recursive: true })
    const fm =
      '---\ndomain: auth\ntopic: oauth\ntriggers: [auth, oauth]\ndiscovered_at: 2026-01-01\nsource_task: task_001\nconfidence: 0.9\n---\n'
    writeFileSync(join(domainDir, 'oauth.md'), fm + '# OAuth\nUse OAuth2 for third-party auth.')

    const result = aggregateAgentLearnings(db, skillsDir)
    expect(result.domainSkills.length).toBeGreaterThan(0)
    expect(result.domainSkills[0].domain).toBe('auth')
    expect(result.domainSkills[0].topic).toBe('oauth')
  })

  it('total reflects skills + signal counts combined and is capped at 20', () => {
    // Create several skills
    for (let i = 0; i < 5; i++) {
      const dir = join(skillsDir, `domain${i}`)
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, `skill${i}.md`),
        `---\ndomain: domain${i}\ntopic: skill${i}\ntriggers: [test]\ndiscovered_at: 2026-01-01\nsource_task: task_00${i}\nconfidence: 0.8\n---\n# Skill ${i}\nDescription.`,
      )
    }
    const result = aggregateAgentLearnings(db, skillsDir)
    expect(result.total).toBeLessThanOrEqual(20)
    expect(result.domainSkills.length).toBe(5)
  })
})
