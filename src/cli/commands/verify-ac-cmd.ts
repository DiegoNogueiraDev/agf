/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { verifyAc } from '../../core/analyzer/verify-ac.js'

const log = createLogger({ layer: 'cli', source: 'verify-ac-cmd.ts' })

/** Builds the `agf verify-ac` CLI command (Commander definition). */
export function verifyAcCommand(): Command {
  log.info('verify-ac command registered')
  return new Command('verify-ac')
    .description('Verifica se o AC de um nó já está satisfeito por código existente, antes de implementar do zero')
    .argument('<id>', 'ID do nó')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--test-cmd <cmd>', 'Sobrepõe o comando de teste detectado (mesma convenção de agf done --test-cmd)')
    .action((id: string, opts: { dir: string; testCmd?: string }) => {
      const out = createCliOutput('verify-ac')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        if (!store.getNodeById(id)) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const result = verifyAc(store, id, opts.dir, opts.testCmd)
        out.ok({ id, ...result })
      } finally {
        store.close()
      }
    })
}
