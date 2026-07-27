/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { coerceId, errMessage } from '../shared/coerce.js'

const log = createLogger({ layer: 'cli', source: 'snapshot-cmd.ts' })

/** Builds the `agf snapshot` CLI command (Commander definition). */
export function snapshotCommand(): Command {
  log.info('snapshot command registered')
  const cmd = new Command('snapshot').description('Cria/lista/restaura snapshots do grafo (create/list/restore)')

  cmd
    .command('create')
    .description('Cria um snapshot do grafo atual')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('snapshot.create')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const id = store.createSnapshot()
        out.ok({ snapshotId: id })
      } finally {
        store.close()
      }
    })

  cmd
    .command('list')
    .description('Lista snapshots existentes')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('snapshot.list')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const snaps = store.listSnapshots()
        out.ok(snaps, { count: snaps.length })
      } finally {
        store.close()
      }
    })

  cmd
    .command('restore')
    .description('Restaura um snapshot')
    .argument('<id>', 'ID do snapshot')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('snapshot.restore')
      const snapshotId = coerceId(id)
      if (snapshotId === null) {
        out.err('NOT_FOUND', `Snapshot inválido: ${id} (esperado um inteiro não-negativo)`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const r = store.restoreSnapshot(snapshotId)
        out.ok(r)
      } catch (e) {
        out.err('NOT_FOUND', `Snapshot não encontrado: ${snapshotId} (${errMessage(e)})`)
      } finally {
        store.close()
      }
    })

  return cmd
}
