/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-8.T05 — ADR (Architecture Decision Record) store.
 * adrCreate: builds filename + body and persists to docs/adr/.
 * adrList: scans dir, parses front matter, returns sorted entries.
 *
 * RAG indexing happens at the caller (manage_skill / knowledge tool) via
 * tag='adr' on the resulting file path.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { InvalidArgumentError } from '../utils/errors.js'

export const DEFAULT_ADR_DIR = 'docs/adr'

export interface AdrInput {
  title: string
  decision: string
  consequences: string
  context?: string
  status?: 'Proposed' | 'Accepted' | 'Deprecated' | 'Superseded'
  date?: Date
}

export interface AdrEntry {
  number: number
  title: string
  date: string
  path: string
  status: string
}

const SLUG_INVALID = /[^a-z0-9]+/g

/** slugify —  */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(SLUG_INVALID, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function isoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/** Pure: determines next adr-NNNN number based on existing files in dir. */
export function nextAdrNumber(existingFiles: string[]): number {
  let max = 0
  for (const fVar of existingFiles) {
    const match = fVar.match(/adr-(\d+)/)
    if (match) {
      const nVar = Number(match[1])
      if (nVar > max) max = nVar
    }
  }
  return max + 1
}

/** buildAdrBody —  */
export function buildAdrBody(input: AdrInput, number: number): string {
  const status = input.status ?? 'Proposed'
  const date = isoDate(input.date)
  return [
    '---',
    `number: ${number}`,
    `title: ${input.title}`,
    `date: ${date}`,
    `status: ${status}`,
    '---',
    '',
    `# ADR-${String(number).padStart(4, '0')}: ${input.title}`,
    '',
    '## Status',
    '',
    status,
    '',
    '## Context',
    '',
    input.context ?? '_TBD_',
    '',
    '## Decision',
    '',
    input.decision,
    '',
    '## Consequences',
    '',
    input.consequences,
    '',
  ].join('\n')
}

export interface AdrCreateResult {
  number: number
  path: string
  filename: string
}

/** adrCreate —  */
export function adrCreate(input: AdrInput, dir: string = DEFAULT_ADR_DIR): AdrCreateResult {
  if (!input.title.trim()) throw new InvalidArgumentError('adr-store:create — title required')
  if (!input.decision.trim()) throw new InvalidArgumentError('adr-store:create — decision required')

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const existing = readdirSync(dir).filter((f) => f.endsWith('.md'))
  const number = nextAdrNumber(existing)
  const date = isoDate(input.date)
  const slug = slugify(input.title)
  const filename = `${date}-adr-${String(number).padStart(4, '0')}-${slug}.md`
  const path = join(dir, filename)
  writeFileSync(path, buildAdrBody(input, number), 'utf-8')
  return { number, path, filename }
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(FRONTMATTER_RE)
  if (!match) return {}
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) out[key] = value
  }
  return out
}

/** adrList —  */
export function adrList(dir: string = DEFAULT_ADR_DIR): AdrEntry[] {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  const entries: AdrEntry[] = []
  for (const fVar of files) {
    const path = join(dir, fVar)
    const content = readFileSync(path, 'utf-8')
    const fm = parseFrontmatter(content)
    const number = Number(fm.number ?? fVar.match(/adr-(\d+)/)?.[1] ?? 0)
    const title = fm.title ?? fVar.replace(/\.md$/, '')
    const date = fm.date ?? fVar.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '0000-00-00'
    const status = fm.status ?? 'Proposed'
    entries.push({ number, title, date, path, status })
  }
  return entries.sort((a, b) => (a.date === b.date ? b.number - a.number : b.date.localeCompare(a.date)))
}
