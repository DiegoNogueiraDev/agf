/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { join } from 'node:path'
import { Command } from 'commander'
import { adrCreate, adrList, DEFAULT_ADR_DIR } from '../../core/knowledge/adr-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'adr-cmd.ts' })

function resolveDir(dir: string): string {
  return join(dir, DEFAULT_ADR_DIR)
}

/** Builds the `agf adr` CLI command (Commander definition). */
export function adrCommand(): Command {
  log.info('adr command registered')
  const cmd = new Command('adr').description('Architecture Decision Records (create, list)')

  cmd
    .command('create <title>')
    .description('Cria um ADR numerado em markdown')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .requiredOption('--decision <text>', 'A decisão tomada')
    .requiredOption('--consequences <text>', 'Consequências da decisão')
    .option('--context <text>', 'Contexto/motivação')
    .option('--status <status>', 'Proposed | Accepted | Deprecated | Superseded', 'Accepted')
    .action(
      (
        title: string,
        opts: { dir: string; decision: string; consequences: string; context?: string; status?: string },
      ) => {
        const out = createCliOutput('adr-create')
        const result = adrCreate(
          {
            title,
            decision: opts.decision,
            consequences: opts.consequences,
            context: opts.context,
            status: opts.status as 'Proposed' | 'Accepted' | 'Deprecated' | 'Superseded' | undefined,
          },
          resolveDir(opts.dir),
        )
        out.ok({ number: result.number, title, path: result.path })
      },
    )

  cmd
    .command('list', { isDefault: true })
    .description('Lista os ADRs existentes')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('adr-list')
      const entries = adrList(resolveDir(opts.dir))
      out.ok({ adrs: entries.map((e) => ({ number: e.number, title: e.title, status: e.status })) })
    })

  return cmd
}
