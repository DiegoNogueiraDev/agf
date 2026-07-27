/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import {
  listPrinciples,
  getPrinciple,
  principlesByCategory,
  listCategories,
  type PrincipleCategory,
} from '../../core/doctrine/principles.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'principles-cmd.ts' })

const CATEGORY_LABEL: Record<PrincipleCategory, string> = {
  promise: 'Promessa',
  tdd: 'TDD',
  'clean-code': 'Clean Code',
  xp: 'XP',
  lean: 'Lean / TOC',
  flow: 'Flow / economia de token',
}

/** Builds the `agf principles` CLI command (Commander definition). */
export function principlesCommand(): Command {
  log.info('principles command registered')
  const cmd = new Command('principles').description(
    'O credo de engenharia da CLI: Clean Code · XP · TDD · Lean + λ_flow (economia de token)',
  )

  cmd
    .command('list', { isDefault: true })
    .description('Lista os princípios agrupados por categoria')
    .option('-c, --category <cat>', 'Filtra por categoria (promise|tdd|clean-code|xp|lean|flow)')
    .action((opts: { category?: string }) => {
      const out = createCliOutput('principles-list')
      const cats = opts.category ? [opts.category as PrincipleCategory] : listCategories()
      const grouped: Record<string, { title: string; statement: string }[]> = {}
      for (const cat of cats) {
        const items = principlesByCategory(cat)
        if (items.length > 0) {
          grouped[CATEGORY_LABEL[cat] ?? cat] = items.map((p) => ({ title: p.title, statement: p.statement }))
        }
      }
      out.ok({ categories: grouped, total: listPrinciples().length, hint: "use 'principles show <id>' para detalhes." })
    })

  cmd
    .command('show <id>')
    .description('Detalha um princípio (título, categoria, statement, rationale)')
    .action((id: string) => {
      const out = createCliOutput('principles-show')
      const p = getPrinciple(id)
      if (!p) {
        out.err('NOT_FOUND', `Princípio desconhecido: ${id}. Tente 'principles list'.`)
        return
      }
      out.ok({
        id: p.id,
        title: p.title,
        category: CATEGORY_LABEL[p.category] ?? p.category,
        statement: p.statement,
        rationale: p.rationale,
      })
    })

  return cmd
}
