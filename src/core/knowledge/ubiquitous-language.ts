/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-8.T04 — Ubiquitous Language store.
 * parse + merge + render CONTEXT.md '## Vocabulário Canonical' section.
 * Conflict on differing definition for the same term → throws (caller does
 * not persist). Caller is `knowledge(action:'ubiquitous_language')` MCP tool.
 */

import { InvalidArgumentError } from '../utils/errors.js'

export const VOCAB_HEADER = '## Vocabulário Canonical'

export interface VocabTerm {
  term: string
  definition: string
  /** Optional anti-pattern note. Rendered as a "Avoid" italic line. */
  avoid?: string
}

const TERM_LINE = /^### (.+?)\s*$/

/** parseVocab —  */
export function parseVocab(content: string): VocabTerm[] {
  const idx = content.indexOf(VOCAB_HEADER)
  if (idx === -1) return []
  // Slice from header to next H2 or EOF.
  const after = content.slice(idx + VOCAB_HEADER.length)
  const nextH2 = after.search(/\n##\s/)
  const section = nextH2 === -1 ? after : after.slice(0, nextH2)

  const out: VocabTerm[] = []
  const lines = section.split('\n')
  let current: VocabTerm | null = null
  let bodyLines: string[] = []
  let avoidLines: string[] = []
  let inAvoid = false

  const flush = () => {
    if (current) {
      current.definition = bodyLines.join('\n').trim()
      const avoid = avoidLines.join('\n').trim()
      if (avoid) current.avoid = avoid
      out.push(current)
    }
    current = null
    bodyLines = []
    avoidLines = []
    inAvoid = false
  }

  for (const line of lines) {
    const mVar = line.match(TERM_LINE)
    if (mVar) {
      flush()
      current = { term: mVar[1].trim(), definition: '' }
      continue
    }
    if (!current) continue
    const avoidMatch = line.match(/^\*\*Avoid[:：]?\*\*\s*[:：]?\s*(.*)$/i)
    if (avoidMatch || /^_Avoid_/.test(line)) {
      inAvoid = true
      const avoidStart = avoidMatch ? avoidMatch[1] : line.replace(/^_Avoid_\s*/, '')
      if (avoidStart.trim()) avoidLines.push(avoidStart.trim())
      continue
    }
    if (inAvoid) avoidLines.push(line)
    else bodyLines.push(line)
  }
  flush()
  return out
}

/**
 * Merge incoming terms into existing list. Conflict (same term, different
 * non-empty definition) throws. Empty/whitespace definitions never overwrite.
 * The "avoid" field is filled when missing, never replaced.
 */
export function mergeVocab(existing: VocabTerm[], incoming: VocabTerm[]): VocabTerm[] {
  const byTerm = new Map<string, VocabTerm>()
  for (const tVar of existing) byTerm.set(tVar.term.toLowerCase(), { ...tVar })

  for (const incoming_t of incoming) {
    const key = incoming_t.term.toLowerCase()
    const existing_t = byTerm.get(key)
    if (!existing_t) {
      byTerm.set(key, { ...incoming_t })
      continue
    }
    if (
      incoming_t.definition.trim() &&
      existing_t.definition.trim() &&
      incoming_t.definition.trim() !== existing_t.definition.trim()
    ) {
      throw new InvalidArgumentError(
        `ubiquitous-language:conflict — term '${incoming_t.term}' has divergent definition`,
      )
    }
    if (!existing_t.definition.trim() && incoming_t.definition.trim()) {
      existing_t.definition = incoming_t.definition
    }
    if (!existing_t.avoid && incoming_t.avoid) {
      existing_t.avoid = incoming_t.avoid
    }
  }
  return [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term))
}

/** renderVocabSection —  */
export function renderVocabSection(terms: VocabTerm[]): string {
  if (terms.length === 0) return `${VOCAB_HEADER}\n\n_(empty)_\n`
  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term))
  const blocks = sorted.map((t) => {
    const lines = [`### ${t.term}`, '', t.definition.trim()]
    if (t.avoid) {
      lines.push('', `**Avoid:** ${t.avoid.trim()}`)
    }
    return lines.join('\n')
  })
  return `${VOCAB_HEADER}\n\n${blocks.join('\n\n')}\n`
}

/**
 * Inserts/replaces the vocab section in a CONTEXT.md document. Preserves
 * surrounding content. Inserts before any '## ' that follows the original
 * vocab section, or appends to the end if absent.
 */
export function upsertVocabSection(originalDoc: string, sectionMarkdown: string): string {
  const idx = originalDoc.indexOf(VOCAB_HEADER)
  if (idx === -1) {
    const sep = originalDoc.endsWith('\n') ? '' : '\n'
    return `${originalDoc}${sep}\n${sectionMarkdown}`
  }
  const before = originalDoc.slice(0, idx)
  const after = originalDoc.slice(idx + VOCAB_HEADER.length)
  const nextH2 = after.search(/\n##\s/)
  const tail = nextH2 === -1 ? '' : after.slice(nextH2)
  return `${before}${sectionMarkdown.replace(/\n$/, '')}${tail}`
}
