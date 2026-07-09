import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const SKILLS_DIR = resolve(import.meta.dirname, '../../.agents/skills')

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const result: Record<string, unknown> = {}
  let currentArrayKey: string | null = null
  for (const line of match[1].split('\n')) {
    // YAML array item continuation
    const arrayItem = line.match(/^\s+-\s+(.+)/)
    if (arrayItem && currentArrayKey) {
      const arr = (result[currentArrayKey] as string[]) ?? []
      arr.push(arrayItem[1].trim())
      result[currentArrayKey] = arr
      continue
    }
    currentArrayKey = null
    // Key-value pair (value optional for YAML arrays on next line)
    const kv = line.match(/^(\w+):\s*(.*)/)
    if (kv) {
      const key = kv[1]
      const val = kv[2].trim()
      if (val.startsWith('[') && val.endsWith(']')) {
        result[key] = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      } else if (val) {
        result[key] = val
      } else {
        // Empty value — might be start of YAML array on next line
        currentArrayKey = key
        result[key] = []
      }
    }
  }
  return result
}

function readSkill(name: string): string {
  return readFileSync(resolve(SKILLS_DIR, name, 'SKILL.md'), 'utf-8')
}

function skillExists(name: string): boolean {
  return existsSync(resolve(SKILLS_DIR, name, 'SKILL.md'))
}

// Consolidated lifecycle: the 22 former phase skills were merged into two V2
// skills — graph-backlog-generation (plan→PRD→backlog) and graph-builder-leafcutter
// (autonomous build+learn loop). See EPIC-SKILLS.
const LIFECYCLE_SKILLS = ['graph-backlog-generation', 'graph-builder-leafcutter']

function isV2Skill(name: string): boolean {
  try {
    const content = readSkill(name)
    return /^version:\s*2\./m.test(content)
  } catch {
    return false
  }
}

const V2_SKILLS = new Set(LIFECYCLE_SKILLS.filter(isV2Skill))

describe('lifecycle skills — optimized format', () => {
  for (const name of LIFECYCLE_SKILLS) {
    const isV2 = V2_SKILLS.has(name)

    describe(name, () => {
      it('exists', () => {
        expect(skillExists(name)).toBe(true)
      })

      if (isV2) {
        // v2.0 format — uses `triggers` array, `version`, `author`, `date`
        it('has YAML frontmatter with name and triggers', () => {
          const content = readSkill(name)
          const fm = parseFrontmatter(content)
          expect(fm).not.toBeNull()
          expect(fm!.name).toBe(name)
          expect(fm!.triggers).toBeDefined()
          expect(fm!.version).toBeDefined()
        })

        it('uses v2.0 section names', () => {
          const content = readSkill(name)
          expect(content).toMatch(/^## When to Use/m)
          expect(content).toMatch(/^## Mandatory Flow/m)
          expect(content).toMatch(/^## Workflow/m)
        })
      } else {
        // v1.0 format
        it('has YAML frontmatter with name, tools_used, tokens', () => {
          const content = readSkill(name)
          const fm = parseFrontmatter(content)
          expect(fm).not.toBeNull()
          expect(fm!.name).toBe(name)
          expect(fm!.tools_used).toBeDefined()
          expect(fm!.tokens).toBeDefined()
        })

        it('has <!-- shared:... --> directive', () => {
          const content = readSkill(name)
          expect(content).toMatch(/<!-- shared:/)
        })

        it('is under 200 lines', () => {
          const lines = readSkill(name).split('\n').length
          expect(lines).toBeLessThan(200)
        })

        it('has required sections: When, Flow/Workflow, Steps, Exit', () => {
          const content = readSkill(name)
          expect(content).toMatch(/^## When/m)
          expect(content).toMatch(/^## (Flow|Workflow)/m)
          expect(content).toMatch(/^## (Steps|Workflow)/m)
          expect(content).toMatch(/^## Exit/m)
        })
      }

      it('has ## Economy section', () => {
        const content = readSkill(name)
        expect(content).toMatch(/Economy/i)
      })
    })
  }
})

/**
 * Discover every skill that ships a SKILL.md, one level deep plus the nested
 * cross-cutting/ group. Token-economy is a cross-cutting invariant: every skill
 * must teach the agent to spend the fewest tokens via `## Token Economy`.
 */
function discoverSkillFiles(): Array<{ id: string; path: string }> {
  const out: Array<{ id: string; path: string }> = []
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const direct = resolve(SKILLS_DIR, entry.name, 'SKILL.md')
    if (existsSync(direct)) {
      out.push({ id: entry.name, path: direct })
      continue
    }
    // one nested level (e.g. cross-cutting/graph-heal)
    for (const nested of readdirSync(resolve(SKILLS_DIR, entry.name), { withFileTypes: true })) {
      if (!nested.isDirectory()) continue
      const p = resolve(SKILLS_DIR, entry.name, nested.name, 'SKILL.md')
      if (existsSync(p)) out.push({ id: `${entry.name}/${nested.name}`, path: p })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

describe('all skills — token-economy invariant', () => {
  const skills = discoverSkillFiles()

  it('discovers the skill corpus', () => {
    expect(skills.length).toBeGreaterThanOrEqual(2)
  })

  for (const { id, path } of skills) {
    it(`${id} has a token-economy section`, () => {
      const content = readFileSync(path, 'utf-8')
      // Builder edition uses "## Economy"; planner uses "## Token Economy" — accept either.
      expect(content).toMatch(/^## (Token Economy|Economy)$/m)
    })

    it(`${id} surfaces the core economy levers`, () => {
      const content = readFileSync(path, 'utf-8')
      // Output-side economy levers every skill should surface.
      expect(content).toMatch(/--select/)
      expect(content).toMatch(/retrieve-command/)
      // `agf brief` is the delegate/execution handoff — only the builder delegates;
      // the planner is PLAN-ONLY, so it does not surface it.
      if (id === 'graph-builder-leafcutter') {
        expect(content).toMatch(/agf brief/)
      }
    })
  }
})
