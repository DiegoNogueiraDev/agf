/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ADR Challenge Runner — orchestrates the full challenge flow for decision nodes.
 *
 * Flow: decision node → fitness scoring → JTBD extraction → pre-mortem → report
 * Pure core function called by analyze(mode: "adr_challenge").
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'
import { scoreFriction, scoreOptimality, scoreReversibility, computeDecisionFitness } from './decision-fitness.js'
import { assembleChallengeReport, type ChallengeReport } from './challenge-report.js'
import type { Finding } from './severity-scoring.js'
import { evaluateDecisionPrinciples, BUILT_IN_PRINCIPLES } from './decision-principles.js'
import { extractJtbds, runJtbdTests } from './jtbd-runner.js'
import { generatePreMortem, type FailureModeCategory, type PreMortreGraphDoc } from './premortem-generator.js'
import type { FindingDimension } from './severity-scoring.js'
import { NodeNotFoundError, InvalidArgumentError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'adr-challenge-runner.ts' })

// ── Types ───────────────────────────────────────────────

export interface AdrChallengeResult {
  nodeId: string
  nodeTitle: string
  report: ChallengeReport
}

export interface AllAdrChallengesResult {
  reports: AdrChallengeResult[]
  summary: {
    totalDecisions: number
    passed: number
    failed: number
    avgCompositeScore: number
  }
}

// ── Pre-mortem Generation ───────────────────────────────

/** Map the richer FailureModeCategory (premortem-generator.ts) onto the Finding dimension axis. */
const CATEGORY_TO_DIMENSION: Record<FailureModeCategory, FindingDimension> = {
  technical: 'friction',
  adoption: 'optimality',
  operational: 'general',
  security: 'general',
}

function generatePreMortemFindings(decision: GraphNode, doc: PreMortreGraphDoc): Finding[] {
  return generatePreMortem(decision, doc).map((fm) => ({
    message: fm.description,
    source: 'premortem',
    dimension: CATEGORY_TO_DIMENSION[fm.category],
    severity: fm.severity,
  }))
}

// ── Runner Functions ────────────────────────────────────

/**
 * Run ADR challenge for a single decision node.
 * Throws if node doesn't exist or is not a decision type.
 */
export function runAdrChallenge(store: SqliteStore, nodeId: string): AdrChallengeResult {
  const node = store.getNodeById(nodeId)
  if (!node) {
    throw new NodeNotFoundError(nodeId)
  }

  if (node.type !== 'decision') {
    throw new InvalidArgumentError(`expected node type 'decision', got '${node.type}'`)
  }

  // 1. Fitness scoring
  const friction = scoreFriction(node)
  const allNodes = store.getAllNodes()
  const jtbds = extractJtbds(allNodes)
  const optimality = scoreOptimality(node, jtbds)
  const reversibility = scoreReversibility(node)
  const fitness = computeDecisionFitness(friction.score, optimality.score, reversibility.score)

  // 2. JTBD test results (tokenize + Jaccard overlap + stop-word filtering, jtbd-runner.ts)
  const jtbdResults = runJtbdTests(jtbds, node).map((r) => ({
    jtbd: `When ${r.jtbd.situation}, I want ${r.jtbd.motivation}, so I can ${r.jtbd.outcome}`,
    result: r.status,
    score: r.overlapScore,
  }))

  // 3. Pre-mortem findings
  const preMortemFindings = generatePreMortemFindings(node, { nodes: allNodes, edges: store.getAllEdges() })

  // 3b. Decision principle violations (zero-config-default, prefer-reversible, etc.)
  const principleFindings: Finding[] = evaluateDecisionPrinciples(node, BUILT_IN_PRINCIPLES).map((v) => ({
    message: `[${v.principleName}] ${v.message}`,
    source: 'principle',
    dimension: v.dimension,
    severity: v.severity,
  }))

  // 4. Assemble report
  const allFindings = [...preMortemFindings, ...principleFindings]
  const report = assembleChallengeReport({ fitness, jtbdResults, preMortemFindings: allFindings })

  log.info('adr-challenge:run', {
    mode: 'adr_challenge',
    nodeId,
    verdict: report.overallVerdict.verdict,
    compositeScore: fitness.composite,
    findingsCount: allFindings.length,
  })

  return { nodeId, nodeTitle: node.title, report }
}

/**
 * Run ADR challenge for ALL decision nodes in the graph.
 * Returns individual reports + consolidated summary.
 */
export function runAllAdrChallenges(store: SqliteStore): AllAdrChallengesResult {
  const allNodes = store.getAllNodes()
  const decisionNodes = allNodes.filter((n) => n.type === 'decision')

  const reports: AdrChallengeResult[] = []
  let totalComposite = 0
  let passed = 0
  let failed = 0

  for (const node of decisionNodes) {
    const resultValue = runAdrChallenge(store, node.id)
    reports.push(resultValue)

    totalComposite += resultValue.report.fitnessScore.composite
    if (resultValue.report.overallVerdict.verdict === 'CHALLENGE_PASSED') {
      passed++
    } else {
      failed++
    }
  }

  const summary = {
    totalDecisions: decisionNodes.length,
    passed,
    failed,
    avgCompositeScore: decisionNodes.length > 0 ? +(totalComposite / decisionNodes.length).toFixed(2) : 0,
  }

  log.info('adr-challenge:run-all', {
    mode: 'adr_challenge',
    totalDecisions: summary.totalDecisions,
    passed: summary.passed,
    failed: summary.failed,
    avgScore: summary.avgCompositeScore,
  })

  return { reports, summary }
}
