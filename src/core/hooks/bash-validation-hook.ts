/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-bash-validation — E8-T3: Bash validation hook adapter.
 *
 * Bridges `bash-validator.ts` (pure function) into the hook bus.
 * - forbidden → throw (blocks via hook bus error propagation)
 * - destructive → structured log warn, execution continues (advisory)
 * - warn → structured log, execution continues
 * - safe → no-op
 *
 * ADR-0060 applies: this hook is advisory. "destructive" does NOT block.
 * Only "forbidden" blocks (path escape, inline exec, dynamic shell).
 */

import { validateCommand, type ValidationResult } from '../security/bash-validator.js'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'bash-validation-hook.ts' })

export interface BashValidationVerdict {
  readonly blocked: boolean
  readonly risk: ValidationResult['risk']
  readonly reasons: string[]
}

/**
 * Evaluate a shell command string and return a verdict.
 * Pure — no I/O, no side effects; the caller decides what to do with it.
 */
export function evaluateBashCommand(command: string): BashValidationVerdict {
  const result = validateCommand(command)
  return {
    blocked: result.risk === 'forbidden',
    risk: result.risk,
    reasons: result.reasons,
  }
}

/**
 * Enforce the verdict from `evaluateBashCommand`.
 * Throws `McpGraphError` only when `risk === "forbidden"`.
 * Logs structured warnings for destructive and warn levels.
 */
export function enforceBashVerdict(command: string): void {
  const verdict = evaluateBashCommand(command)

  switch (verdict.risk) {
    case 'safe':
      return

    case 'warn':
      log.warn('bash:validation:warn', {
        command: command.slice(0, 80),
        reasons: verdict.reasons.join('; '),
      })
      return

    case 'destructive':
      log.warn('bash:validation:destructive', {
        command: command.slice(0, 80),
        reasons: verdict.reasons.join('; '),
        advisory: 'execution continues per ADR-0060 behavior-first gate',
      })
      return

    case 'forbidden':
      throw new McpGraphError(
        `bash:validation:forbidden — command blocked: ${verdict.reasons.join('; ')} (command: ${command.slice(0, 80)})`,
      )
  }
}

export type { ValidationResult }
