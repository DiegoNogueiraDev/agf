/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S2.3 — Guardian integration wrappers.
 * wrapWithGuardian wraps any tool handler with Guardian review (policies + LLM).
 */

import type { GuardianReviewerInterface } from './guardian-reviewer.schema.js'
import type { GuardianPolicy } from './guardian-policies.schema.js'
import { matchPolicy, DEFAULT_POLICIES } from './guardian-policies.schema.js'

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>

/** Wraps a tool handler so matching guardian policies review (and may block) calls before they run. */
export function wrapWithGuardian(
  handler: ToolHandler,
  guardian: GuardianReviewerInterface,
  policies: GuardianPolicy[] = DEFAULT_POLICIES,
): ToolHandler {
  return async (args: Record<string, unknown>): Promise<string> => {
    const toolName = guessToolName(args)

    const policyMatch = matchPolicy(toolName, args, policies)
    if (policyMatch?.action === 'deny') {
      return `[GUARDIAN_DENIED] Policy blocked "${toolName}" (risk: ${policyMatch.riskLevel})`
    }
    if (policyMatch?.action === 'ask_user') {
      console.info('guardian:policy:ask_user', toolName, policyMatch.riskLevel)
      return `[GUARDIAN_APPROVAL_REQUIRED] Tool "${toolName}" needs user approval (risk: ${policyMatch.riskLevel})`
    }

    try {
      const verdict = await guardian.review({ toolName, args }, {})

      if (verdict.verdict === 'deny') {
        return `[GUARDIAN_DENIED] ${verdict.reason}`
      }

      if (verdict.verdict === 'ask_user') {
        console.info('guardian:llm:ask_user', toolName, verdict.reason)
        return `[GUARDIAN_APPROVAL_REQUIRED] ${verdict.reason}`
      }

      console.debug('guardian:allow', toolName)
    } catch {
      // guardian review failed; allow the tool to proceed
    }

    return handler(args)
  }
}

function guessToolName(args: Record<string, unknown>): string {
  if (args.command !== undefined) return 'bash'
  if (args.path !== undefined) return 'write'
  if (args.filePath !== undefined) return 'write'
  if (args.query !== undefined) return 'search'
  if (args.pattern !== undefined) return 'grep'
  return 'unknown'
}
