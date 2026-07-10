/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E4.3 — Colony quarantine diagnosis: deterministic remediation routing for isolated nodes.
 * Zero-LLM. No I/O. Pure function over node metadata.
 */

export type SuggestedAction = 'fix_blocker' | 'rewrite_ac' | 'split_task' | 'remove_node'

export interface QuarantineNodeInput {
  id: string
  title: string
  acceptanceCriteria?: string[]
  blocked?: boolean
  xpSize?: string
  failureCount?: number
  lastError?: string
}

export interface QuarantineDiagnosis {
  nodeId: string
  title: string
  failureCount: number
  lastError?: string
  suggestedAction: SuggestedAction
  agfCommands: string[]
}

const OVERSIZED_SIZES = new Set(['L', 'XL'])

function suggestAction(node: QuarantineNodeInput): SuggestedAction {
  if (node.blocked) return 'fix_blocker'
  if (!node.acceptanceCriteria || node.acceptanceCriteria.length === 0) return 'rewrite_ac'
  if (node.xpSize && OVERSIZED_SIZES.has(node.xpSize)) return 'split_task'
  if ((node.failureCount ?? 0) >= 3) return 'remove_node'
  return 'rewrite_ac'
}

function agfCommandsFor(action: SuggestedAction, id: string): string[] {
  switch (action) {
    case 'fix_blocker':
      return [`agf heal --apply`, `agf edge ls --to ${id}`, `agf node status ${id} backlog`]
    case 'rewrite_ac':
      return [
        `agf node update ${id} --ac "GIVEN <context> WHEN <action> THEN <observable outcome>"`,
        `agf node status ${id} backlog`,
      ]
    case 'split_task':
      return [
        `agf decompose`,
        `agf node add --title "<subtask 1>" --type subtask --parent ${id}`,
        `agf node add --title "<subtask 2>" --type subtask --parent ${id}`,
        `agf node status ${id} backlog`,
      ]
    case 'remove_node':
      return [`agf node rm ${id}`]
  }
}

export function diagnoseQuarantinedNode(node: QuarantineNodeInput): QuarantineDiagnosis {
  const action = suggestAction(node)
  return {
    nodeId: node.id,
    title: node.title,
    failureCount: node.failureCount ?? 0,
    ...(node.lastError !== undefined ? { lastError: node.lastError } : {}),
    suggestedAction: action,
    agfCommands: agfCommandsFor(action, node.id),
  }
}
