import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SKILLS_DIR = resolve(import.meta.dirname, '../../.agents/skills')

function readSharedSections(): string[] {
  const sharedPath = resolve(SKILLS_DIR, '_shared.md')
  if (!existsSync(sharedPath)) return []
  const content = readFileSync(sharedPath, 'utf-8')
  const sections: string[] = []
  const matches = content.matchAll(/^##\s+(.+)$/gm)
  for (const m of matches) {
    sections.push(m[1].trim())
  }
  return sections
}

describe('_shared.md — common skill content', () => {
  it('exists in .agents/skills/_shared.md', () => {
    const sharedPath = resolve(SKILLS_DIR, '_shared.md')
    expect(existsSync(sharedPath)).toBe(true)
  })

  it('contains DoD section with all 9 checks', () => {
    const sharedPath = resolve(SKILLS_DIR, '_shared.md')
    const content = readFileSync(sharedPath, 'utf-8')
    expect(content).toContain('Definition of Done')
    expect(content).toContain('has_acceptance_criteria')
    expect(content).toContain('ac_quality_pass')
    expect(content).toContain('no_unresolved_blockers')
    expect(content).toContain('status_flow_valid')
    expect(content).toContain('has_description')
    expect(content).toContain('not_oversized')
    expect(content).toContain('has_testable_ac')
    expect(content).toContain('has_estimate')
    expect(content).toContain('has_test_files')
  })

  it('contains Phase Gates table', () => {
    const sharedPath = resolve(SKILLS_DIR, '_shared.md')
    const content = readFileSync(sharedPath, 'utf-8')
    expect(content).toContain('Phase Gates')
    expect(content).toContain('ANALYZE')
    expect(content).toContain('DESIGN')
    expect(content).toContain('IMPLEMENT')
    expect(content).toContain('VALIDATE')
  })

  it('contains the CLI-first pipeline reference', () => {
    const sharedPath = resolve(SKILLS_DIR, '_shared.md')
    const content = readFileSync(sharedPath, 'utf-8')
    expect(content).toMatch(/agf start.*TDD.*agf done/s)
  })

  it('contains 9 lifecycle phases', () => {
    const sharedPath = resolve(SKILLS_DIR, '_shared.md')
    const content = readFileSync(sharedPath, 'utf-8')
    expect(content).toContain('ANALYZE')
    expect(content).toContain('DESIGN')
    expect(content).toContain('PLAN')
    expect(content).toContain('IMPLEMENT')
    expect(content).toContain('VALIDATE')
    expect(content).toContain('REVIEW')
    expect(content).toContain('HANDOFF')
    expect(content).toContain('DEPLOY')
    expect(content).toContain('LISTENING')
  })

  it('contains XP Anti-Vibe-Coding principles', () => {
    const sharedPath = resolve(SKILLS_DIR, '_shared.md')
    const content = readFileSync(sharedPath, 'utf-8')
    expect(content).toContain('Anti-one-shot')
    expect(content).toContain('TDD mandatory')
  })

  it('has sections that can be individually referenced', () => {
    const sections = readSharedSections()
    expect(sections.length).toBeGreaterThanOrEqual(6)
    expect(sections).toContain('Definition of Done')
    expect(sections).toContain('Phase Gates')
    expect(sections).toContain('Pipeline')
    expect(sections).toContain('Lifecycle Phases')
    expect(sections).toContain('XP Principles')
  })
})
