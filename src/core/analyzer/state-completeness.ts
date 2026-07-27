/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * State Completeness Analyzer — validates state machine nodes.
 *
 * Checks:
 * - Metadata has states, transitions, initialState
 * - Dead states (no outgoing transition)
 * - Unreachable states (no incoming transition except initial)
 * - initialState is in states array
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'state-completeness.ts' })

export interface StateCompletenessReport {
  machines: Array<{ nodeId: string; title: string; valid: boolean; issues: string[] }>
  totalMachines: number
  validCount: number
}

interface Transition {
  from: string
  to: string
  [key: string]: unknown
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function getTransitions(value: unknown): Transition[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (v): v is Transition =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as Transition).from === 'string' &&
      typeof (v as Transition).to === 'string',
  )
}

/** analyzeStateCompleteness —  */
export function analyzeStateCompleteness(doc: GraphDocument): StateCompletenessReport {
  const machineNodes = doc.nodes.filter((n) => n.type === 'state_machine')

  const machines: StateCompletenessReport['machines'] = []
  let validCount = 0

  for (const node of machineNodes) {
    const issues: string[] = []

    const states = getStringArray(node.metadata?.states)
    const transitions = getTransitions(node.metadata?.transitions)
    const initialState = node.metadata?.initialState as string | undefined

    if (!node.metadata?.states) {
      issues.push("Missing 'states' in metadata")
    }
    if (!node.metadata?.transitions) {
      issues.push("Missing 'transitions' in metadata")
    }
    if (!node.metadata?.initialState) {
      issues.push("Missing 'initialState' in metadata")
    }

    // Only do deeper checks if base metadata exists
    if (states.length > 0 && transitions.length > 0 && initialState) {
      const statesSet = new Set(states)

      // Validate initialState is in states
      if (!statesSet.has(initialState)) {
        issues.push(`initialState '${initialState}' is not in the states array`)
      }

      // Find dead states (no outgoing transition)
      const statesWithOutgoing = new Set(transitions.map((t) => t.from))
      for (const state of states) {
        if (!statesWithOutgoing.has(state)) {
          issues.push(`Dead state '${state}': no outgoing transition`)
        }
      }

      // Find unreachable states (no incoming transition, except initial)
      const statesWithIncoming = new Set(transitions.map((t) => t.to))
      for (const state of states) {
        if (state !== initialState && !statesWithIncoming.has(state)) {
          issues.push(`Unreachable state '${state}': no incoming transition`)
        }
      }
    }

    const valid = issues.length === 0
    if (valid) validCount++

    machines.push({ nodeId: node.id, title: node.title, valid, issues })
  }

  log.debug('analyzer:state-completeness', {
    totalMachines: machineNodes.length,
    validCount,
  })

  return {
    machines,
    totalMachines: machineNodes.length,
    validCount,
  }
}
