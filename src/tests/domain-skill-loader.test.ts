/*!
 * Tests for domain-skill-loader.ts — parseDomainSkillMarkdown pure function.
 *
 * parseDomainSkillMarkdown(content, path) is purely functional:
 * parses YAML frontmatter + validates with Zod + returns ParseDomainSkillResult.
 * No DB, no FS, no LLM dependency.
 *
 * Covers: missing frontmatter, empty frontmatter, Zod validation failures,
 * valid skill parsing, path passthrough, body capture, array/number YAML types.
 */

import { describe, it, expect } from 'vitest'
import { parseDomainSkillMarkdown } from '../core/skills/domain-skill-loader.js'

// ── helper ────────────────────────────────────────────────────────────────────

function validFrontmatter(overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    domain: 'typescript',
    topic: 'testing',
    triggers: '[write test, add test]',
    discovered_at: '2026-06-23',
    source_task: 'node_abc123',
    confidence: '0.9',
    ...overrides,
  }
  const lines = Object.entries(base).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n`
}

// ── missing / malformed frontmatter ──────────────────────────────────────────

describe('parseDomainSkillMarkdown — missing frontmatter', () => {
  it('returns ok=false when content has no --- delimiters', () => {
    const result = parseDomainSkillMarkdown('Just plain text without frontmatter', 'test/skill.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('frontmatter')
  })

  it('returns ok=false for completely empty content', () => {
    const result = parseDomainSkillMarkdown('', 'test/skill.md')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns ok=false when frontmatter is not closed', () => {
    const result = parseDomainSkillMarkdown('---\ndomain: ts\n', 'test/skill.md')
    expect(result.ok).toBe(false)
  })
})

// ── empty frontmatter ─────────────────────────────────────────────────────────

describe('parseDomainSkillMarkdown — empty frontmatter', () => {
  it('returns ok=false for empty YAML block', () => {
    const result = parseDomainSkillMarkdown('---\n\n---\n', 'test/skill.md')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })
})

// ── Zod validation failures ────────────────────────────────────────────────────

describe('parseDomainSkillMarkdown — validation failures', () => {
  it('fails when domain is missing', () => {
    const content = validFrontmatter({ domain: '' })
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('fails when triggers array is empty', () => {
    const content = validFrontmatter({ triggers: '[]' })
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('trigger')
  })

  it('fails when confidence is missing', () => {
    const content = `---\ndomain: ts\ntopic: testing\ntriggers: [write test]\ndiscovered_at: 2026-06-23\nsource_task: node_abc\n---\n`
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.ok).toBe(false)
  })

  it('fails when source_task is missing', () => {
    const content = `---\ndomain: ts\ntopic: testing\ntriggers: [write test]\ndiscovered_at: 2026-06-23\nconfidence: 0.8\n---\n`
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.ok).toBe(false)
  })
})

// ── valid skill parsing ───────────────────────────────────────────────────────

describe('parseDomainSkillMarkdown — valid skill', () => {
  it('returns ok=true for a complete valid frontmatter', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'test/skill.md')
    expect(result.ok).toBe(true)
    expect(result.skill).toBeDefined()
  })

  it('parses domain and topic correctly', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'test/skill.md')
    expect(result.skill?.domain).toBe('typescript')
    expect(result.skill?.topic).toBe('testing')
  })

  it('parses triggers as array', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'test/skill.md')
    expect(Array.isArray(result.skill?.triggers)).toBe(true)
    expect(result.skill?.triggers).toContain('write test')
    expect(result.skill?.triggers).toContain('add test')
  })

  it('parses confidence as a number', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter({ confidence: '0.75' }), 'test/skill.md')
    expect(typeof result.skill?.confidence).toBe('number')
    expect(result.skill?.confidence).toBe(0.75)
  })
})

// ── path passthrough ──────────────────────────────────────────────────────────

describe('parseDomainSkillMarkdown — path passthrough', () => {
  it('sets skill.path to the provided path argument', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'typescript/testing.md')
    expect(result.skill?.path).toBe('typescript/testing.md')
  })

  it('skill.path is preserved regardless of content', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'custom/path/skill.md')
    expect(result.skill?.path).toBe('custom/path/skill.md')
  })
})

// ── body capture ──────────────────────────────────────────────────────────────

describe('parseDomainSkillMarkdown — body capture', () => {
  it('captures body content after the closing ---', () => {
    const body = '## Description\nThis skill teaches testing patterns.'
    const content = validFrontmatter() + body
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.skill?.body).toContain('Description')
    expect(result.skill?.body).toContain('testing patterns')
  })

  it('body is empty string when nothing follows the frontmatter', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'test/skill.md')
    expect(typeof result.skill?.body).toBe('string')
  })
})

// ── platform field ────────────────────────────────────────────────────────────

describe('parseDomainSkillMarkdown — optional platforms field', () => {
  it('parses platforms array when present', () => {
    const content = validFrontmatter({ platforms: '[darwin, linux]' })
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.ok).toBe(true)
    expect(result.skill?.platforms).toContain('darwin')
    expect(result.skill?.platforms).toContain('linux')
  })

  it('skill is valid without platforms field', () => {
    const result = parseDomainSkillMarkdown(validFrontmatter(), 'test/skill.md')
    expect(result.ok).toBe(true)
    expect(result.skill?.platforms).toBeUndefined()
  })

  it('fails when platform value is invalid', () => {
    const content = validFrontmatter({ platforms: '[windows]' })
    const result = parseDomainSkillMarkdown(content, 'test/skill.md')
    expect(result.ok).toBe(false)
  })
})
