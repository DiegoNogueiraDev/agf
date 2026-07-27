/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * JTBD-as-Test-Cases Runner — extracts Jobs-To-Be-Done from graph nodes
 * and runs them as test cases against decision nodes.
 *
 * Task 1.2 (node_efccfbdd6299) — Epic: Decision Fitness Functions
 *
 * Pure functions, no side effects. Keyword-based Jaccard scoring without LLM.
 * ADR-CE-03: PASS >= 0.3, PARTIAL 0.1-0.3, FAIL < 0.1.
 */

import type { GraphNode } from '../graph/graph-types.js'
import type { Jtbd } from './decision-fitness.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'jtbd-runner.ts' })

// ── Types ───────────────────────────────────────────────

export type JtbdTestStatus = 'PASS' | 'FAIL' | 'PARTIAL'

export interface JtbdTestResult {
  jtbd: Jtbd
  status: JtbdTestStatus
  overlapScore: number
  justification: string
}

// ── Constants ───────────────────────────────────────────

const JTBD_REGEX = /when\s+(.+?),\s*i\s+want\s+(.+?),\s*so\s+(?:i|that\s+i)\s+can\s+(.+?)(?:\.|$)/gi

const JTBD_SOURCE_TYPES = new Set(['epic', 'requirement'])

const PASS_THRESHOLD = 0.3
const PARTIAL_THRESHOLD = 0.1

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
  'during',
  'before',
  'after',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'we',
  'you',
  'he',
  'she',
  'they',
  'me',
  'us',
  'him',
  'her',
  'them',
  'my',
  'our',
  'your',
  'his',
  'their',
  'use',
  'using',
])

// ── Public Functions ────────────────────────────────────

/**
 * Extract JTBDs from graph nodes of type epic or requirement.
 * Parses "When [situation], I want [motivation], so I can [outcome]" patterns.
 * Returns empty array if no JTBDs found (with warning log).
 */
export function extractJtbds(nodes: GraphNode[]): Jtbd[] {
  const jtbds: Jtbd[] = []

  for (const node of nodes) {
    if (!JTBD_SOURCE_TYPES.has(node.type)) continue
    if (!node.description) continue

    // Reset regex state for each node (global flag)
    JTBD_REGEX.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = JTBD_REGEX.exec(node.description)) !== null) {
      jtbds.push({
        situation: match[1].trim(),
        motivation: match[2].trim(),
        outcome: match[3].trim(),
        sourceNodeId: node.id,
      })
    }
  }

  if (jtbds.length === 0 && nodes.length > 0) {
    log.warn('jtbd-runner:extract', {
      message: 'no JTBDs found in graph',
      nodeCount: nodes.length,
    })
  }

  log.debug('jtbd-runner:extract', {
    nodesScanned: nodes.length,
    jtbdsFound: jtbds.length,
  })

  return jtbds
}

/**
 * Run JTBDs as test cases against a decision node.
 * Uses Jaccard keyword overlap between JTBD motivation+outcome and decision text.
 * Returns PASS (>= 0.3), PARTIAL (0.1-0.3), FAIL (< 0.1) per JTBD.
 */
export function runJtbdTests(jtbds: Jtbd[], decision: GraphNode): JtbdTestResult[] {
  const decisionText = (decision.description ?? '').toLowerCase()
  const decisionWords = new Set(tokenize(decisionText))

  return jtbds.map((jtbd) => {
    const jtbdWords = new Set([...tokenize(jtbd.motivation.toLowerCase()), ...tokenize(jtbd.outcome.toLowerCase())])

    const intersection = [...jtbdWords].filter((w) => decisionWords.has(w))
    const union = new Set([...jtbdWords, ...decisionWords])
    const overlapScore = union.size > 0 ? intersection.length / union.size : 0

    const status = classifyOverlap(overlapScore)
    const justification = buildJustification(jtbd, status, overlapScore, intersection)

    log.debug('jtbd-runner:test', {
      jtbdSource: jtbd.sourceNodeId,
      decisionId: decision.id,
      status,
      overlapScore: +overlapScore.toFixed(4),
    })

    return { jtbd, status, overlapScore, justification }
  })
}

// ── Helpers ─────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

function classifyOverlap(score: number): JtbdTestStatus {
  if (score >= PASS_THRESHOLD) return 'PASS'
  if (score >= PARTIAL_THRESHOLD) return 'PARTIAL'
  return 'FAIL'
}

function buildJustification(jtbd: Jtbd, status: JtbdTestStatus, score: number, matchedWords: string[]): string {
  const pct = (score * 100).toFixed(1)

  switch (status) {
    case 'PASS':
      return `Decision aligns with JTBD (${pct}% overlap). Matched keywords: ${matchedWords.join(', ')}`
    case 'PARTIAL':
      return `Partial alignment with JTBD (${pct}% overlap). Some keywords matched: ${matchedWords.join(', ')}`
    case 'FAIL':
      return `Decision does not align with JTBD "${jtbd.motivation}" (${pct}% overlap). No significant keyword overlap found`
  }
}
