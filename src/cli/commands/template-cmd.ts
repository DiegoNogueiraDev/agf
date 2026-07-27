/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { instantiateTemplate, listTemplates, type TaskTemplate } from '../../core/templates/template-engine.js'
import {
  createTaskTemplate,
  listTaskTemplates,
  getTaskTemplateByName,
  deleteTaskTemplate,
} from '../../core/skills/template-store.js'
import { TaskTemplateInputSchema } from '../../schemas/skill.schema.js'
import { openStoreOrFail } from '../open-store.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { ValidationError, getErrorMessage } from '../../core/utils/errors.js'

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

  const registry = new Command('registry').description(
    'Templates de task persistidos (SQLite, project-scoped) — reuso entre decomposições',
  )

  registry
    .command('list')
    .description('Lista os templates persistidos do projeto ativo')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('template.registry.list')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const project = store.getActiveProject()
        if (!project) {
          out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo.')
          return
        }
        const templates = listTaskTemplates(store.getDb(), project.id)
        out.ok({ templates, count: templates.length })
      } finally {
        store.close()
      }
    })

  registry
    .command('save')
    .description('Persiste um novo template de task reutilizável (subtasks via JSON)')
    .requiredOption('--name <nome>', 'Nome único do template (dentro do projeto)')
    .requiredOption('--description <texto>', 'Descrição do template')
    .requiredOption('--subtasks <json>', 'Array JSON de subtasks (ex: \'[{"title":"Write tests"}]\')')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { name: string; description: string; subtasks: string; dir: string }) => {
      const out = createCliOutput('template.registry.save')
      let parsedSubtasks: unknown
      try {
        parsedSubtasks = JSON.parse(opts.subtasks)
      } catch (err) {
        out.err('INVALID_JSON', `--subtasks não é JSON válido: ${getErrorMessage(err)}`)
        return
      }
      const parsed = TaskTemplateInputSchema.safeParse({
        name: opts.name,
        description: opts.description,
        subtasks: parsedSubtasks,
      })
      if (!parsed.success) {
        out.err('VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '))
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const project = store.getActiveProject()
        if (!project) {
          out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo.')
          return
        }
        const template = createTaskTemplate(store.getDb(), project.id, parsed.data)
        out.ok(template)
      } catch (err) {
        out.err(err instanceof ValidationError ? 'VALIDATION_ERROR' : 'SAVE_FAILED', getErrorMessage(err))
      } finally {
        store.close()
      }
    })

  registry
    .command('get <nome>')
    .description('Busca um template persistido pelo nome')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((nome: string, opts: { dir: string }) => {
      const out = createCliOutput('template.registry.get')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const project = store.getActiveProject()
        if (!project) {
          out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo.')
          return
        }
        const template = getTaskTemplateByName(store.getDb(), project.id, nome)
        if (!template) {
          out.err('NOT_FOUND', `Template não encontrado: ${nome}. Use 'template registry list'.`)
          return
        }
        out.ok(template)
      } finally {
        store.close()
      }
    })

  registry
    .command('rm <nome>')
    .description('Remove um template persistido pelo nome')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((nome: string, opts: { dir: string }) => {
      const out = createCliOutput('template.registry.rm')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const project = store.getActiveProject()
        if (!project) {
          out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo.')
          return
        }
        const template = getTaskTemplateByName(store.getDb(), project.id, nome)
        if (!template) {
          out.err('NOT_FOUND', `Template não encontrado: ${nome}. Use 'template registry list'.`)
          return
        }
        deleteTaskTemplate(store.getDb(), project.id, template.id)
        out.ok({ id: template.id, name: template.name })
      } finally {
        store.close()
      }
    })

  cmd.addCommand(registry)

  return cmd
}
