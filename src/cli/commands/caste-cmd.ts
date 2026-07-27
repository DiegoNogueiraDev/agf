/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E1.1 — `agf caste` command.
 * Zero-LLM. Lists colony caste taxonomy.
 */

import { Command } from 'commander'
import { listCastes, getCasteDefinition, type CasteKind } from '../../core/colony/caste-taxonomy.js'
import { createCliOutput } from '../shared/cli-output.js'

/** Builds the `agf caste` CLI command (Commander definition). */
export function casteCommand(): Command {
  const cmd = new Command('caste')
  cmd.description('Colony caste taxonomy and task routing')

  cmd
    .command('list')
    .description('List all 4 castes with model_tier, max_complexity, and task_types')
    .action(() => {
      const out = createCliOutput('caste.list')
      out.ok({ castes: listCastes() })
    })

  cmd
    .command('show <kind>')
    .description('Show definition for a specific caste (minima|pequena|media|soldado)')
    .action((kind: string) => {
      const out = createCliOutput('caste.show')
      const validKinds: CasteKind[] = ['minima', 'pequena', 'media', 'soldado']
      if (!validKinds.includes(kind as CasteKind)) {
        out.err('INVALID_CASTE', `Unknown caste: ${kind}. Valid: ${validKinds.join(', ')}`)
        return
      }
      const def = getCasteDefinition(kind as CasteKind)
      out.ok({ caste: kind, ...def })
    })

  return cmd
}
