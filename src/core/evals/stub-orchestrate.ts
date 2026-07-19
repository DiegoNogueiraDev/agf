/*!
 * stub-orchestrate — deterministic stub LLM token counter for eval tests.
 * Task node_6da365954faf.
 *
 * WHY: Provides a zero-network Orchestrate that records fixed token counts
 * into the injected ledger, making scenario token totals reproducible across
 * runs without touching any real LLM provider.
 *
 * Composes with: scenario-runner.ts (Orchestrate type + RunScenarioDeps).
 */

import type { Orchestrate } from './scenario-runner.js'
import type { DeliveryReport } from '../orchestrator/run-delivery.js'

export interface StubOrchestrateOpts {
  /** Fixed input tokens recorded per stub call (default: 100). */
  inputTokens?: number
  /** Fixed output tokens recorded per stub call (default: 50). */
  outputTokens?: number
  /** Delivery stop reason returned (default: 'done'). */
  stopped?: DeliveryReport['stopped']
}

/**
 * Creates a deterministic Orchestrate stub that records fixed token counts
 * into the injected ledger. Two runs with the same opts always produce the
 * same tokensTotal.
 */
export function makeStubOrchestrate(opts: StubOrchestrateOpts = {}): Orchestrate {
  const inTok = opts.inputTokens ?? 100
  const outTok = opts.outputTokens ?? 50
  const stopped: DeliveryReport['stopped'] = opts.stopped ?? 'done'

  return async (_store, { ledger }): Promise<DeliveryReport> => {
    ledger.record('stub', {
      model: 'stub',
      tokensIn: inTok,
      tokensOut: outTok,
    })
    return { steps: 1, stopped, actions: [] }
  }
}
