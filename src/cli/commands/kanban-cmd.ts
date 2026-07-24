/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { ZodError } from 'zod/v4'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { buildKanbanBoard } from '../../core/kanban/kanban-builder.js'
import { generateSuggestions } from '../../core/kanban/kanban-orchestrator.js'
import { validateMove } from '../../core/kanban/kanban-validator.js'
import { validateKanbanInput } from '../../core/kanban/validation.js'
import { DEFAULT_KANBAN_CONFIG } from '../../core/kanban/kanban-types.js'
import type { KanbanBoard, KanbanSuggestion, SwimlaneMode } from '../../core/kanban/kanban-types.js'
import type { NodeStatus } from '../../core/graph/graph-types.js'
import { openStoreOrFail } from '../open-store.js'
import { summarizeLedger } from '../../core/observability/llm-call-ledger.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'kanban-cmd.ts' })

interface DocStore {
  toGraphDocument: SqliteStore['toGraphDocument']
}

export function buildBoard(store: DocStore, swimlaneMode: SwimlaneMode = 'none', sprintFilter?: string): KanbanBoard {
  return buildKanbanBoard(store.toGraphDocument(), { ...DEFAULT_KANBAN_CONFIG, swimlaneMode, sprintFilter })
}

/** Smart suggestions for the given board: auto-promote, unblock, WIP/bottleneck alerts, next task. */
export function boardSuggestions(store: DocStore, board: KanbanBoard): KanbanSuggestion[] {
  return generateSuggestions(store.toGraphDocument(), board)
}

/** Builds the `agf kanban` CLI command (Commander definition). */
export function kanbanCommand(): Command {
  log.info('kanban command registered')
  const cmd = new Command('kanban')
    .description('Render the deterministic Kanban board (status columns, WIP, flow metrics)')
    .enablePositionalOptions()
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-s, --swimlane <mode>', 'Swimlane: epic | sprint | none', 'none')
    .option(
      '--suggestions',
      'Inclui sugestões deterministicas (auto-promote, unblock, WIP/bottleneck, próxima task)',
      false,
    )
    .option('--sprint <id>', 'Restringe o board aos cards deste sprint')
    .action((opts: { dir: string; swimlane: string; suggestions: boolean; sprint?: string }) => {
      const out = createCliOutput('kanban')

      let validated
      try {
        validated = validateKanbanInput({ sprintId: opts.sprint })
      } catch (err) {
        const message = err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : String(err)
        out.err('VALIDATION_ERROR', `Input inválido: ${message}`)
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const mode = (['epic', 'sprint', 'none'].includes(opts.swimlane) ? opts.swimlane : 'none') as SwimlaneMode
        const board = buildBoard(store, mode, validated.sprintId)
        const ledger = summarizeLedger(store.getDb())
        out.ok({
          board,
          ledger,
          ...(opts.suggestions ? { suggestions: boardSuggestions(store, board) } : {}),
        })
      } finally {
        store.close()
      }
    })

  cmd
    .command('validate-move <id> <status>')
    .description('Dry-run check for a card move: advisory warnings on unresolved deps / WIP overflow (never blocks)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, status: string, opts: { dir: string }) => {
      const out = createCliOutput('kanban.validate-move')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok(validateMove(store, id, status as NodeStatus, DEFAULT_KANBAN_CONFIG))
      } finally {
        store.close()
      }
    })

  return cmd
}
