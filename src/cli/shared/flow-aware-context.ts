/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * buildFlowAwareContext — o MESMO caminho flow (λ_flow) que `agf context` usa,
 * extraído para que `agf start` o reuse (node_5e91af9e646d, driver-boundary).
 *
 * FONTE ÚNICA do flow é `applyFlowToCompact` (core/context/flow-compact): quando
 * flow está ON, dilui a vizinhança do grafo por decaimento topológico Φ-governado
 * e devolve o contexto + o bloco flow; quando OFF (default) retorna null e caímos
 * no `buildTaskContext` legado — **byte-idêntico** ao comportamento de hoje.
 * O corte de tokens vira o lever `flow` no ledger (visível em `agf savings`);
 * telemetria NUNCA quebra o hot path (try/catch).
 */

import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { applyFlowToCompact, toFlowEnvelopeBlock } from '../../core/context/flow-compact.js'
import { buildTaskContext } from '../../core/context/compact-context.js'
import { recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'

export interface FlowAwareContext {
  /** O contexto compacto da task (do caminho flow quando ON, senão o legado). */
  context: unknown
  /** Bloco flow do envelope — presente SÓ quando flow está ON. */
  flow?: unknown
}

/**
 * Monta o contexto da task aplicando o caminho flow. Flow OFF ⇒ `{ context }`
 * legado (sem `flow`), idêntico a `buildTaskContext`. Flow ON ⇒ `{ context, flow }`
 * e registra o lever `flow` (surface 'context' — mede compressão de contexto).
 */
export function buildFlowAwareContext(store: SqliteStore, nodeId: string): FlowAwareContext {
  const flow = applyFlowToCompact(store, nodeId)
  if (flow) {
    if (flow.flow.tokensSaved > 0) {
      try {
        recordLeverEvent(store.getDb(), {
          surface: 'context',
          sessionId: `start_${nodeId}`,
          nodeId,
          lever: 'flow',
          tokensBefore: flow.flow.tokensBaseline,
          tokensAfter: flow.flow.tokensActual,
          saved: flow.flow.tokensSaved,
          accepted: true,
          gateOutcome: 'accepted',
          score: flow.flow.phi,
        })
      } catch {
        // telemetria nunca quebra o hot path do contexto
      }
    }
    return { context: flow.context, flow: toFlowEnvelopeBlock(flow) }
  }
  return { context: buildTaskContext(store, nodeId) }
}
