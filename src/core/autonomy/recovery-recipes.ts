/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 UltraWorkers and Claw Code contributors (claw-code)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from claw-code (https://github.com/ultraworkers/claw-code), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * task-recovery-recipes — Deterministic failure recovery engine.
 *
 * Encodes failure scenarios with recovery steps and escalation policies.
 * No LLM calls — pure deterministic diagnosis.
 */

import type { RecoveryLedger } from '../schemas/recovery-ledger.schema.js'

export type FailureKind =
  | 'llm_timeout'
  | 'llm_auth_error'
  | 'mcp_handshake_failure'
  | 'sandbox_crash'
  | 'provider_failure'
  | 'plugin_partial_startup'
  | 'unknown_failure'

export type EscalationPolicy = 'AlertHuman' | 'LogAndContinue' | 'Abort'

export interface FailureSignal {
  kind: FailureKind
  message: string
}

export interface RecoveryRecipe {
  kind: FailureKind
  retryable: boolean
  maxRetries: number
  backoffBaseMs: number
  escalation: EscalationPolicy
  diagnostic: string
  action: string
}

export interface RecipeOutcome {
  shouldRetry: boolean
  escalation: EscalationPolicy
  attemptsMade: number
}

const RECIPES: Record<FailureKind, Omit<RecoveryRecipe, 'kind'>> = {
  llm_timeout: {
    retryable: true,
    maxRetries: 3,
    backoffBaseMs: 2000,
    escalation: 'LogAndContinue',
    diagnostic: 'LLM request timed out',
    action: 'Retry with exponential backoff. Consider switching to a lighter model for this turn.',
  },
  llm_auth_error: {
    retryable: false,
    maxRetries: 0,
    backoffBaseMs: 0,
    escalation: 'AlertHuman',
    diagnostic: 'LLM authentication failed (invalid API key or expired token)',
    action: 'Check API key, re-authenticate, and retry.',
  },
  mcp_handshake_failure: {
    retryable: true,
    maxRetries: 2,
    backoffBaseMs: 1000,
    escalation: 'LogAndContinue',
    diagnostic: 'MCP server handshake failed',
    action: 'Restart the MCP bridge and retry handshake.',
  },
  sandbox_crash: {
    retryable: true,
    maxRetries: 2,
    backoffBaseMs: 500,
    escalation: 'Abort',
    diagnostic: 'Sandbox container crashed or exited abnormally',
    action: 'Recreate sandbox environment and retry the operation.',
  },
  provider_failure: {
    retryable: true,
    maxRetries: 3,
    backoffBaseMs: 1500,
    escalation: 'LogAndContinue',
    diagnostic: 'LLM provider returned a server error',
    action: 'Retry with failover to next provider in chain.',
  },
  plugin_partial_startup: {
    retryable: true,
    maxRetries: 1,
    backoffBaseMs: 500,
    escalation: 'LogAndContinue',
    diagnostic: 'Some plugins failed to start',
    action: 'Restart failed plugins individually.',
  },
  unknown_failure: {
    retryable: false,
    maxRetries: 0,
    backoffBaseMs: 0,
    escalation: 'AlertHuman',
    diagnostic: 'Unclassified failure — no matching recipe',
    action: 'Surface the error to the human operator for investigation.',
  },
}

export class RecoveryRecipeEngine {
  private attempts = new Map<FailureKind, number>()
  private ledger: RecoveryLedger | null

  constructor(ledger?: RecoveryLedger) {
    this.ledger = ledger ?? null
    if (this.ledger) {
      this.loadFromLedger()
    }
  }

  private loadFromLedger(): void {
    if (!this.ledger) return
    const allKinds = [
      'llm_timeout',
      'llm_auth_error',
      'mcp_handshake_failure',
      'sandbox_crash',
      'provider_failure',
      'plugin_partial_startup',
    ] as FailureKind[]
    for (const kind of allKinds) {
      const count = this.ledger.count(kind)
      if (count > 0) {
        this.attempts.set(kind, count)
      }
    }
  }

  diagnose(signal: FailureSignal): RecoveryRecipe {
    const recipe = RECIPES[signal.kind]
    return { kind: signal.kind, ...recipe }
  }

  recordAttempt(recipe: RecoveryRecipe, signal: FailureSignal): RecipeOutcome {
    const current = this.attempts.get(recipe.kind) ?? 0
    const next = current + 1
    this.attempts.set(recipe.kind, next)

    if (this.ledger) {
      this.ledger.record({
        errorKind: recipe.kind,
        operation: 'gateway.generate',
        target: signal.message,
        retryable: recipe.retryable,
        escalation: recipe.escalation,
      })
    }

    const shouldRetry = recipe.retryable && next <= recipe.maxRetries
    return {
      shouldRetry,
      escalation: shouldRetry ? 'LogAndContinue' : recipe.escalation,
      attemptsMade: next,
    }
  }

  reset(kind?: FailureKind): void {
    if (kind) {
      this.attempts.delete(kind)
    } else {
      this.attempts.clear()
    }
  }
}
