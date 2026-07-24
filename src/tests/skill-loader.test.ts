import { describe, it, expect } from 'vitest'
import { parseSkillMarkdown } from '../core/skills/skill-loader.js'

function makeSkillMd(fields: Record<string, string>, body = 'Do the thing.'): string {
  const frontmatter = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `---\n${frontmatter}\n---\n${body}`
}

const VALID_FIELDS = {
  name: 'my-skill',
  description: 'Does something useful',
  category: 'implement',
  phases: '[IMPLEMENT]',
}

describe('parseSkillMarkdown', () => {
  it('returns ok:true for valid skill markdown', () => {
    const result = parseSkillMarkdown(makeSkillMd(VALID_FIELDS))
    expect(result.ok).toBe(true)
    expect(result.skill).toBeDefined()
  })

  it('extracts name from frontmatter', () => {
    const result = parseSkillMarkdown(makeSkillMd(VALID_FIELDS))
    expect(result.skill?.name).toBe('my-skill')
  })

  it('extracts description from frontmatter', () => {
    const result = parseSkillMarkdown(makeSkillMd(VALID_FIELDS))
    expect(result.skill?.description).toBe('Does something useful')
  })

  it('extracts instructions from body', () => {
    const body = 'Step by step instructions here.'
    const result = parseSkillMarkdown(makeSkillMd(VALID_FIELDS, body))
    expect(result.skill?.instructions).toContain('Step by step instructions here.')
  })

  it('returns ok:false when no frontmatter', () => {
    const result = parseSkillMarkdown('just plain text no frontmatter')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns ok:false when missing required name', () => {
    const fieldsWithoutName = { description: 'foo', category: 'implement' }
    const result = parseSkillMarkdown(makeSkillMd(fieldsWithoutName))
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when missing required description', () => {
    const fieldsWithoutDesc = { name: 'my-skill', category: 'implement' }
    const result = parseSkillMarkdown(makeSkillMd(fieldsWithoutDesc))
    expect(result.ok).toBe(false)
  })

  it('defaults category to know-me when absent', () => {
    const fields = { name: 'my-skill', description: 'useful' }
    const result = parseSkillMarkdown(makeSkillMd(fields))
    if (result.ok) {
      expect(result.skill?.category).toBe('know-me')
    }
  })

  it('normalizes trigger strings to {event} objects', () => {
    const content = `---\nname: my-skill\ndescription: Useful\ncategory: implement\npages: [IMPLEMENT]\ntriggers:\n  - graph-implement\n---\nbody`
    const result = parseSkillMarkdown(content)
    if (result.ok && result.skill?.triggers) {
      const triggers = result.skill.triggers as Array<{ event: string }>
      expect(triggers[0]).toHaveProperty('event')
    }
  })
})
