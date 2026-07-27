/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Skill Loader — parses SKILL.md files with YAML frontmatter into CustomSkillInput.
 * Supports toolchain, triggers, and contextTemplate fields.
 * Inspired by hermes-agent skill system with progressive disclosure.
 */

import { CustomSkillInputSchema, type CustomSkillInput } from '../../schemas/skill.schema.js'
import { createLogger } from '../utils/logger.js'

export interface SkillMarkdownResult {
  ok: boolean
  skill?: CustomSkillInput
  error?: string
}

/**
 * Simple YAML frontmatter parser — handles basic key:value, arrays, and nested objects.
 * Not a full YAML parser, but sufficient for SKILL.md frontmatter.
 */
function parseFrontmatter(yamlText: string): Record<string, unknown> {
  const resultValue: Record<string, unknown> = {}
  const lines = yamlText.split('\n')
  let currentKey = ''
  let inArray = false
  let arrayItems: unknown[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Inline array: key: [val1, val2]
    const inlineArrayMatch = trimmed.match(/^(\w+):\s*\[([^\]]*)\]$/)
    if (inlineArrayMatch) {
      const key = inlineArrayMatch[1]
      const values = inlineArrayMatch[2]
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
      resultValue[key] = values
      inArray = false
      continue
    }

    // Array item: - value or - event: "..." etc.
    if (trimmed.startsWith('- ')) {
      if (inArray) {
        const itemText = trimmed.slice(2).trim()
        // Check for key: value object style
        const objMatch = itemText.match(/^(\w+):\s*"?([^"]*)"?$/)
        if (objMatch) {
          // Look ahead for more keys at same indent
          const objValue: Record<string, string> = { [objMatch[1]]: objMatch[2] }
          // Simple: just parse this line as single-key object
          // Multi-key objects will be handled by next lines checking indent
          arrayItems.push(objValue)
        } else {
          arrayItems.push(itemText.replace(/^["']|["']$/g, ''))
        }
      }
      continue
    }

    // Sub-key of array object: condition: "..."
    if (/^\s{2,}\w+:/.test(line) && inArray && arrayItems.length > 0) {
      const subMatch = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/)
      if (subMatch) {
        const lastItem = arrayItems[arrayItems.length - 1]
        if (typeof lastItem === 'object' && lastItem !== null) {
          ;(lastItem as Record<string, string>)[subMatch[1]] = subMatch[2]
        }
      }
      continue
    }

    // Key: value pair
    const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/)
    if (kvMatch) {
      // Commit previous array if any
      if (inArray && currentKey) {
        resultValue[currentKey] = arrayItems
        inArray = false
        arrayItems = []
      }

      const key = kvMatch[1]
      const value = kvMatch[2].trim().replace(/^["']|["']$/g, '')
      resultValue[key] = value
      currentKey = key
      continue
    }

    // Key with no value (starts array)
    const arrayStartMatch = trimmed.match(/^(\w+):$/)
    if (arrayStartMatch) {
      if (inArray && currentKey) {
        resultValue[currentKey] = arrayItems
      }
      currentKey = arrayStartMatch[1]
      inArray = true
      arrayItems = []
      continue
    }
  }

  // Commit final array
  if (inArray && currentKey) {
    resultValue[currentKey] = arrayItems
  }

  return resultValue
}

/**
 * Parse a SKILL.md file content into a CustomSkillInput.
 * Expects YAML frontmatter between --- markers, followed by markdown body.
 */
export function parseSkillMarkdown(content: string): SkillMarkdownResult {
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!frontmatterMatch) {
    return { ok: false, error: 'No YAML frontmatter found. SKILL.md must start with --- markers.' }
  }

  const yamlText = frontmatterMatch[1]
  const bodyText = frontmatterMatch[2].trim()

  // Parse frontmatter
  let frontmatter: Record<string, unknown>
  try {
    frontmatter = parseFrontmatter(yamlText)
  } catch (err) {
    return { ok: false, error: `YAML parse error: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Normalize the Codex `.agents/skills` SKILL.md dialect into the schema shape:
  //  - `triggers` may be a string array (`- graph-analyze`) → wrap as `{event}`.
  //  - `phases` is optional in that dialect → default to `[]` (skill applies to all).
  const rawTriggers = frontmatter.triggers
  const triggers = Array.isArray(rawTriggers)
    ? rawTriggers.map((t) => (typeof t === 'string' ? { event: t } : t))
    : rawTriggers
  const phases = Array.isArray(frontmatter.phases) ? frontmatter.phases : []

  // Build skill input
  const raw = {
    name: frontmatter.name,
    description: frontmatter.description,
    category: frontmatter.category ?? 'know-me',
    phases,
    // §extracta-sweep-1 — optional `platforms:` array; absent = all OSes.
    platforms: frontmatter.platforms,
    instructions: bodyText,
    toolchain: frontmatter.toolchain,
    triggers,
    contextTemplate: frontmatter.contextTemplate,
  }

  // Validate with Zod
  const parsed = CustomSkillInputSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    // debug, not warn: failures are returned in `errors[]` for callers that care;
    // emitting at warn polluted every TUI/CLI launch with skill-dialect noise.
    log.debug('skill-loader:validation_failed', { issues })
    return { ok: false, error: `Validation failed: ${issues}` }
  }

  return { ok: true, skill: parsed.data }
}

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const log = createLogger({ layer: 'core', source: 'skill-loader.ts' })

export interface DirSkillsResult {
  loaded: CustomSkillInput[]
  errors: Array<{ file: string; error: string }>
}

/**
 * §EPIC-22.D6 — Recursively load all .md skill files under a directory.
 * Each successfully parsed skill yields a CustomSkillInput; failures are
 * collected as {file, error} so the caller can surface them.
 */
export function loadSkillsFromDir(dir: string): DirSkillsResult {
  const resultValue: DirSkillsResult = { loaded: [], errors: [] }
  walk(dir, resultValue)
  return resultValue
}

function walk(dir: string, acc: DirSkillsResult): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err) {
    acc.errors.push({ file: dir, error: err instanceof Error ? err.message : String(err) })
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, acc)
      continue
    }
    if (!name.toLowerCase().endsWith('.md')) continue
    let content: string
    try {
      content = readFileSync(full, 'utf-8')
    } catch (err) {
      acc.errors.push({ file: full, error: err instanceof Error ? err.message : String(err) })
      continue
    }
    const parsed = parseSkillMarkdown(content)
    if (parsed.ok && parsed.skill) acc.loaded.push(parsed.skill)
    else acc.errors.push({ file: full, error: parsed.error ?? 'unknown parse error' })
  }
}
