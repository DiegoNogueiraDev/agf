/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'

/**
 * `tui` — abre a interface de terminal interativa (Ink). Dashboard read-only do
 * grafo + tokens (M1p); comandos interativos e autopilot ao vivo chegam nos
 * milestones seguintes.
 */
const log = createLogger({ layer: 'cli', source: 'tui-cmd.ts' })

/** Builds the `agf tui` CLI command (Commander definition). */
export function tuiCommand(): Command {
  log.info('tui command registered')
  return new Command('tui')
    .description('Abre a TUI interativa (dashboard do grafo + tokens)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (opts: { dir: string }) => {
      const store = openStoreOrFail(opts.dir)
      try {
        const { launchTui } = await import('../../tui/launch.js')
        await launchTui(store)
      } finally {
        store.close()
      }
    })
}
