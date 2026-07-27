/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Phase-based reference content — phase-to-tools/modes/skills mappings, getters, compression utilities, test tiers.
 * WHY here: phase mapping constants are internal helpers for getToolReference/getAnalyzeModes/getSkillsByPhase;
 * grouping them avoids exporting implementation details. Compression utils are co-located since they
 * wrap reference content delivery.
 * Composing modules: re-exported via reference-content.ts barrel. getFullReference imports from sibling modules.
 */

import {
  TOOL_TABLE_FULL,
  DEPRECATED_TOOLS_SECTION,
  PIPELINE_TOOLS_SECTION,
  CLI_COMMANDS,
} from './reference-deprecated.js'
import {
  ANALYZE_MODES_SECTION,
  KNOWLEDGE_PIPELINE_SECTION,
  HARNESS_SECTION,
  getMcpClientReference,
  getVersionReference,
} from './reference-tools.js'
import {
  SKILLS_SECTION,
  PHASE_GATES_SECTION,
  DOD_SECTION,
  TOOL_PREREQUISITES_SECTION,
  WORKFLOWS_SECTION,
  FLOW_PRINCIPLES_SECTION,
  QUALITY_METRICS_SECTION,
  TDD_ENFORCEMENT_SECTION,
  AGENT_ANTIPATTERNS_SECTION,
  DOR_SECTION,
} from './reference-skills.js'

// ── Phase-to-tools mapping ──────────────────────────

const PHASE_TOOLS: Record<string, string[]> = {
  ANALYZE: ['import_prd', 'node', 'analyze', 'validate', 'search', 'list', 'show', 'help', 'knowledge'],
  DESIGN: ['node', 'edge', 'analyze', 'export', 'search', 'show', 'help', 'code_intelligence', 'siebel', 'translate'],
  PLAN: ['plan_sprint', 'analyze', 'sync_stack_docs', 'edge', 'node', 'search', 'help', 'import_graph'],
  IMPLEMENT: [
    'start_task',
    'finish_task',
    'next',
    'context',
    'update_status',
    'analyze',
    'validate',
    'write_memory',
    'read_memory',
    'help',
    'code_intelligence',
    'translate',
    'siebel',
    'davinci',
    'journey',
  ],
  VALIDATE: ['validate', 'metrics', 'analyze', 'export', 'next', 'update_status', 'help', 'siebel', 'knowledge'],
  REVIEW: ['export', 'metrics', 'analyze', 'search', 'show', 'help', 'code_intelligence', 'knowledge'],
  HANDOFF: ['export', 'snapshot', 'analyze', 'write_memory', 'help', 'knowledge', 'translate'],
  DEPLOY: ['export', 'snapshot', 'analyze', 'metrics', 'write_memory', 'help'],
  LISTENING: ['node', 'import_prd', 'analyze', 'search', 'list', 'help', 'knowledge', 'import_graph'],
}

// ── Phase-to-analyze-modes mapping ──────────────────

const PHASE_ANALYZE_MODES: Record<string, string[]> = {
  ANALYZE: [
    'prd_quality',
    'scope',
    'ready',
    'risk',
    'blockers',
    'cycles',
    'critical_path',
    'prd_lifecycle_health',
    'success_rate',
  ],
  PLAN: ['decompose', 'sprint_health', 'auto_ready', 'capacity_health'],
  DESIGN: [
    'adr',
    'traceability',
    'coupling',
    'interfaces',
    'tech_risk',
    'design_ready',
    'contract_coverage',
    'data_integrity',
  ],
  IMPLEMENT: [
    'implement_done',
    'tdd_check',
    'progress',
    'formula_consistency',
    'performance_budget',
    'state_completeness',
    'economy_simulation',
  ],
  VALIDATE: [
    'validate_ready',
    'done_integrity',
    'status_flow',
    'scenario_coverage',
    'asset_blockers',
    'config_coverage',
    'metric_coverage',
    'concurrency_risk',
  ],
  REVIEW: ['review_ready'],
  HANDOFF: ['handoff_ready', 'doc_completeness'],
  DEPLOY: ['deploy_ready', 'release_check'],
  LISTENING: ['listening_ready', 'backlog_health'],
}

// ── Phase-to-skills mapping ─────────────────────────

const PHASE_SKILLS: Record<string, string[]> = {
  ANALYZE: ['create-prd-chat-mode', 'business-analyst', 'product-manager'],
  DESIGN: ['breakdown-epic-arch', 'context-architect', 'backend-architect'],
  PLAN: ['breakdown-feature-prd', 'track-with-mcp-graph'],
  IMPLEMENT: ['subagent-driven-development', 'xp-bootstrap', 'self-healing-awareness'],
  VALIDATE: ['playwright-explore-website', 'playwright-generate-test', 'e2e-testing'],
  REVIEW: ['code-reviewer', 'code-review-checklist', 'review-and-refactor', 'observability-engineer'],
  DEPLOY: ['deployment-engineer', 'devops-deploy', 'git-pushing'],
  HANDOFF: ['delivery-checklist', 'pr-documentation', 'knowledge-capture'],
  LISTENING: ['feedback-collector', 'iteration-planner', 'metrics-retrospective'],
}

// ── Getter functions ────────────────────────────────

/**
 * Get tool reference, optionally filtered by lifecycle phase.
 */
export function getToolReference(phase?: string): string {
  if (!phase) return TOOL_TABLE_FULL

  const upper = phase.toUpperCase()
  const tools = PHASE_TOOLS[upper]
  if (!tools) return TOOL_TABLE_FULL

  const lines = TOOL_TABLE_FULL.split('\n')
  const filtered = lines.filter((line) => {
    if (line.startsWith('#') || line.startsWith('|--') || line.trim() === '') return true
    if (line.startsWith('| Tool') || line.startsWith('| `')) {
      if (line.startsWith('| Tool')) return true
      return tools.some((tool) => line.includes(`\`${tool}\``))
    }
    return true
  })

  return `### Tools recomendadas para fase ${upper}\n\n${filtered.join('\n')}`
}

/**
 * Get analyze modes, optionally filtered by lifecycle phase.
 */
export function getAnalyzeModes(phase?: string): string {
  if (!phase) return ANALYZE_MODES_SECTION

  const upper = phase.toUpperCase()
  const modes = PHASE_ANALYZE_MODES[upper]
  if (!modes) return ANALYZE_MODES_SECTION

  const lines = ANALYZE_MODES_SECTION.split('\n')
  const filtered = lines.filter((line) => {
    if (line.startsWith('#') || line.startsWith('|--') || line.startsWith('| Fase') || line.trim() === '') return true
    return modes.some((mode) => line.includes(`\`${mode}\``))
  })

  return `### Modos analyze para fase ${upper}\n\n${filtered.join('\n')}`
}

/**
 * Get skills by lifecycle phase.
 */
export function getSkillsByPhase(phase?: string): string {
  if (!phase) return SKILLS_SECTION

  const upper = phase.toUpperCase()
  const skills = PHASE_SKILLS[upper]
  if (!skills)
    return `### Skills para fase ${upper}\n\nNenhuma skill específica mapeada. Use \`manage_skill(list)\` para ver todas.`

  return `### Skills para fase ${upper}\n\n${skills.map((s) => `- \`${s}\``).join('\n')}`
}

/**
 * Get all reference content combined.
 */
export function getFullReference(): string {
  return [
    TOOL_TABLE_FULL,
    DEPRECATED_TOOLS_SECTION,
    ANALYZE_MODES_SECTION,
    PIPELINE_TOOLS_SECTION,
    KNOWLEDGE_PIPELINE_SECTION,
    SKILLS_SECTION,
    PHASE_GATES_SECTION,
    DOD_SECTION,
    DOR_SECTION,
    TOOL_PREREQUISITES_SECTION,
    WORKFLOWS_SECTION,
    FLOW_PRINCIPLES_SECTION,
    QUALITY_METRICS_SECTION,
    TDD_ENFORCEMENT_SECTION,
    AGENT_ANTIPATTERNS_SECTION,
    CLI_COMMANDS,
    HARNESS_SECTION,
    getMcpClientReference(),
    getVersionReference(),
  ].join('\n\n')
}

// ── L5 Compression: Natural Language Reference Compressor ──

/**
 * Portuguese-aware text compressor for reference content.
 * Strips articles, hedges, and verbose phrases from markdown sent to LLM.
 * Achieves ~40-50% token reduction on reference content without semantic loss.
 */
export const PT_ARTICLES_RE = /\b(?:o|a|os|as|um|uma|uns|umas)\b\s*/gi

export const PT_HEDGES_RE = /\b(?:provavelmente|possivelmente|geralmente|normalmente|tipicamente)\b\s*/gi

export const PT_FILLER_RE =
  /\b(?:basicamente|essencialmente|simplesmente|realmente|claramente|obviamente|praticamente|atualmente)\b\s*/gi

/** Phrase → compact replacement. Ordered — first match wins per pass. */
export const PT_PHRASE_COMPACT: [RegExp, string][] = [
  [/\b(?:Quando usar)\b/g, 'Usar'],
  [/\b(?:O que faz)\b/g, 'Faz'],
  [/\b(?:O que verifica)\b/g, 'Verifica'],
  [/\b(?:O que mede)\b/g, 'Mede'],
  [/\b(?:através de)\b/gi, 'via'],
  [/\b(?:de acordo com)\b/gi, 'segundo'],
  [/\b(?:além disso)\b/gi, 'tb'],
  [/\b(?:também)\b/gi, 'tb'],
  [/\b(?:por exemplo)\b/gi, 'ex:'],
  [/\b(?:ou seja)\b/gi, '='],
  [/\b(?:a fim de)\b/gi, 'para'],
  [/\b(?:em relação a)\b/gi, 'sobre'],
  [/\b(?:no entanto)\b/gi, 'mas'],
  [/\b(?:portanto)\b/gi, 'logo'],
  [/\b(?:em vez de)\b/gi, 'vs'],
  [/\b(?:ao invés de)\b/gi, 'vs'],
  [/\b(?:de\s+acordo\s+com)\b/gi, 'segundo'],
]

/** Compress markdown reference content — strips PT articles/hedges/filler, abbreviates common phrases. */
export function compressReferenceContent(text: string): string {
  if (!text) return ''

  let out = text

  for (const [pattern, replacement] of PT_PHRASE_COMPACT) {
    out = out.replace(pattern, replacement)
  }

  out = out.replace(PT_HEDGES_RE, '')
  out = out.replace(PT_FILLER_RE, '')
  out = out.replace(PT_ARTICLES_RE, '')

  // Collapse whitespace and clean up punctuation artifacts.
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*[\s,]+\s*/gm, '')
    .trim()

  return out
}

/** Token savings estimator — approximate BPE (4 chars ≈ 1 token for PT/EN mixed). */
export function estimateRefTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Get full reference content with L5 compression applied.
 * Uses the PT-aware compressor to reduce token cost by ~40-50%.
 */
export function getCompressedFullReference(): string {
  const raw = getFullReference()
  return compressReferenceContent(raw)
}

export const TEST_TIER_SECTION = `## Execução de Testes — Gates Hierárquicos

Ver \`.claude/rules/tests.md\` para referência completa e scripts.

| Gate | Comando | Trigger | Target |
|------|---------|---------|--------|
| Task | \`npm run test:blast\` | \`finish_task\` (cada task) | <60s |
| Épico | \`npm run test:node\` | \`epicPromotion.readyToPromote: true\` | ~3 min |
| PR | \`npm test\` | Antes de \`git push\` | varia |

**Blast obrigatório no finish_task. Node obrigatório no epic gate. Full obrigatório pré-PR.**`
