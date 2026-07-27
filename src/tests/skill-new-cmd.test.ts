/*!
 * Tests for agf skill new <name> scaffold command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scaffoldSkill } from '../cli/commands/skill-cmd.js'

const TMP = join(tmpdir(), `agf-skill-new-test-${Date.now()}`)

beforeEach(() => mkdirSync(TMP, { recursive: true }))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('scaffoldSkill', () => {
  it('creates SKILL.md with valid frontmatter in the target dir', () => {
    const result = scaffoldSkill('my-skill', TMP)
    expect(result.ok).toBe(true)
    const skillPath = join(TMP, 'my-skill', 'SKILL.md')
    expect(existsSync(skillPath)).toBe(true)
    const content = readFileSync(skillPath, 'utf8')
    expect(content).toMatch(/^---/)
    expect(content).toMatch(/name:\s*my-skill/)
    expect(content).toMatch(/description:/)
  })

  it('returns EXISTS error without overwriting when skill already exists', () => {
    scaffoldSkill('my-skill', TMP)
    const result = scaffoldSkill('my-skill', TMP)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('EXISTS')
  })

  it('scaffolds in an alternate dir when provided', () => {
    const altDir = join(TMP, 'alt-skills')
    mkdirSync(altDir, { recursive: true })
    const result = scaffoldSkill('alt-skill', altDir)
    expect(result.ok).toBe(true)
    expect(existsSync(join(altDir, 'alt-skill', 'SKILL.md'))).toBe(true)
  })
})
