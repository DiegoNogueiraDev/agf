/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Stage 3: Heuristic classification.
 * Classify sections and bullet items into semantic types.
 */

import type { NodeType } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'parser/classify.ts' })

export type BlockType = NodeType | 'unknown'

export interface ClassifiedBlock {
  type: BlockType
  title: string
  description: string
  items: ClassifiedItem[]
  startLine: number
  endLine: number
  confidence: number
  level: number
  /**
   * AC bullets hoisted into this task/epic from a following "Acceptance Criteria"
   * section or an inline AC label, so they have an owner instead of becoming
   * ownerless acceptance_criteria nodes. Undefined when the block has no AC.
   */
  acceptanceCriteria?: string[]
}

export interface ClassifiedItem {
  type: BlockType
  text: string
  line: number
  confidence: number
}

// --- Heuristic keyword patterns (Portuguese + English) ---

const REQUIREMENT_PATTERNS = [
  /\bdeve\b/i,
  /\bprecisa\b/i,
  /\bnecessário\b/i,
  /\bmust\b/i,
  /\bshould\b/i,
  /\brequired\b/i,
  /\brequisito/i,
  /\brequirement/i,
]

const CONSTRAINT_PATTERNS = [
  /\bnão deve\b/i,
  /^sem\s/i,
  // AUDIT-003: match singular "restrição" (ç+ã) AND plural "restrições" (ç+õ),
  // plus English "restriction(s)". Original /\brestrição/i missed both plurals.
  /\brestri[çc][ãõ]/i,
  /\brestrictions?\b/i,
  /\bnão depender/i,
  /\bnão exigir/i,
  /\bconstraint/i,
  /\bwithout\b/i,
  /\bnot allowed/i,
  /\bfora do escopo/i,
]

const TASK_PATTERNS = [
  /\bimplementar\b/i,
  /\bcriar\b/i,
  /\badicionar\b/i,
  /\bdefinir\b/i,
  /\bconstruir\b/i,
  /\bconfigurar\b/i,
  /\binstalar\b/i,
  /\bdesenvolver\b/i,
  /\bimplement\b/i,
  /\bcreate\b/i,
  /\bbuild\b/i,
  /\bset up\b/i,
  /\bdesign\b/i,
]

const ACCEPTANCE_PATTERNS = [
  /\baceite\b/i,
  /\bcritério/i,
  /\bdone\b/i,
  /\bacceptance/i,
  /\bcriterion/i,
  /\bcriteria/i,
  /\bdefinition of done/i,
  // Gherkin/BDD format
  /\bgiven\b.+\bwhen\b/i,
  /\bwhen\b.+\bthen\b/i,
  /\bdado\b.+\bquando\b/i,
  /\bquando\b.+\bent[aã]o\b/i,
  // Declarative AC patterns (user/system can/should)
  /\busu[aá]rio\s{1,5}(pode|consegue|deve\s{1,5}poder)\b/i,
  /\buser\s{1,5}(can|should\s{1,5}be\s{1,5}able\s{1,5}to)\b/i,
]

const RISK_PATTERNS = [/\brisco\b/i, /\brisk\b/i, /\bmitigação/i, /\bmitigation/i]

const EPIC_TITLE_PATTERNS = [
  /\bepic\b/i,
  /\bvisão\b/i,
  /\bvision\b/i,
  /\bobjetivo principal/i,
  /\bproduto\b/i,
  /\bprojeto\b/i,
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

function isTaskNumberToken(token: string): boolean {
  const normalized = token.replace(/[:.)-]+$/g, '')
  const prefixed = normalized.match(/^[A-Za-z]+-(.+)$/)
  const numericPath = prefixed?.[1] ?? normalized
  const parts = numericPath.split(/[.-]/)

  return parts.length > 0 && parts.every((part) => part.length > 0 && /^\d+$/.test(part))
}

function isExplicitTaskHeading(text: string): boolean {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  if (/\bentregas?\b/i.test(trimmed)) return true

  const keyword = lower.startsWith('tarefa') ? 'tarefa' : lower.startsWith('task') ? 'task' : undefined
  if (!keyword) return false

  const rest = trimmed.slice(keyword.length).trim()
  if (/^[:#-]\s*\S/.test(rest)) return true

  const [firstToken] = rest.split(/\s+/)
  return firstToken !== undefined && isTaskNumberToken(firstToken)
}

const METADATA_PATTERNS = [
  /^\*\*(?:Size|Tamanho)\s*:/i,
  /^\*\*(?:Priority|Prioridade)\s*:/i,
  /^\*\*(?:Tags?)\s*:/i,
  /^\*\*(?:Depends?\s+on|Depende\s+de)\s*:/i,
]

/** Check whether a line matches PRD metadata patterns (size, priority, tags, depends). */
export function isMetadataLine(text: string): boolean {
  return METADATA_PATTERNS.some((p) => p.test(text))
}

/**
 * True for headings that are PRD scaffolding (sections, tier groupings,
 * count summaries) and should NOT be imported as implementable nodes.
 *
 * Distinguishes scaffolding ("TIER A —", "Sequenciamento (4 sprints…)",
 * "Subtarefas extraídas (3 itens)") from real work ("E4.T01 — hook-types",
 * "Implementar OAuth", "TIER 1 routing logic"). Used by parser-classify
 * + prd-to-graph + sprint-health to filter structural nodes from
 * implementable counts.
 */
export function isStructuralHeading(title: string): boolean {
  const tVar = title.trim()
  if (tVar.length === 0) return false

  // Implementable signals — these always override structural.
  if (/^E\d+\.T\d+/i.test(tVar)) return false
  if (/^\d+\.T\d+/i.test(tVar)) return false
  if (/^sprint\s+\d+\s*[—–-]\s*\w+/i.test(tVar)) return false
  if (
    /^(implement|implementar|fix|add|adicionar|criar|create|refactor|refatorar|remove|remover|deletar|delete|atualizar|update)\b/i.test(
      tVar,
    )
  ) {
    return false
  }

  // Tier groupings: "TIER <LETTER> — ..." (letter, not digit)
  if (/^TIER\s+[A-Z](?:\s|—|–|-)/i.test(tVar) && !/^TIER\s+\d/i.test(tVar)) {
    // Sanity: letter + boundary char; "TIER 1" already filtered by the second regex.
    return true
  }

  // Parenthetical count suffix: "(N itens|items|sprints|tasks|seções|sections)".
  if (/\(\d+\s*(itens?|items?|sprints?|tasks?|seções|sections?)\)/i.test(tVar)) return true

  // Nominal scaffolding keywords at start of heading.
  if (
    /^(Roadmap|Princípios?|Sequenciamento|Arquivos\s+críticos|Resumo\s+executivo|Métricas\s+de\s+sucesso|Riscos|Apêndice|Out\s+of\s+scope|Não-cobre|Contexto|Objetivo)/i.test(
      tVar,
    )
  ) {
    return true
  }

  return false
}

const CHECKBOX_PATTERN = /^\[[ x]\]\s/i

/** Classify a text line into a PRD block type (task, AC, risk, etc.) with confidence score. */
export function classifyText(text: string): { type: BlockType; confidence: number } {
  // Order matters: more specific checks first
  if (CHECKBOX_PATTERN.test(text)) return { type: 'acceptance_criteria', confidence: 0.9 }
  if (matchesAny(text, CONSTRAINT_PATTERNS)) return { type: 'constraint', confidence: 0.8 }
  if (matchesAny(text, ACCEPTANCE_PATTERNS)) return { type: 'acceptance_criteria', confidence: 0.8 }
  if (matchesAny(text, RISK_PATTERNS)) return { type: 'risk', confidence: 0.7 }
  if (matchesAny(text, TASK_PATTERNS)) return { type: 'task', confidence: 0.7 }
  if (matchesAny(text, REQUIREMENT_PATTERNS)) return { type: 'requirement', confidence: 0.7 }
  return { type: 'unknown', confidence: 0.3 }
}

/** Classify a section heading into a block type using title keywords and heading level. */
export function classifySectionTitle(title: string, level: number): { type: BlockType; confidence: number } {
  const lower = title.toLowerCase()

  // node_553378a0c155: an EXPLICIT task heading ("Task: …", "Tarefa: …", "Entregas")
  // must win over an INCIDENTAL keyword mentioned inside its own title — otherwise
  // "Task: X (risk, check)" matches RISK_PATTERNS first and is mis-typed as `risk`.
  // (Also subsumes AUDIT-001: explicit task heading beats the level===1 epic fallback.)
  if (isExplicitTaskHeading(title)) return { type: 'task', confidence: 0.85 }

  if (matchesAny(lower, ACCEPTANCE_PATTERNS)) return { type: 'acceptance_criteria', confidence: 0.9 }
  if (matchesAny(lower, RISK_PATTERNS)) return { type: 'risk', confidence: 0.85 }
  if (matchesAny(lower, CONSTRAINT_PATTERNS)) return { type: 'constraint', confidence: 0.85 }
  if (/\brequisito/i.test(lower) || /\brequirement/i.test(lower)) return { type: 'requirement', confidence: 0.9 }

  if (level === 1 || matchesAny(lower, EPIC_TITLE_PATTERNS)) return { type: 'epic', confidence: 0.8 }

  // Heading-level fallback: promote by structural position (only for actual headings)
  if (level >= 1 && level <= 2) return { type: 'epic', confidence: 0.7 }
  if (level === 3) return { type: 'task', confidence: 0.65 }
  if (level >= 4) return { type: 'subtask', confidence: 0.6 }
  return { type: 'unknown', confidence: 0.3 }
}

/**
 * AUDIT-002: apply the enclosing section's classified type as context.
 * A bullet/numbered item inside a `constraint` section is a constraint by
 * default — even when its wording happens to match a weaker heuristic (e.g.
 * "…critério de aceite" matching the AC patterns). Only an explicit checkbox
 * AC marker (a stronger, line-level signal) overrides the section context.
 */
function applySectionContext(
  classification: { type: BlockType; confidence: number },
  text: string,
  sectionType: BlockType,
): { type: BlockType; confidence: number } {
  if (sectionType === 'constraint' && classification.type !== 'constraint' && !CHECKBOX_PATTERN.test(text)) {
    return { type: 'constraint', confidence: Math.max(classification.confidence, 0.75) }
  }
  return classification
}

function parseBulletItems(body: string, startLine: number, sectionType: BlockType = 'unknown'): ClassifiedItem[] {
  const items: ClassifiedItem[] = []
  const lines = body.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // AUDIT-007: accept `+` list markers in addition to `-` (normalize maps the
    // others to `-`, but `+` items must survive even on un-normalized input).
    const bulletMatch = line.match(/^\s*[-+]\s+(.+)$/)
    if (!bulletMatch) continue

    const text = bulletMatch[1].trim()
    if (isMetadataLine(text)) continue
    const { type, confidence } = applySectionContext(classifyText(text), text, sectionType)

    items.push({
      type,
      text,
      line: startLine + i,
      confidence,
    })
  }

  return items
}

function parseNumberedItems(body: string, startLine: number, sectionType: BlockType = 'unknown'): ClassifiedItem[] {
  const items: ClassifiedItem[] = []
  const lines = body.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const numMatch = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (!numMatch) continue

    const text = numMatch[1].trim()
    if (isMetadataLine(text)) continue
    const { type, confidence } = applySectionContext(classifyText(text), text, sectionType)

    items.push({
      type,
      text,
      line: startLine + i,
      confidence,
    })
  }

  return items
}

/** Classify an entire PRD section (title + body) and extract typed child items. */
export function classifySection(
  title: string,
  body: string,
  level: number,
  startLine: number,
  endLine: number,
): ClassifiedBlock {
  const { type: sectionType, confidence: sectionConf } = classifySectionTitle(title, level)

  const bulletItems = parseBulletItems(body, startLine, sectionType)
  const numberedItems = parseNumberedItems(body, startLine, sectionType)
  const items = [...bulletItems, ...numberedItems]

  // If the section is a generic "unknown" but its items are mostly tasks, promote it
  let finalType = sectionType
  let finalConf = sectionConf

  if (sectionType === 'unknown' && items.length > 0) {
    const taskCount = items.filter((it) => it.type === 'task').length
    if (taskCount > items.length / 2) {
      finalType = 'task'
      finalConf = 0.6
    }
  }

  return {
    type: finalType,
    title,
    description: body,
    items,
    startLine,
    endLine,
    confidence: finalConf,
    level,
  }
}

/** Classify a markdown table's content by inspecting its header row for known keywords. */
export function classifyTableRows(tableBody: string): { type: BlockType; confidence: number } {
  const lower = tableBody.toLowerCase()
  const headerLine = lower.split('\n')[0] ?? ''
  if (/\brisco\b|\brisk\b/.test(headerLine)) return { type: 'risk', confidence: 0.8 }
  if (/\brequisito\b|\brequirement\b/.test(headerLine)) return { type: 'requirement', confidence: 0.8 }
  if (/\bconstraint\b|\brestrição\b/.test(headerLine)) return { type: 'constraint', confidence: 0.8 }
  return { type: 'unknown', confidence: 0.4 }
}
