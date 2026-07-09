/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-8.T06 — Out-of-scope decisions store.
 * Records concepts the project explicitly chose NOT to support, so the
 * agent doesn't re-litigate the same idea later. Stored as Markdown files
 * in .out-of-scope/ with date+reason, plus a .gitignore guard.
 *
 * Caller (knowledge tool) handles RAG indexing; this module is pure I/O
 * + a token-overlap match helper used by the check action.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { InvalidArgumentError } from '../utils/errors.js'

export const OUT_OF_SCOPE_DIR = '.out-of-scope'
export const DEFAULT_MATCH_THRESHOLD = 0.7

export interface OutOfScopeEntry {
  slug: string
  concept: string
  reason: string
  date: string
  path: string
}

const SLUG_INVALID = /[^a-z0-9]+/g

/** slugifyConcept —  */
export function slugifyConcept(concept: string): string {
  return concept
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(SLUG_INVALID, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const giPath = join(dir, '.gitignore')
  if (!existsSync(giPath)) {
    writeFileSync(giPath, '# §EPIC-8.T06 — keep entries local\n*\n!.gitignore\n')
  }
}

function buildBody(concept: string, reason: string, date: string): string {
  return [
    '---',
    `concept: ${concept}`,
    `date: ${date}`,
    '---',
    '',
    `# Out of scope: ${concept}`,
    '',
    '## Reason',
    '',
    reason,
    '',
  ].join('\n')
}

/** recordOutOfScope —  */
export function recordOutOfScope(
  concept: string,
  reason: string,
  dir: string = OUT_OF_SCOPE_DIR,
  date: Date = new Date(),
): OutOfScopeEntry {
  if (!concept.trim()) throw new InvalidArgumentError('out-of-scope:record — concept required')
  if (!reason.trim()) throw new InvalidArgumentError('out-of-scope:record — reason required')
  ensureDir(dir)
  const slug = slugifyConcept(concept)
  if (!slug) throw new InvalidArgumentError('out-of-scope:record — slug empty after normalization')
  const isoDate = date.toISOString().slice(0, 10)
  const path = join(dir, `${slug}.md`)
  writeFileSync(path, buildBody(concept, reason, isoDate), 'utf-8')
  return { slug, concept, reason, date: isoDate, path }
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/

function parseEntry(path: string, content: string, slug: string): OutOfScopeEntry {
  const fm = content.match(FRONTMATTER_RE)
  let concept = slug
  let date = '0000-00-00'
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (key === 'concept') concept = value
      else if (key === 'date') date = value
    }
  }
  const reasonMatch = content.match(/## Reason\s*\n+([\s\S]*?)(?:\n##\s|\n*$)/)
  const reason = reasonMatch ? reasonMatch[1].trim() : ''
  return { slug, concept, reason, date, path }
}

/** listOutOfScope —  */
export function listOutOfScope(dir: string = OUT_OF_SCOPE_DIR): OutOfScopeEntry[] {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '.gitignore')
  return files.map((f) => {
    const path = join(dir, f)
    const slug = f.replace(/\.md$/, '')
    return parseEntry(path, readFileSync(path, 'utf-8'), slug)
  })
}

/** Token Jaccard similarity (cheap stand-in until embeddings are wired). */
export function tokenSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3),
    )
  const AVar = tok(a)
  const BVar = tok(b)
  if (AVar.size === 0 || BVar.size === 0) return 0
  let inter = 0
  for (const tVar of AVar) if (BVar.has(tVar)) inter++
  return inter / (AVar.size + BVar.size - inter)
}

export interface OutOfScopeMatch extends OutOfScopeEntry {
  similarity: number
}

/** checkOutOfScope —  */
export function checkOutOfScope(
  concept: string,
  dir: string = OUT_OF_SCOPE_DIR,
  threshold: number = DEFAULT_MATCH_THRESHOLD,
): OutOfScopeMatch[] {
  const entries = listOutOfScope(dir)
  const matches: OutOfScopeMatch[] = []
  for (const e of entries) {
    const sim = tokenSimilarity(concept, `${e.concept} ${e.reason}`)
    if (sim >= threshold) matches.push({ ...e, similarity: sim })
  }
  return matches.sort((a, b) => b.similarity - a.similarity)
}
