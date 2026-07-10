/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { instantiateTemplate, listTemplates, type TaskTemplate } from '../../core/templates/template-engine.js'
import { openStoreOrFail } from '../open-store.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'template-cmd.ts' })

function templateDefByName(store: SqliteStore, name: string): TaskTemplate | null {
  const entry = listTemplates(store).find((t) => t.name === name)
  if (!entry) return null
  const node = store.getNodeById(entry.nodeId)
  const def = (node?.metadata as Record<string, unknown> | undefined)?.['templateDefinition']
  return def ? (def as TaskTemplate) : null
}

function parseVars(pairs: string[]): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const p of pairs) {
    const i = p.indexOf('=')
    if (i > 0) vars[p.slice(0, i)] = p.slice(i + 1)
  }
  return vars
}

/** Builds the `agf template` CLI command (Commander definition). */
export function templateCommand(): Command {
  log.info('template command registered')
  const cmd = new Command('template').description('Templates de decomposição reutilizáveis (list, apply)')

  cmd
    .command('list', { isDefault: true })
    .description('Lista os templates registrados no grafo')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('template.list')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const templates = listTemplates(store)
        out.ok(templates, { count: templates.length })
      } finally {
        store.close()
      }
    })

  cmd
    .command('apply <name>')
    .description('Instancia um template em nodes+edges (--var k=v, --parent <id>)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--parent <id>', 'Node pai dos itens criados')
    .option('-v, --var <kv>', 'Variável key=value (repetível)', (v: string, acc: string[]) => [...acc, v], [])
    .action((name: string, opts: { dir: string; parent?: string; var: string[] }) => {
      const out = createCliOutput('template.apply')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const def = templateDefByName(store, name)
        if (!def) {
          out.err('NOT_FOUND', `Template desconhecido: ${name}. Use 'template list'.`)
          return
        }
        const result = instantiateTemplate(store, def, parseVars(opts.var), opts.parent)
        out.ok(result)
      } finally {
        store.close()
      }
    })

  return cmd
}
