/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TDD Checker — validates TDD adherence and generates test spec suggestions
 * based on acceptance criteria analysis.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import type {
  TddCheckReport,
  TddTaskReport,
  SuggestedTestSpec,
  SuggestedTestType,
  TddHint,
} from '../../schemas/implementer-schema.js'
import { parseAc } from '../analyzer/ac-parser.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tdd-checker.ts' })

const UNIT_KEYWORDS = [
  'retorna',
  'returns',
  'return',
  'status',
  'calcula',
  'calculates',
  'valida',
  'validates',
  'converte',
  'converts',
  'formata',
  'formats',
]

const INTEGRATION_KEYWORDS = [
  'integra',
  'conecta',
  'persiste',
  'salva',
  'saves',
  'persist',
  'database',
  'db',
  'armazena',
  'stores',
  'envia',
  'sends',
  'publica',
  'publishes',
  'sincroniza',
  'syncs',
]

const E2E_KEYWORDS = [
  'navega',
  'navigate',
  'exibe',
  'displays',
  'mostra',
  'shows',
  'clica',
  'clicks',
  'página',
  'page',
  'redireciona',
  'redirects',
  'formulário',
  'form',
  'botão',
  'button',
  'tela',
  'screen',
]

/**
 * Check TDD adherence across tasks in the graph.
 */
export function checkTddAdherence(doc: GraphDocument, nodeId?: string): TddCheckReport {
  const tasks = selectTasks(doc, nodeId)
  const taskReports: TddTaskReport[] = []
  const allSuggested: SuggestedTestSpec[] = []

  for (const node of tasks) {
    const acs = getNodeAcTexts(doc, node.id)
    if (acs.length === 0) continue

    const parsed = acs.map((ac) => parseAc(ac))
    const testableAcs = parsed.filter((p) => p.isTestable).length
    const measurableAcs = parsed.filter((p) => p.isMeasurable).length
    const testabilityScore = acs.length > 0 ? Math.round((testableAcs / acs.length) * 100) : 0

    const suggestedTests: SuggestedTestSpec[] = []
    for (let i = 0; i < acs.length; i++) {
      const ac = acs[i]
      const pVar = parsed[i]
      const specs = generateTestSpecsFromAc(ac, pVar)
      suggestedTests.push(...specs)
    }

    allSuggested.push(...suggestedTests)

    taskReports.push({
      nodeId: node.id,
      title: node.title,
      totalAcs: acs.length,
      testableAcs,
      measurableAcs,
      testabilityScore,
      suggestedTests,
    })
  }

  const tasksAtRisk = taskReports.filter((t) => t.testabilityScore === 0).length
  const overallTestability =
    taskReports.length > 0
      ? Math.round(taskReports.reduce((sum, t) => sum + t.testabilityScore, 0) / taskReports.length)
      : 0

  const summary =
    taskReports.length > 0
      ? `TDD Check: ${taskReports.length} tasks analyzed, ${tasksAtRisk} at risk. Overall testability: ${overallTestability}%. ${allSuggested.length} test specs suggested.`
      : 'Nenhuma task com acceptance criteria encontrada.'

  log.info('tdd-checker', { tasks: taskReports.length, tasksAtRisk, overallTestability })

  return {
    tasks: taskReports,
    overallTestability,
    tasksAtRisk,
    suggestedTestSpecs: allSuggested,
    summary,
  }
}

/**
 * Generate TDD hints for a single node — lightweight version for next tool enrichment.
 */
export function generateTddHints(node: GraphNode, doc?: GraphDocument): TddHint[] {
  const acs = doc ? getNodeAcTexts(doc, node.id) : (node.acceptanceCriteria ?? [])
  if (acs.length === 0) return []

  const hints: TddHint[] = []
  for (const ac of acs) {
    const parsed = parseAc(ac)
    const specs = generateTestSpecsFromAc(ac, parsed)
    hints.push(...specs)
  }
  return hints
}

/**
 * Generate TDD hints from raw AC text strings — works for both inline and child-node sourced.
 */
export function generateTddHintsFromTexts(acTexts: string[]): TddHint[] {
  if (acTexts.length === 0) return []
  const hints: TddHint[] = []
  for (const ac of acTexts) {
    const parsed = parseAc(ac)
    const specs = generateTestSpecsFromAc(ac, parsed)
    hints.push(...specs)
  }
  return hints
}

function selectTasks(doc: GraphDocument, nodeId?: string): GraphNode[] {
  if (nodeId) {
    const node = doc.nodes.find((n) => n.id === nodeId)
    return node ? [node] : []
  }
  // Include tasks that have AC either inline or via child AC nodes
  return doc.nodes.filter((n) => (n.type === 'task' || n.type === 'subtask') && getNodeAcTexts(doc, n.id).length > 0)
}

function generateTestSpecsFromAc(acText: string, parsed: ReturnType<typeof parseAc>): SuggestedTestSpec[] {
  const specs: SuggestedTestSpec[] = []
  const type = inferTestType(acText)

  if (parsed.format === 'gwt' && parsed.steps) {
    const thenSteps = parsed.steps.filter((s) => s.keyword === 'then')
    const whenSteps = parsed.steps.filter((s) => s.keyword === 'when')
    const givenSteps = parsed.steps.filter((s) => s.keyword === 'given')

    if (thenSteps.length > 0) {
      const testName = buildGwtTestName(thenSteps[0].text, whenSteps[0]?.text, givenSteps[0]?.text)
      specs.push({ testName, fromAc: acText, type })
    }
  } else if (parsed.isTestable) {
    const testName = `should ${acText.toLowerCase().slice(0, 80)}`
    specs.push({ testName, fromAc: acText, type })
  }

  return specs
}

function buildGwtTestName(then: string, when?: string, given?: string): string {
  let name = `should ${then.toLowerCase()}`
  if (when) name += ` when ${when.toLowerCase()}`
  if (given) name += ` given ${given.toLowerCase()}`
  return name
}

function inferTestType(text: string): SuggestedTestType {
  const lower = text.toLowerCase()

  if (E2E_KEYWORDS.some((k) => lower.includes(k))) return 'e2e'
  if (INTEGRATION_KEYWORDS.some((k) => lower.includes(k))) return 'integration'
  if (UNIT_KEYWORDS.some((k) => lower.includes(k))) return 'unit'

  return 'unit' // default
}
