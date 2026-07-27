/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pre-Mortem Generator — automatic failure mode generation for architectural decisions.
 *
 * Analyzes decision nodes, graph constraints, and dependencies to anticipate
 * failure scenarios within 3 months. Template-based, deterministic, no LLM.
 *
 * ADR-CE: Pure functions, keyword-based pattern matching.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'premortem-generator.ts' })

// ── Types ───────────────────────────────────────────────

export type FailureModeCategory = 'technical' | 'adoption' | 'operational' | 'security'
export type FailureModeSeverity = 'critical' | 'warning' | 'info'

export const FAILURE_MODE_CATEGORIES: readonly FailureModeCategory[] = [
  'technical',
  'adoption',
  'operational',
  'security',
] as const

export interface FailureMode {
  description: string
  category: FailureModeCategory
  severity: FailureModeSeverity
  relatedNodeIds: string[]
}

/** Minimal graph document view needed by the pre-mortem generator. */
export interface PreMortreGraphDoc {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── Constants ───────────────────────────────────────────

interface FailureModeTemplate {
  category: FailureModeCategory
  pattern: RegExp
  template: string
  defaultSeverity: FailureModeSeverity
}

const FAILURE_MODE_TEMPLATES: FailureModeTemplate[] = [
  // Technical
  {
    category: 'technical',
    pattern: /(?:performance|slow|latency|bottleneck|scaling)/i,
    template: 'Performance degradation: {technology} may introduce latency under load, affecting {scope}',
    defaultSeverity: 'warning',
  },
  {
    category: 'technical',
    pattern: /(?:compatibility|breaking|incompatible|version conflict)/i,
    template: 'Compatibility break: {technology} may cause incompatibilities with existing {scope}',
    defaultSeverity: 'critical',
  },
  {
    category: 'technical',
    pattern: /(?:dependency|depends on|external|third-party|npm install)/i,
    template: 'Dependency failure: reliance on {technology} creates a single point of failure for {scope}',
    defaultSeverity: 'warning',
  },
  // Adoption
  {
    category: 'adoption',
    pattern: /(?:learning curve|complex|difficult|steep)/i,
    template: 'User friction: {technology} introduces a learning curve that may slow adoption across {scope}',
    defaultSeverity: 'warning',
  },
  {
    category: 'adoption',
    pattern: /(?:migration|migrate|switch|transition|move from)/i,
    template: 'Migration resistance: transitioning to {technology} requires effort that teams may resist in {scope}',
    defaultSeverity: 'warning',
  },
  {
    category: 'adoption',
    pattern: /(?:setup|configuration|configure|manual step|install)/i,
    template:
      'Setup burden: {technology} requires manual configuration steps that increase onboarding friction for {scope}',
    defaultSeverity: 'info',
  },
  // Operational
  {
    category: 'operational',
    pattern: /(?:maintenance|maintain|upkeep|technical debt)/i,
    template: 'Maintenance burden: {technology} will require ongoing maintenance effort in {scope}',
    defaultSeverity: 'warning',
  },
  {
    category: 'operational',
    pattern: /(?:monitor|observability|logging|alerting|debug)/i,
    template: 'Monitoring gap: {technology} may lack sufficient observability tooling for {scope}',
    defaultSeverity: 'info',
  },
  {
    category: 'operational',
    pattern: /(?:scale|scaling|growth|concurrent|throughput)/i,
    template: 'Scaling issue: {technology} may not scale to meet future demand in {scope}',
    defaultSeverity: 'warning',
  },
  // Security
  {
    category: 'security',
    pattern: /(?:attack|vulnerability|exploit|injection|xss)/i,
    template: 'Attack surface: {technology} increases the attack surface via {scope}',
    defaultSeverity: 'critical',
  },
  {
    category: 'security',
    pattern: /(?:data exposure|leak|sensitive|personal data|pii)/i,
    template: 'Data exposure: {technology} may expose sensitive data in {scope}',
    defaultSeverity: 'critical',
  },
  {
    category: 'security',
    pattern: /(?:auth|authentication|authorization|token|session|credential)/i,
    template: 'Auth bypass risk: {technology} may introduce authentication gaps in {scope}',
    defaultSeverity: 'critical',
  },
]

/** High probability keywords for severity matrix. */
const HIGH_PROBABILITY_KEYWORDS = [
  'always',
  'every',
  'all users',
  'frequently',
  'every time',
  'consistently',
  'inevitably',
  'certainly',
]

/** High impact keywords for severity matrix. */
const HIGH_IMPACT_KEYWORDS = [
  'data loss',
  'downtime',
  'breaking change',
  'security breach',
  'corruption',
  'outage',
  'crash',
  'irreversible',
]

// ── Core Functions ──────────────────────────────────────

/**
 * Generate pre-mortem failure modes for an architectural decision.
 *
 * Analyzes the decision text against failure mode templates,
 * checks for constraint conflicts, and produces >= 3 failure modes.
 */
export function generatePreMortem(decision: GraphNode, doc: PreMortreGraphDoc): FailureMode[] {
  const text = (decision.description ?? '').toLowerCase()
  const failureModes: FailureMode[] = []

  const technology = extractTechnology(text)
  const scope = extractScope(text)

  // 1. Match templates against decision text
  for (const tmpl of FAILURE_MODE_TEMPLATES) {
    if (tmpl.pattern.test(text)) {
      const description = tmpl.template.replace('{technology}', technology).replace('{scope}', scope)

      const fm: FailureMode = {
        description,
        category: tmpl.category,
        severity: tmpl.defaultSeverity,
        relatedNodeIds: [],
      }
      fm.severity = calculateSeverity(fm)
      failureModes.push(fm)
    }
  }

  // 2. Check constraint conflicts
  const constraintNodes = doc.nodes.filter((n) => n.type === 'constraint')
  for (const constraint of constraintNodes) {
    const conflict = detectConstraintConflict(decision, constraint, doc.edges)
    if (conflict) {
      const fm: FailureMode = {
        description: `Constraint violation: decision conflicts with "${constraint.title}" — ${conflict}`,
        category: 'technical',
        severity: 'critical',
        relatedNodeIds: [constraint.id],
      }
      failureModes.push(fm)
    }
  }

  // 3. Check for missing Consequences section
  if (!hasConsequences(text)) {
    failureModes.push({
      description:
        'Missing consequences analysis: decision lacks explicit Consequences section, making impact assessment unreliable',
      category: 'operational',
      severity: 'warning',
      relatedNodeIds: [],
    })
  }

  // 4. Ensure minimum 3 failure modes with fallback generics
  ensureMinimumFailureModes(failureModes, technology, scope)

  log.debug('premortem:generate', {
    nodeId: decision.id,
    count: failureModes.length,
    categories: [...new Set(failureModes.map((fm) => fm.category))],
  })

  return failureModes
}

/**
 * Calculate severity using probability x impact matrix.
 *
 * - High probability + high impact = critical
 * - Medium/medium = warning
 * - Low = info
 *
 * Elevates severity if composite fitness score < 40.
 */
export function calculateSeverity(fm: FailureMode, compositeScore?: number): FailureModeSeverity {
  const text = fm.description.toLowerCase()

  const highProbability = HIGH_PROBABILITY_KEYWORDS.some((kw) => text.includes(kw))
  const highImpact = HIGH_IMPACT_KEYWORDS.some((kw) => text.includes(kw))

  let severity: FailureModeSeverity

  if (highProbability && highImpact) {
    severity = 'critical'
  } else if (highProbability || highImpact) {
    severity = 'warning'
  } else {
    severity = 'info'
  }

  // Elevate severity if composite fitness score is low (< 40)
  if (compositeScore !== undefined && compositeScore < 40) {
    if (severity === 'info') {
      severity = 'warning'
    } else if (severity === 'warning') {
      severity = 'critical'
    }
  }

  return severity
}

// ── Helpers ─────────────────────────────────────────────

/** Check if decision text includes a Consequences section with content. */
function hasConsequences(text: string): boolean {
  const consequencesMatch = text.match(/##\s*consequences\s*[:-]?\s*(.*)/i)
  if (!consequencesMatch) return false
  const content = consequencesMatch[1]?.trim() ?? ''
  return content.length > 0
}

/** Extract technology name from ADR Decision section. */
function extractTechnology(text: string): string {
  const decisionMatch = text.match(/##\s*decision\s*[:-]?\s*(.*)/i)
  if (!decisionMatch) return 'the chosen approach'

  const decisionText = decisionMatch[1] ?? ''
  // Try to find "Use X" pattern
  const useMatch = decisionText.match(/use\s+([a-z0-9][a-z0-9\s.-]+)/i)
  if (useMatch) return useMatch[1].trim()

  return decisionText.slice(0, 40).trim() || 'the chosen approach'
}

/** Extract scope from ADR Context section. */
function extractScope(text: string): string {
  const contextMatch = text.match(/##\s*context\s*[:-]?\s*(.*)/i)
  if (!contextMatch) return 'the system'

  const contextText = contextMatch[1] ?? ''
  return contextText.slice(0, 60).trim() || 'the system'
}

/** Detect conflict between decision and a constraint via edges or keyword overlap. */
function detectConstraintConflict(decision: GraphNode, constraint: GraphNode, edges: GraphEdge[]): string | null {
  const decisionText = (decision.description ?? '').toLowerCase()
  const constraintText = (constraint.description ?? '').toLowerCase()

  // Check explicit edge relationship
  const hasEdge = edges.some(
    (e) => (e.from === decision.id && e.to === constraint.id) || (e.from === constraint.id && e.to === decision.id),
  )

  // Check keyword overlap for implicit conflict detection
  const constraintKeywords = extractKeywords(constraintText)
  const decisionKeywords = extractKeywords(decisionText)

  // Detect negation patterns in constraint ("no X", "without X", "must not X")
  const negatedTerms = extractNegatedTerms(constraintText)
  const conflictingTerms = negatedTerms.filter((term) => decisionKeywords.has(term))

  if (hasEdge && conflictingTerms.length > 0) {
    return `decision uses "${conflictingTerms.join(', ')}" which constraint explicitly prohibits`
  }

  if (conflictingTerms.length > 0) {
    return `decision mentions "${conflictingTerms.join(', ')}" which conflicts with constraint prohibition`
  }

  // Fallback: check for opposite signals via edge relationship
  if (hasEdge) {
    const overlap = [...constraintKeywords].filter((k) => decisionKeywords.has(k))
    if (overlap.length > 0) {
      return `potential conflict on shared terms: ${overlap.slice(0, 3).join(', ')}`
    }
  }

  return null
}

/** Extract meaningful keywords from text. */
function extractKeywords(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'it',
    'its',
    'this',
    'that',
    'no',
    'must',
    'run',
    'without',
    'system',
  ])

  return new Set(
    text
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

/** Extract terms that are negated in constraint text ("no X", "without X"). */
function extractNegatedTerms(text: string): string[] {
  const terms: string[] = []

  // Match "no X", "without X", "must not X", "never X"
  const patterns = [/\bno\s+(\w+)/gi, /\bwithout\s+(\w+)/gi, /\bmust\s+not\s+(\w+)/gi, /\bnever\s+(\w+)/gi]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const term = match[1].toLowerCase()
      if (term.length > 2) {
        terms.push(term)
      }
    }
  }

  return terms
}

/** Ensure at least 3 failure modes, adding generic ones as fallback. */
function ensureMinimumFailureModes(failureModes: FailureMode[], technology: string, scope: string): void {
  const FALLBACK_MODES: FailureMode[] = [
    {
      description: `Technical debt accumulation: ${technology} may introduce complexity that compounds over time in ${scope}`,
      category: 'technical',
      severity: 'info',
      relatedNodeIds: [],
    },
    {
      description: `Knowledge silos: team members may lack expertise in ${technology}, creating bus-factor risk for ${scope}`,
      category: 'adoption',
      severity: 'info',
      relatedNodeIds: [],
    },
    {
      description: `Operational overhead: maintaining ${technology} requires ongoing effort that may exceed initial estimates for ${scope}`,
      category: 'operational',
      severity: 'info',
      relatedNodeIds: [],
    },
  ]

  let fallbackIndex = 0
  while (failureModes.length < 3 && fallbackIndex < FALLBACK_MODES.length) {
    // Avoid duplicate categories in fallbacks
    const existing = new Set(failureModes.map((fm) => fm.category))
    const fallback = FALLBACK_MODES[fallbackIndex]
    if (!existing.has(fallback.category) || failureModes.length < 2) {
      failureModes.push(fallback)
    }
    fallbackIndex++
  }
}
