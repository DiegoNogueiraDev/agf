/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Traceability matrix: requirement → decision → constraint coverage.
 * Follows edges to determine coverage level per requirement.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { TraceabilityReport, TraceabilityEntry, TraceabilityCoverage } from '../../schemas/designer-schema.js'
import { createLogger } from '../utils/logger.js'
import { existsSync } from 'node:fs'
import { missingFiles, type FileExistsPort } from '../gaps/detect-phantom-done.js'

const log = createLogger({ layer: 'core', source: 'traceability-matrix.ts' })

const TRACEABILITY_EDGE_TYPES = new Set([
  'implements',
  'derived_from',
  'related_to',
  'depends_on',
  'parent_of',
  'child_of',
])

/**
 * Find all nodes of given types connected to nodeId via traceability edges (both directions).
 */
function findLinked(doc: GraphDocument, nodeId: string, targetTypes: Set<string>): string[] {
  const linked = new Set<string>()
  const nodeTypeMap = new Map(doc.nodes.map((n) => [n.id, n.type]))

  for (const edge of doc.edges) {
    if (!TRACEABILITY_EDGE_TYPES.has(edge.relationType)) continue

    let otherId: string | null = null
    if (edge.from === nodeId) otherId = edge.to
    else if (edge.to === nodeId) otherId = edge.from

    if (otherId && targetTypes.has(nodeTypeMap.get(otherId) ?? '')) {
      linked.add(otherId)
    }
  }

  return [...linked]
}

function determineCoverage(linkedDecisions: string[], linkedConstraints: string[]): TraceabilityCoverage {
  if (linkedDecisions.length > 0 && linkedConstraints.length > 0) return 'full'
  if (linkedDecisions.length > 0 || linkedConstraints.length > 0) return 'partial'
  return 'none'
}

/** Build requirement-to-decision-to-constraint coverage matrix. */
export function buildTraceabilityMatrix(doc: GraphDocument): TraceabilityReport {
  const requirements = doc.nodes.filter((n) => n.type === 'requirement')
  const decisions = doc.nodes.filter((n) => n.type === 'decision')

  const decisionTypes = new Set(['decision'])
  const constraintTypes = new Set(['constraint'])

  const matrix: TraceabilityEntry[] = requirements.map((req) => {
    const linkedDecisions = findLinked(doc, req.id, decisionTypes)
    const linkedConstraints = findLinked(doc, req.id, constraintTypes)
    const coverage = determineCoverage(linkedDecisions, linkedConstraints)

    return {
      requirementId: req.id,
      linkedDecisions,
      linkedConstraints,
      coverage,
    }
  })

  // §BUG-06-A — "untracedRequirements" is the canonical name (requirements
  // with no linked decision/constraint). Distinct from analyze(scope)
  // "orphan" (structural: no parent edge). The deprecated `orphanRequirements`
  // field was removed.
  const uncoveredRequirements = matrix.filter((e) => e.coverage === 'none').map((e) => e.requirementId)

  const coveredCount = matrix.filter((e) => e.coverage !== 'none').length

  // Find orphan decisions: not linked to any requirement OR epic
  const linkedDecisionIds = new Set(matrix.flatMap((e) => e.linkedDecisions))
  const epicTypes = new Set(['epic'])
  const orphanDecisions = decisions
    .filter((d) => {
      if (linkedDecisionIds.has(d.id)) return false
      // Decision linked to an epic counts as covered (partial)
      const linkedEpics = findLinked(doc, d.id, epicTypes)
      return linkedEpics.length === 0
    })
    .map((d) => d.id)

  // Decisions linked to epics (but not requirements) also count as linked
  const epicLinkedDecisionCount = decisions.filter(
    (d) => !linkedDecisionIds.has(d.id) && findLinked(doc, d.id, epicTypes).length > 0,
  ).length

  // Include orphan decisions in coverage calculation
  const linkedDecisionCount = linkedDecisionIds.size + epicLinkedDecisionCount
  const totalItems = requirements.length + decisions.length
  const linkedItems = coveredCount + linkedDecisionCount
  const coverageRate = totalItems > 0 ? Math.round((linkedItems / totalItems) * 10000) / 100 : 0

  log.info('traceability-matrix', { requirements: requirements.length, coverageRate })

  // Bug #009: warn when no requirement nodes exist but graph has other nodes
  const warning =
    requirements.length === 0 && doc.nodes.length > 0
      ? 'No requirement nodes found — traceability cannot be evaluated'
      : undefined

  return {
    matrix,
    coverageRate,
    uncoveredRequirements,
    untracedRequirements: uncoveredRequirements,
    traceabilityWarning: uncoveredRequirements.length,
    orphanDecisions,
    warning,
  }
}

const TASK_TYPES = new Set(['task', 'subtask'])

/**
 * A task tem evidência de teste? Duas fontes valem, e a segunda é a que o
 * projeto realmente produz.
 *
 * PORQUÊ (node_405ea88ef587): exigir só a aresta `tests` deixava 77 tasks
 * entregues como `chain: partial` — o grafo real tem 6 arestas dessas, porque
 * nada no fluxo (`agf done`, DoD, `phantom_done`) as cria. O que o fluxo
 * escreve é `testFiles`. Ler apenas a aresta era ler um sinal sem produtor.
 *
 * A declaração sozinha NÃO basta: o arquivo precisa existir no disco. Aceitar
 * um caminho declarado e ausente foi exatamente como o `verify-ac` passou a
 * aprovar tarefas não implementadas (node_2b9edaf0e59d) — declaração é
 * intenção, arquivo é prova. Reusa o mesmo `FileExistsPort` da triangulação
 * física, injetável para manter a função determinística e testável.
 */
function hasTestEvidence(doc: GraphDocument, taskId: string, fileExists: FileExistsPort): boolean {
  const byEdge = doc.edges.some((e) => e.relationType === 'tests' && (e.from === taskId || e.to === taskId))
  if (byEdge) return true

  const declared = doc.nodes.find((n) => n.id === taskId)?.testFiles ?? []
  return declared.length > 0 && missingFiles(declared, fileExists).length === 0
}

export type ChainCoverage = 'full' | 'partial' | 'none'

export interface FullChainEntry {
  requirementId: string
  /** Tasks linked to the requirement (implements/derived_from/parent_of…). */
  linkedTasks: string[]
  /** Of those, the ones with test evidence (a `tests` edge OR testFiles on disk). */
  testedTasks: string[]
  /** full = ≥1 task AND ≥1 tested; partial = task(s) but none tested; none = no task. */
  chain: ChainCoverage
}

export interface FullChainReport {
  entries: FullChainEntry[]
  /** % of requirements with a `full` chain. */
  chainCoverageRate: number
  brokenRequirements: string[]
  warning?: string
}

/**
 * Full-chain traceability: requirement → task → test. A requirement is `full`
 * only if it reaches ≥1 implementing task AND ≥1 of those tasks has a `tests`
 * edge. Deterministic, zero-token. Complements {@link buildTraceabilityMatrix}
 * (which covers requirement → decision → constraint).
 */
export function buildFullChainTraceability(
  doc: GraphDocument,
  fileExists: FileExistsPort = (p) => existsSync(p),
): FullChainReport {
  // Um requisito cujos filhos são requisitos é um AGRUPAMENTO, não uma folha:
  // PRDs importados trazem o cabeçalho de seção ("Requisitos") como node do
  // tipo requirement, e cobrar "a task que implementa o cabeçalho" é cobrar
  // algo que não existe. As folhas dentro dele seguem sendo avaliadas uma a
  // uma — o que se remove é a cobrança impossível, não o sinal.
  // Agrupa quem tem filho que NAO implementa: outro requisito (cabecalho de
  // secao de PRD) ou um epico (o PRD inteiro importado como node). A fronteira
  // e o tipo do filho — task filha e implementacao, e ai o requisito segue
  // cobravel; requisito ou epico filho e decomposicao, e a cobranca desce.
  const GROUPING_CHILD_TYPES = new Set(['requirement', 'epic'])
  const groupingIds = new Set(
    doc.nodes.filter((n) => GROUPING_CHILD_TYPES.has(n.type) && n.parentId).map((n) => n.parentId as string),
  )
  const requirements = doc.nodes.filter((n) => n.type === 'requirement' && !groupingIds.has(n.id))
  const entries: FullChainEntry[] = requirements.map((req) => {
    const linkedTasks = findLinked(doc, req.id, TASK_TYPES)
    const testedTasks = linkedTasks.filter((t) => hasTestEvidence(doc, t, fileExists))
    const chain: ChainCoverage = linkedTasks.length === 0 ? 'none' : testedTasks.length > 0 ? 'full' : 'partial'
    return { requirementId: req.id, linkedTasks, testedTasks, chain }
  })
  const fullCount = entries.filter((e) => e.chain === 'full').length
  const chainCoverageRate = entries.length > 0 ? Math.round((fullCount / entries.length) * 10000) / 100 : 0
  const brokenRequirements = entries.filter((e) => e.chain !== 'full').map((e) => e.requirementId)
  const warning =
    requirements.length === 0 && doc.nodes.length > 0
      ? 'No requirement nodes found — full-chain traceability cannot be evaluated'
      : undefined
  return { entries, chainCoverageRate, brokenRequirements, warning }
}
