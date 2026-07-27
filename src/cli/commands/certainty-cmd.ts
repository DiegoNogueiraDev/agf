/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf certainty <id>` — the Delivery Certainty surface (node_19809e400130,
 * épico node_7deb314e81b0). Renders the single "está REALMENTE pronto?" verdict:
 * band + confidence + the 7 pillars (the MEANS), each with source + rationale.
 *
 * Thin wire (DIP): reads the graph, injects `existsSync` as the fileExists port
 * and the soft signals (DoD ready, FPY) from their owning modules, then delegates
 * to the pure composer `computeDeliveryCertainty` (src/core/certainty). No logic
 * here beyond wiring — the verdict rule lives in the tested core.
 */

import { existsSync } from 'node:fs'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import { computeDeliveryCertainty } from '../../core/certainty/delivery-certainty.js'
import { explainCertaintyModel, explainCertainty } from '../../core/certainty/explain-certainty.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { computeFirstPassYield } from '../../core/economy/first-pass-yield.js'

const log = createLogger({ layer: 'cli', source: 'certainty-cmd.ts' })

/** Build the `agf certainty` CLI command. */
export function certaintyCommand(): Command {
  log.info('certainty command registered')
  return new Command('certainty')
    .description('Delivery Certainty — verdict "is it REALLY done?" with the means (pillars) explicit')
    .argument('[nodeId]', 'Graph node ID of the delivery to judge (optional with --explain)')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--explain', 'Explica os MEIOS: o que cada pilar mede, a fonte e por que torna o done confiável', false)
    .action((nodeId: string | undefined, opts: { dir: string; explain?: boolean }) => {
      const out = createCliOutput('certainty')

      // --explain sem id (ou com id inexistente) explica o MODELO genérico —
      // "como o agf decide que algo está pronto?" — sem crashar por ausência
      // de dado. Sem --explain, um id ausente continua sendo erro de uso.
      if (!nodeId) {
        if (opts.explain) {
          out.ok({ model: explainCertaintyModel() })
          return
        }
        out.fail('MISSING_ID', 'Uso: agf certainty <nodeId> [--explain] | agf certainty --explain', {})
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(nodeId)
        if (!node) {
          if (opts.explain) {
            out.ok({ nodeId, found: false, model: explainCertaintyModel() })
            return
          }
          out.fail('NOT_FOUND', `Node ${nodeId} not found in graph`, { nodeId })
          return
        }

        const doc = store.toGraphDocument()
        const dod = safeDodReady(doc, nodeId)
        const firstPass = safeFirstPass(store)

        const certainty = computeDeliveryCertainty(doc, nodeId, {
          fileExists: (p: string) => existsSync(p),
          dodReady: dod,
          firstPass,
        })

        out.ok(opts.explain ? { ...certainty, explain: explainCertainty(certainty) } : certainty)
      } finally {
        store.close()
      }
    })
}

/** DoD readiness as a soft signal — never let a DoD internal error sink the verdict. */
function safeDodReady(doc: Parameters<typeof checkDefinitionOfDone>[0], nodeId: string): boolean | undefined {
  try {
    return checkDefinitionOfDone(doc, nodeId).ready
  } catch (err) {
    log.warn(`DoD read failed for ${nodeId}: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

/** First-Pass Yield as a soft signal — null/absent history stays `na`, never red. */
function safeFirstPass(store: { getDb(): import('better-sqlite3').Database }): number | null | undefined {
  try {
    return computeFirstPassYield(store.getDb()).value
  } catch (err) {
    log.warn(`FPY read failed: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}
