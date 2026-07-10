/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { resolve } from 'node:path'
import { openStoreOrFail } from '../open-store.js'
import { generateId } from '../../core/utils/id.js'
import { StructuredLogger } from '../../core/errors/structured-logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { coercePriority } from '../shared/coerce.js'
import { normalizeTags } from '../../core/graph/normalize-tags.js'
import { normalizeList } from '../../core/utils/normalize-list.js'
import { missingFiles } from '../../core/gaps/detect-phantom-done.js'
import { makeFileExists } from '../shared/file-exists-port.js'
import { writeDecisionRationale, readDecisionRationale } from '../../core/decisions/rationale-store.js'
import { detectRunOnAc } from '../../core/analyzer/ac-run-on-detector.js'
import { RealTaskLifecycleService } from '../../core/services/task-lifecycle.js'
import { isHonestDoneTransition } from '../../core/planner/external-blocker.js'
import { checkEpicPromotion, autoPromoteEpic, cascadeDownOnDone } from '../../core/utils/epic-promotion.js'
import { ValidationError } from '../../core/utils/errors.js'
import { applySearchReplace } from '../../core/economy/diff-edit.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { GraphNode, NodeStatus, NodeType } from '../../core/graph/graph-types.js'

const log = new StructuredLogger('node-cmd.ts', 'cli')

export const VALID_STATUS_TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  backlog: ['ready', 'in_progress', 'blocked', 'quarantined'],
  ready: ['in_progress', 'blocked', 'backlog'],
  in_progress: ['done', 'blocked', 'ready', 'quarantined'],
  blocked: ['ready', 'in_progress', 'backlog', 'quarantined'],
  done: ['in_progress'],
  quarantined: ['backlog'],
  satisfied: [],
}

export function validateStatusTransition(from: NodeStatus, to: NodeStatus): string | null {
  if (from === to) return null
  const allowed = VALID_STATUS_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    return `Transição inválida: ${from} → ${to}. Permitidas: ${allowed.join(', ') || '(nenhuma)'}`
  }
  return null
}

function withStore<T>(dir: string, fn: (store: SqliteStore) => T): T {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    return fn(store)
  } finally {
    store.close()
  }
}

/** Builds the `agf node` CLI command (Commander definition). */
export function nodeCommand(): Command {
  log.info('node command registered')
  const cmd = new Command('node').description('CRUD e mutações de nós do grafo (add/show/update/status/move/clone/rm)')

  cmd
    .command('add')
    .description('Cria um novo nó no grafo')
    .requiredOption('--title <title>', 'Título do nó')
    .option('--type <type>', 'Tipo do nó (task, epic, requirement, …)', 'task')
    .option('--description <desc>', 'Descrição', '')
    .option('--parent <id>', 'ID do nó pai')
    .option('--status <status>', 'Status inicial', 'backlog')
    .option('--priority <n>', 'Prioridade (1-5)', '3')
    .option('--ac <criterion...>', 'Critério de aceitação (repetível)')
    .option('--tags <tag...>', 'Tags do nó (repetível ou separadas por vírgula) — viram trilhas ACO')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (opts: {
        title: string
        type: string
        description: string
        parent?: string
        status: string
        priority: string
        ac?: string[]
        tags?: string[]
        dir: string
      }) => {
        const out = createCliOutput('node.add')
        const priority = coercePriority(opts.priority)
        if (!priority.ok) {
          out.err('INVALID_INPUT', `Prioridade inválida: ${opts.priority} (use um inteiro de 1 a 5)`)
          return
        }
        withStore(opts.dir, (store) => {
          const ts = new Date().toISOString()
          const node: GraphNode = {
            id: generateId('node'),
            type: opts.type as NodeType,
            title: opts.title,
            description: opts.description,
            status: opts.status as NodeStatus,
            priority: priority.value as GraphNode['priority'],
            xpSize: 'S',
            parentId: opts.parent ?? null,
            acceptanceCriteria: opts.ac ?? [],
            tags: normalizeTags(opts.tags),
            createdAt: ts,
            updatedAt: ts,
            metadata: { source: 'cli' },
          }
          store.insertNode(node)
          if (opts.parent) {
            store.insertEdge({
              id: generateId('edge'),
              from: opts.parent,
              to: node.id,
              relationType: 'parent_of',
              createdAt: ts,
            })
          }
          out.ok(
            { id: node.id, type: node.type, status: node.status, title: node.title, tags: node.tags },
            { dir: resolve(opts.dir) },
          )
        })
      },
    )

  cmd
    .command('show')
    .description('Mostra um nó e suas arestas')
    .argument('<id>', 'ID do nó')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('node.show')
      withStore(opts.dir, (store) => {
        const node = store.getNodeById(id)
        if (!node) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const outEdges = store.getEdgesFrom(id)
        const incEdges = store.getEdgesTo(id)
        out.ok({ node, outEdges, incEdges })
      })
    })

  cmd
    .command('update')
    .description('Atualiza campos de um nó (exceto status — use `node status`)')
    .argument('<id>', 'ID do nó')
    .option('--title <title>', 'Novo título')
    .option('--description <desc>', 'Nova descrição')
    .option('--priority <n>', 'Nova prioridade')
    .option('--type <type>', 'Novo tipo')
    .option('--tags <tag...>', 'Substitui as tags do nó (repetível ou separadas por vírgula) — trilhas ACO')
    .option(
      '--ac <criterion...>',
      'Substitui os ACs do nó (repetível — múltiplos ACs discretos pontuam mais no INVEST E/T)',
    )
    .option(
      '--test-files <files...>',
      'Substitui a lista testFiles do nó (corrige referências fantasma — habilita remediar phantom_done)',
    )
    .option(
      '--implementation-files <files...>',
      'Substitui a lista implementationFiles (eixo CÓDIGO da triangulação — phantom_done cruza com o disco)',
    )
    .option(
      '--patch-search <text>',
      'Trecho exato a localizar na descrição atual (usa diff-edit — evita reenviar a descrição inteira; requer --patch-replace)',
    )
    .option('--patch-replace <text>', 'Texto de substituição para --patch-search')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (
        id: string,
        opts: {
          title?: string
          description?: string
          priority?: string
          type?: string
          tags?: string[]
          ac?: string[]
          testFiles?: string[]
          implementationFiles?: string[]
          patchSearch?: string
          patchReplace?: string
          dir: string
        },
      ) => {
        const out = createCliOutput('node.update')
        let nextPriority: GraphNode['priority'] | undefined
        if (opts.priority !== undefined) {
          const priority = coercePriority(opts.priority)
          if (!priority.ok) {
            out.err('INVALID_INPUT', `Prioridade inválida: ${opts.priority} (use um inteiro de 1 a 5)`)
            return
          }
          nextPriority = priority.value as GraphNode['priority']
        }
        const patching = opts.patchSearch !== undefined || opts.patchReplace !== undefined
        if (patching && (opts.patchSearch === undefined || opts.patchReplace === undefined)) {
          out.err('INVALID_INPUT', '--patch-search e --patch-replace devem ser usados juntos')
          return
        }
        if (patching && opts.description !== undefined) {
          out.err('INVALID_INPUT', '--patch-search é incompatível com --description (ambíguo) — use um ou outro')
          return
        }
        withStore(opts.dir, (store) => {
          if (patching) {
            const current = store.getNodeById(id)
            if (!current) {
              out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
              return
            }
            const patch = applySearchReplace(current.description ?? '', {
              search: opts.patchSearch as string,
              replace: opts.patchReplace as string,
            })
            if (!patch.applied) {
              out.err(
                'PATCH_NOT_FOUND',
                `--patch-search não encontrado na descrição atual de ${id} — use --description para reescrever tudo`,
              )
              return
            }
            opts.description = patch.content
          }
          const fields: Partial<
            Pick<
              GraphNode,
              | 'title'
              | 'description'
              | 'priority'
              | 'type'
              | 'tags'
              | 'acceptanceCriteria'
              | 'testFiles'
              | 'implementationFiles'
            >
          > = {}
          if (opts.title !== undefined) fields.title = opts.title
          if (opts.description !== undefined) fields.description = opts.description
          if (nextPriority !== undefined) fields.priority = nextPriority
          if (opts.type !== undefined) fields.type = opts.type as NodeType
          if (opts.tags !== undefined) fields.tags = normalizeTags(opts.tags)
          if (opts.ac !== undefined) fields.acceptanceCriteria = opts.ac
          if (opts.testFiles !== undefined) fields.testFiles = normalizeList(opts.testFiles)
          if (opts.implementationFiles !== undefined)
            fields.implementationFiles = normalizeList(opts.implementationFiles)
          const updated = store.updateNode(id, fields)
          if (!updated) {
            out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
            return
          }
          // Warn (do not block) when a just-set file reference doesn't exist yet —
          // catches phantom testFiles/implementationFiles before `agf done`'s gate.
          const referencedFiles = [...(fields.testFiles ?? []), ...(fields.implementationFiles ?? [])]
          if (referencedFiles.length > 0) {
            const missing = missingFiles(referencedFiles, makeFileExists(opts.dir))
            if (missing.length > 0) {
              log.warn('node.update: referenced file(s) not found on disk', { nodeId: id, missing })
            }
          }
          const runOnWarning = opts.ac !== undefined ? detectRunOnAc(opts.ac) : null
          out.ok(
            {
              id,
              updated: true,
              ...(fields.tags ? { tags: fields.tags } : {}),
              ...(fields.acceptanceCriteria ? { acceptanceCriteria: fields.acceptanceCriteria } : {}),
              ...(runOnWarning ? { warning: runOnWarning } : {}),
            },
            { dir: resolve(opts.dir) },
          )
        })
      },
    )

  cmd
    .command('replace')
    .description(
      'Recria um nó preservando suas arestas (rewired para o novo ID) — evita orfanizar edges de node rm + node add',
    )
    .argument('<id>', 'ID do nó a substituir')
    .option('--title <title>', 'Novo título (default: mantém o título antigo)')
    .option('--description <desc>', 'Nova descrição')
    .option('--ac <criterion...>', 'Novos ACs (repetível)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { title?: string; description?: string; ac?: string[]; dir: string }) => {
      const out = createCliOutput('node.replace')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const oldNode = store.getNodeById(id)
        if (!oldNode) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const relatedEdges = store.getAllEdges().filter((e) => e.from === id || e.to === id)

        const newId = generateId('node')
        store.insertNode({
          ...oldNode,
          id: newId,
          title: opts.title ?? oldNode.title,
          description: opts.description ?? oldNode.description,
          acceptanceCriteria: opts.ac ?? oldNode.acceptanceCriteria,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })

        for (const edge of relatedEdges) {
          store.insertEdge({
            ...edge,
            id: generateId('edge'),
            from: edge.from === id ? newId : edge.from,
            to: edge.to === id ? newId : edge.to,
          })
          store.deleteEdge(edge.id)
        }

        store.deleteNode(id)

        out.ok({ oldId: id, newId, edgesRewired: relatedEdges.length })
      } finally {
        store.close()
      }
    })

  const rationale = cmd
    .command('rationale')
    .description('ADR-lite: lê/escreve o rationale de decisão de um nó (metadata + description)')

  rationale
    .command('set')
    .description('Grava o rationale de decisão (decision/why/alternatives/consequences) no nó')
    .argument('<id>', 'ID do nó')
    .requiredOption('--decision <text>', 'A decisão tomada')
    .requiredOption('--why <text>', 'Por que essa decisão')
    .requiredOption('--consequences <text>', 'Consequências/trade-offs aceitos')
    .option('--alternative <text...>', 'Alternativa considerada (repetível)')
    .option('--date <iso>', 'Data da decisão (YYYY-MM-DD; default: hoje)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (
        id: string,
        opts: {
          decision: string
          why: string
          consequences: string
          alternative?: string[]
          date?: string
          dir: string
        },
      ) => {
        const out = createCliOutput('node.rationale.set')
        withStore(opts.dir, (store) => {
          if (!store.getNodeById(id)) {
            out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
            return
          }
          const date = opts.date ?? new Date().toISOString().slice(0, 10)
          writeDecisionRationale(store, id, {
            decision: opts.decision,
            why: opts.why,
            alternatives: opts.alternative ?? [],
            consequences: opts.consequences,
            date,
          })
          out.ok({ id, rationale: 'written', date })
        })
      },
    )

  rationale
    .command('get')
    .description('Lê o rationale de decisão armazenado no nó')
    .argument('<id>', 'ID do nó')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('node.rationale.get')
      withStore(opts.dir, (store) => {
        if (!store.getNodeById(id)) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const found = readDecisionRationale(store, id)
        if (!found) {
          out.err('NOT_FOUND', `Nó ${id} não tem rationale de decisão gravado`)
          return
        }
        out.ok({ id, rationale: found })
      })
    })

  cmd
    .command('status')
    .description('Define o status de um nó (com validação status_flow)')
    .argument('<id>', 'ID do nó')
    .argument('<state>', 'Novo status (backlog|ready|in_progress|blocked|done)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--force', 'Ignora a validação de transição', false)
    .action((id: string, state: string, opts: { dir: string; force: boolean }) => {
      const out = createCliOutput('node.status')
      withStore(opts.dir, (store) => {
        const node = store.getNodeById(id)
        if (!node) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const to = state as NodeStatus
        // Honesty invariant (unconditional — not bypassable by --force, unlike
        // the transition-shape check below): an externally/infra-blocked node
        // must never be marked done from the repo, since the work is gated on
        // a human/infra action outside it.
        if (!isHonestDoneTransition(node, to)) {
          out.err(
            'EXTERNAL_BLOCKED_DONE',
            `Nó "${id}" está bloqueado por infra/externo e não pode ser marcado done. Resolva o bloqueio e limpe node.metadata.blockReason primeiro.`,
          )
          return
        }
        if (!opts.force) {
          const transitionErr = validateStatusTransition(node.status, to)
          if (transitionErr) {
            out.err('INVALID_TRANSITION', transitionErr)
            return
          }
        }
        new RealTaskLifecycleService(store).updateStatus(id, to, { skipHooks: opts.force })
        out.ok({ id, from: node.status, to }, { dir: resolve(opts.dir) })
      })
    })

  cmd
    .command('promote')
    .description('Sugere ou executa promoção de épico (checkEpicPromotion/autoPromoteEpic/cascadeDownOnDone)')
    .argument('<id>', 'ID do nó (tipicamente uma task recém-marcada done)')
    .option('--auto', 'Executa a promoção (auto-promote pai + cascade down nos próprios filhos)', false)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { auto: boolean; dir: string }) => {
      const out = createCliOutput('node.promote')
      withStore(opts.dir, (store) => {
        const node = store.getNodeById(id)
        if (!node) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const suggestion = checkEpicPromotion(store, id)
        if (!opts.auto) {
          out.ok({ suggestion })
          return
        }
        const cascade = cascadeDownOnDone(store, id)
        const promote = autoPromoteEpic(store, id)
        out.ok({ suggestion, cascaded: cascade.cascaded, promoted: promote.promoted })
      })
    })

  cmd
    .command('move')
    .description('Reparenta um nó (atualiza parentId + aresta parent_of)')
    .argument('<id>', 'ID do nó')
    .requiredOption('--parent <id>', 'Novo nó pai')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { parent: string; dir: string }) => {
      const out = createCliOutput('node.move')
      withStore(opts.dir, (store) => {
        const node = store.getNodeById(id)
        if (!node) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        if (!store.getNodeById(opts.parent)) {
          out.err('NOT_FOUND', `Nó pai não encontrado: ${opts.parent}`)
          return
        }
        // Validate (and persist) parentId BEFORE touching edges — updateNode
        // throws ValidationError on a circular parent chain, and running the
        // edge deletion first would leave the node with neither its old nor
        // new parent edge on failure.
        try {
          store.updateNode(id, { parentId: opts.parent })
        } catch (err) {
          if (err instanceof ValidationError) {
            out.err('CIRCULAR_REFERENCE', err.message)
            return
          }
          throw err
        }
        for (const e of store.getEdgesTo(id)) {
          if (e.relationType === 'parent_of') store.deleteEdge(e.id)
        }
        store.insertEdge({
          id: generateId('edge'),
          from: opts.parent,
          to: id,
          relationType: 'parent_of',
          createdAt: new Date().toISOString(),
        })
        out.ok({ id, parent: opts.parent })
      })
    })

  cmd
    .command('clone')
    .description('Clona um nó (status resetado p/ backlog)')
    .argument('<id>', 'ID do nó de origem')
    .option('--parent <id>', 'Pai do clone (default: mesmo pai da origem)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { parent?: string; dir: string }) => {
      const out = createCliOutput('node.clone')
      withStore(opts.dir, (store) => {
        const src = store.getNodeById(id)
        if (!src) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }
        const ts = new Date().toISOString()
        const clone: GraphNode = {
          ...src,
          id: generateId('node'),
          status: 'backlog',
          parentId: opts.parent ?? src.parentId ?? null,
          createdAt: ts,
          updatedAt: ts,
          metadata: { ...src.metadata, source: 'cli', clonedFrom: id },
        }
        store.insertNode(clone)
        out.ok({ source: id, clone: clone.id })
      })
    })

  cmd
    .command('rm')
    .description('Remove um nó do grafo (soft-delete — use restore para reverter)')
    .argument('<id>', 'ID do nó')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('node.rm')
      withStore(opts.dir, (store) => {
        const ok = store.deleteNode(id)
        if (!ok) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
        } else {
          out.ok({ id, archived: true }, { dir: resolve(opts.dir) })
        }
      })
    })

  cmd
    .command('restore')
    .description('Restaura um nó arquivado de volta ao grafo')
    .argument('<id>', 'ID do nó arquivado')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('node.restore')
      withStore(opts.dir, (store) => {
        const ok = store.restoreNode(id)
        if (!ok) {
          out.err('NOT_FOUND', `Nó não encontrado ou não está arquivado: ${id}`)
        } else {
          out.ok({ id, restored: true })
        }
      })
    })

  return cmd
}
