/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Economy Simulation Analyzer — simulates gold inflow vs outflow to detect
 * potential inflation BEFORE implementation.
 *
 * Extracts economy flows from formula nodes (type "formula") and estimates
 * rates from node descriptions when formulas are unavailable.
 * Uses regex-based number extraction — no eval(), no new Function(), no mathjs.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'economy-simulator.ts' })

export interface EconomySimulationParams {
  playerCount: number
  avgSessionHours: number
  avgLevel: number
}

export interface EconomyFlow {
  name: string
  type: 'inflow' | 'outflow'
  ratePerPlayerPerHour: number
  source: string // nodeId or "estimated"
}

export interface EconomySimulationReport {
  params: EconomySimulationParams
  flows: EconomyFlow[]
  totalInflowPerDay: number
  totalOutflowPerDay: number
  netFlowPerDay: number
  inflationRisk: 'none' | 'low' | 'medium' | 'high' | 'critical'
  inflationRatePercent: number
  suggestions: string[]
  warnings: string[]
}

const ECONOMY_KEYWORDS = ['gold', 'currency', 'cost', 'price', 'reward', 'drop', 'income', 'sink', 'tax', 'fee']

const INFLOW_PATTERN = /\b(reward|drop|income|earn|loot|quest\s*reward)\b/
const OUTFLOW_PATTERN = /\b(cost|price|sink|tax|fee|buy|repair|craft)\b/

/** simulateEconomy —  */
export function simulateEconomy(doc: GraphDocument, params: EconomySimulationParams): EconomySimulationReport {
  const { playerCount, avgSessionHours, avgLevel } = params
  const flows: EconomyFlow[] = []
  const warnings: string[] = []

  const formulaNodes = doc.nodes.filter((n) => n.type === 'formula' && matchesEconomyKeywords(n))

  // Extract flows from formula metadata
  for (const node of formulaNodes) {
    const meta = node.metadata as Record<string, unknown> | undefined
    if (!meta) continue

    const expression = (meta.expression as string) ?? ''
    const text = buildSearchText(node)
    const type = classifyFlowType(text)
    const rate = extractNumericRate(expression, meta, avgLevel)

    if (rate > 0) {
      flows.push({
        name: node.title,
        type,
        ratePerPlayerPerHour: rate,
        source: node.id,
      })
    } else {
      warnings.push(`Formula "${node.title}" — could not extract numeric rate from expression: ${expression || 'none'}`)
    }
  }

  // Fallback: estimate flows from economy-related node descriptions
  if (flows.length === 0) {
    const economyNodes = doc.nodes.filter((n) => matchesEconomyKeywords(n))

    for (const node of economyNodes) {
      const text = buildSearchText(node)
      const isInflow = INFLOW_PATTERN.test(text)
      const isOutflow = OUTFLOW_PATTERN.test(text)

      if (isInflow || isOutflow) {
        const numbers = text.match(/\d[\d.]*/g)
        const rate = numbers ? parseFloat(numbers[0]) : 100

        flows.push({
          name: node.title,
          type: isInflow ? 'inflow' : 'outflow',
          ratePerPlayerPerHour: rate / 10,
          source: 'estimated',
        })
      }
    }

    if (flows.length > 0) {
      warnings.push('No formula nodes found — using estimated rates from node descriptions')
    }
  }

  // Calculate totals
  const hoursPerDay = avgSessionHours
  const totalInflowPerDay = flows
    .filter((f) => f.type === 'inflow')
    .reduce((sum, f) => sum + f.ratePerPlayerPerHour * playerCount * hoursPerDay, 0)

  const totalOutflowPerDay = flows
    .filter((f) => f.type === 'outflow')
    .reduce((sum, f) => sum + f.ratePerPlayerPerHour * playerCount * hoursPerDay, 0)

  const netFlowPerDay = totalInflowPerDay - totalOutflowPerDay

  // Calculate inflation risk
  const inflationRatePercent =
    totalOutflowPerDay > 0 ? Math.round((netFlowPerDay / totalOutflowPerDay) * 100) : netFlowPerDay > 0 ? 100 : 0

  const inflationRisk = classifyInflationRisk(inflationRatePercent)

  // Generate suggestions
  const suggestions = buildSuggestions(inflationRisk, inflationRatePercent, flows)

  log.info('economy-simulator', {
    inflow: Math.round(totalInflowPerDay),
    outflow: Math.round(totalOutflowPerDay),
    net: Math.round(netFlowPerDay),
    risk: inflationRisk,
  })

  return {
    params,
    flows,
    totalInflowPerDay: Math.round(totalInflowPerDay),
    totalOutflowPerDay: Math.round(totalOutflowPerDay),
    netFlowPerDay: Math.round(netFlowPerDay),
    inflationRisk,
    inflationRatePercent,
    suggestions,
    warnings,
  }
}

function matchesEconomyKeywords(node: GraphNode): boolean {
  const text = buildSearchText(node)
  return ECONOMY_KEYWORDS.some((kw) => text.includes(kw))
}

function buildSearchText(node: GraphNode): string {
  return (node.title + ' ' + (node.description ?? '')).toLowerCase()
}

function classifyFlowType(text: string): 'inflow' | 'outflow' {
  const isInflow = INFLOW_PATTERN.test(text)
  const isOutflow = OUTFLOW_PATTERN.test(text)
  if (isOutflow && !isInflow) return 'outflow'
  return 'inflow'
}

/**
 * Extract a numeric rate from formula expression or metadata.
 * Handles simple patterns like "100 * level", "base + modifier", etc.
 * No eval() — regex-based extraction only.
 */
function extractNumericRate(expression: string, meta: Record<string, unknown>, avgLevel: number): number {
  // Try metadata.rate directly
  if (typeof meta.rate === 'number') return meta.rate

  // Try to find a number in the expression
  const numbers = expression.match(/\d[\d.]*/g)
  if (!numbers || numbers.length === 0) return 0

  // Heuristic: take the first number, multiply by level factor if "level" is mentioned
  let rate = parseFloat(numbers[0])
  if (expression.toLowerCase().includes('level')) {
    rate = rate * (avgLevel / 50)
  }

  return rate
}

function classifyInflationRisk(inflationRatePercent: number): EconomySimulationReport['inflationRisk'] {
  if (inflationRatePercent > 20) return 'critical'
  if (inflationRatePercent > 10) return 'high'
  if (inflationRatePercent > 5) return 'medium'
  if (inflationRatePercent > 0) return 'low'
  return 'none'
}

function buildSuggestions(
  inflationRisk: EconomySimulationReport['inflationRisk'],
  inflationRatePercent: number,
  flows: EconomyFlow[],
): string[] {
  const suggestions: string[] = []

  if (inflationRisk === 'critical' || inflationRisk === 'high') {
    suggestions.push(
      `Net gold inflow is ${inflationRatePercent}% above outflow — consider reducing drop rates or increasing sink costs`,
    )

    const topInflow = flows
      .filter((f) => f.type === 'inflow')
      .sort((a, b) => b.ratePerPlayerPerHour - a.ratePerPlayerPerHour)[0]

    if (topInflow) {
      suggestions.push(
        `Highest inflow source: "${topInflow.name}" (${topInflow.ratePerPlayerPerHour}/player/hour) — consider reducing by ${Math.round(inflationRatePercent / 2)}%`,
      )
    }
  }

  if (flows.filter((f) => f.type === 'outflow').length === 0 && flows.length > 0) {
    suggestions.push('No gold sinks detected — add repair costs, taxes, or crafting fees')
  }

  return suggestions
}
