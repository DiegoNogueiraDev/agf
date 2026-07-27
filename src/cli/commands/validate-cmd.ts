/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires the dormant validator/validation.ts (ValidationInputSchema) into a
 * dedicated `agf validate` surface — report-only dispatch across the
 * validator/ checkers, keyed by --action. Never mutates the graph.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { validateValidationInput } from '../../core/validator/validation.js'
import { checkValidationReadiness } from '../../core/validator/definition-of-ready.js'
import { buildValidatorReport } from '../../core/validator/index.js'
import { checkStatusFlow } from '../../core/validator/status-flow-checker.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { lintAcsBatch } from '../../core/analyzer/ac-linter.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'validate-cmd.ts' })

/** Builds the `agf validate` CLI command (Commander definition). */
export function validateCommand(): Command {
  log.info('validate command registered')
  return new Command('validate')
    .description('Report-only validator checks (ac/dor/dod/integrity/flow), dispatched by --action')
    .option('--action <action>', 'ac | dor | dod | integrity | flow (default: integrity)')
    .option('--node <id>', 'Node ID (required for --action ac|dod)')
    .option('--strict', 'Reserved for stricter thresholds in future checkers', false)
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { action?: string; node?: string; strict?: boolean; dir: string }) => {
      const out = createCliOutput('validate')

      let input: ReturnType<typeof validateValidationInput>
      try {
        input = validateValidationInput({ action: opts.action, nodeId: opts.node, strict: opts.strict })
      } catch (err) {
        out.err('INVALID_INPUT', getErrorMessage(err))
        return
      }

      const action = input.action ?? 'integrity'
      if ((action === 'ac' || action === 'dod') && !input.nodeId) {
        out.err('NODE_ID_REQUIRED', `--node é obrigatório para --action ${action}`)
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const doc = store.toGraphDocument()

        switch (action) {
          case 'dor':
            out.ok({ action, dor: checkValidationReadiness(doc) })
            return
          case 'flow':
            out.ok({ action, flow: checkStatusFlow(doc) })
            return
          case 'integrity':
            out.ok({ action, validator: buildValidatorReport(doc) })
            return
          case 'ac': {
            const node = doc.nodes.find((n) => n.id === input.nodeId)
            if (!node) {
              out.err('NOT_FOUND', `Node "${input.nodeId}" não encontrado no grafo`)
              return
            }
            const acs = node.acceptanceCriteria ?? []
            out.ok({ action, nodeId: input.nodeId, ac: lintAcsBatch(acs) })
            return
          }
          case 'dod': {
            const dod = checkDefinitionOfDone(doc, input.nodeId as string, { db: store.getDb(), dir: opts.dir })
            out.ok({ action, nodeId: input.nodeId, dod })
            return
          }
        }
      } finally {
        store.close()
      }
    })
}
