/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * A skill that fails to parse does not report an error — it simply never appears.
 *
 * That silence is the whole problem. `graph-woodpecker` shipped for months with an
 * unquoted `description` containing `(BUILD): this is HARDEN`. YAML reads the
 * colon-space as the start of a nested mapping, the frontmatter fails to parse, and
 * every strict loader drops the skill. No warning reaches the user; the skill is
 * simply absent from the catalogue, and the agent behaves as if it never existed.
 *
 * Two more skills had the same defect, four had a `description` past the 1024-char
 * limit, and one had no frontmatter at all. All eight were invisible.
 *
 * This test is what makes that impossible to reintroduce. It reads the skills as a
 * loader would — parse the YAML, check the contract — and fails the build instead
 * of failing quietly.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** The Agent Skills contract enforced by every loader that reads these files. */
const NAME_MAX = 64
const DESCRIPTION_MAX = 1024
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// One authored source. There used to be a mirror at `skills/`; nothing loaded it,
// and it drifted. See scripts/sync-skills.mjs.
const SKILL_ROOTS = ['.agents/skills'].filter((d) => existsSync(join(process.cwd(), d)))

/** Every `<root>/<name>/SKILL.md` that exists, as [skillName, absolutePath]. */
function skillFiles(): Array<[string, string]> {
  return SKILL_ROOTS.flatMap((root) =>
    readdirSync(join(process.cwd(), root), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => [`${root}/${e.name}`, join(process.cwd(), root, e.name, 'SKILL.md')] as [string, string])
      .filter(([, p]) => existsSync(p)),
  )
}

/** The raw YAML block between the opening and closing `---`, or null. */
function frontmatter(source: string): string | null {
  if (!source.startsWith('---\n')) return null
  const end = source.indexOf('\n---', 4)
  return end === -1 ? null : source.slice(4, end)
}

describe('skill frontmatter — a skill that cannot be parsed is never offered', () => {
  const skills = skillFiles()

  it('finds skills to check (a passing suite over zero files proves nothing)', () => {
    expect(skills.length).toBeGreaterThan(0)
  })

  it.each(skills)('%s has a frontmatter block', (_name, path) => {
    expect(frontmatter(readFileSync(path, 'utf8')), 'must open with `---` on line 1').not.toBeNull()
  })

  it.each(skills)('%s parses as YAML', (_name, path) => {
    const block = frontmatter(readFileSync(path, 'utf8'))
    // The classic break: an unquoted description containing `: `. Quote it.
    expect(() => parseYaml(block ?? '')).not.toThrow()
  })

  it.each(skills)('%s declares a valid name and description', (name, path) => {
    const meta = parseYaml(frontmatter(readFileSync(path, 'utf8')) ?? '') as Record<string, unknown>

    expect(typeof meta.name, `${name}: \`name\` is required`).toBe('string')
    const skillName = String(meta.name)
    expect(skillName.length).toBeLessThanOrEqual(NAME_MAX)
    expect(skillName, `${name}: \`name\` must be kebab-case`).toMatch(KEBAB_CASE)
    expect(skillName, `${name}: \`name\` must equal its directory`).toBe(name.split('/').pop())

    expect(typeof meta.description, `${name}: \`description\` is required`).toBe('string')
    const description = String(meta.description)
    expect(
      description.length,
      `${name}: description is ${description.length} chars — over the limit, so the skill is dropped`,
    ).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(description.length, `${name}: an empty description gives the model nothing to match on`).toBeGreaterThan(0)
  })
})

/** Every `.md` under `.agents/skills`, at any depth, as [relativePath, absolutePath]. */
function authoredMarkdown(root = '.agents/skills'): Array<[string, string]> {
  const walk = (rel: string): Array<[string, string]> =>
    readdirSync(join(process.cwd(), rel), { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(join(rel, e.name))
      return e.name.endsWith('.md') ? [[join(rel, e.name), join(process.cwd(), rel, e.name)] as [string, string]] : []
    })
  return walk(root)
}

describe('zero MCP — an authored skill never tells the agent to call an MCP tool', () => {
  // `agf` is the whole interface: "Tudo via o CLI `agf` — zero MCP" (CLAUDE.md). The MCP
  // server is an optional transport, and no session mounts an `mcp-graph` server by default.
  // Eleven skills inherited from the retired `skills/` mirror still named tools like
  // `mcp__mcp-graph__write_memory`. An agent following them calls a tool that is not there:
  // it errors, or — worse — it invents the result. Every capability those calls reached for
  // has an `agf` command that exists (`agf memory write`, `agf code`, `agf context`).
  const files = authoredMarkdown()

  it('finds authored markdown to check', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it.each(files)('%s names no mcp__ tool', (_rel, path) => {
    const offending = readFileSync(path, 'utf8')
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => line.includes('mcp__'))
      .map(([n, line]) => `  L${n}: ${line.trim().slice(0, 90)}`)

    expect(offending.join('\n'), `use the agf command instead of an MCP tool`).toBe('')
  })
})

describe('one authored source', () => {
  it('the retired skills/ mirror has not come back', () => {
    // Nothing loaded it — skill-registry.ts reads src/skills, .agents/skills and
    // .claude/skills, never this. It existed only to be copied, and it drifted:
    // fourteen of its skills had fallen dozens of lines behind the global registry,
    // and a blind rename left a command in one copy that did not exist in the other.
    expect(existsSync(join(process.cwd(), 'skills')), 'skills/ is retired — author in .agents/skills').toBe(false)
  })

  it('every authored skill is a directory with a SKILL.md', () => {
    const dirs = readdirSync(join(process.cwd(), '.agents/skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'node_modules')
      .map((e) => e.name)
    const missing = dirs.filter((n) => !existsSync(join(process.cwd(), '.agents/skills', n, 'SKILL.md')))
    expect(missing).toEqual([])
    expect(dirs.length).toBeGreaterThan(30)
  })
})
