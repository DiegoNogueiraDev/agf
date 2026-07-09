/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Acceptance Criteria Parser — detects GWT (Given/When/Then), checklist, and free-text formats.
 * Supports both English and Portuguese keywords.
 */

import type { ParsedAc, GwtStep, AcFormat } from '../../schemas/ac-quality-schema.js'

const GWT_KEYWORDS_EN = /^(given|when|then|and|but)\s/i
const GWT_KEYWORDS_PT = /^(dado|quando|então|entao|e|mas)\s/i
const CHECKLIST_PATTERN = /^[-*[\]✓✗☐☑]\s/

const TESTABLE_VERBS = [
  'deve',
  'should',
  'must',
  'returns',
  'retorna',
  'exibe',
  'displays',
  'cria',
  'creates',
  'valida',
  'validates',
  'rejeita',
  'rejects',
  'redireciona',
  'redirects',
  'envia',
  'sends',
  'salva',
  'saves',
  'mostra',
  'shows',
  'permite',
  'allows',
  'bloqueia',
  'blocks',
]

const MEASURABLE_PATTERNS = [
  /\d+\s*(ms|s|seg|min|%|px|kb|mb)/i,
  /\b(menor|maior|less|more|under|over|within|antes|depois)\s+(?:que\s)?\d+/i,
  /\b(exatamente|exactly|igual|equals?)\s+/i,
  /\b(status\s+\d{3}|código?\s+\d{3})/i,
  /\b(vazio|empty|null|undefined|true|false)\b/i,
]

/** parseAc —  */
export function parseAc(text: string): ParsedAc {
  const trimmed = text.trim()
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const format = detectFormat(lines)
  const steps = format === 'gwt' ? extractGwtSteps(lines) : undefined
  const isTestable = checkTestable(trimmed)
  const isMeasurable = checkMeasurable(trimmed)

  return {
    raw: trimmed,
    format,
    steps,
    isTestable,
    isMeasurable,
  }
}

function detectFormat(lines: string[]): AcFormat {
  const hasGwt = lines.some((l) => GWT_KEYWORDS_EN.test(l) || GWT_KEYWORDS_PT.test(l))
  if (hasGwt) return 'gwt'

  const hasChecklist = lines.some((l) => CHECKLIST_PATTERN.test(l))
  if (hasChecklist) return 'checklist'

  return 'free_text'
}

function extractGwtSteps(lines: string[]): GwtStep[] {
  const steps: GwtStep[] = []

  for (const line of lines) {
    const matchEn = line.match(/^(given|when|then|and|but)\s+(.+)$/i)
    const matchPt = line.match(/^(dado|quando|então|entao|e|mas)\s+(.+)$/i)
    const match = matchEn ?? matchPt

    if (match) {
      steps.push({
        keyword: match[1].toLowerCase(),
        text: match[2].trim(),
      })
    }
  }

  return steps
}

function checkTestable(text: string): boolean {
  const lower = text.toLowerCase()
  return TESTABLE_VERBS.some((v) => lower.includes(v))
}

function checkMeasurable(text: string): boolean {
  return MEASURABLE_PATTERNS.some((p) => p.test(text))
}
