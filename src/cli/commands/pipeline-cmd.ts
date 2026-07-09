/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * `agf pipeline` — compound commands that combine multiple operations
 * in a single process/store cycle. Reduces round-trips, avoids repeated
 * SQLite open/close, and cuts ~60-70% latency per workflow loop.
 *
 * Each compound is a deterministic function (no LLM) that reuses a single
 * SqliteStore handle across all operations.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { buildCompressedContext, buildTaskContext } from '../../core/context/compact-context.js'
import type { TaskContext, CompressedContext } from '../../core/context/compact-context.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'pipeline-cmd.ts' })

// ── Compound: next-context ───────────────────────────────

export interface NextContextResult {
  node: { id: string; title: string; status: string; priority: number }
  reason: string
  warning?: string
  context: TaskContext | CompressedContext | Record<string, unknown>
}

export function nextContextCompound(dir: string, compressed: boolean): NextContextResult | null {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    const doc = store.toGraphDocument()
    const result = findNextTask(doc)
    if (!result) return null

    const ctx = compressed ? buildCompressedContext(store, result.node.id) : buildTaskContext(store, result.node.id)

    const out: NextContextResult = {
      node: {
        id: result.node.id,
        title: result.node.title,
        status: result.node.status,
        priority: result.node.priority,
      },
      reason: result.reason,
      context: ctx ?? {},
    }
    if (result.warning) out.warning = result.warning
    return out
  } finally {
    store.close()
  }
}

// ── Compound: next-start ─────────────────────────────────

export interface NextStartResult {
  taskId: string
  title: string
  reason: string
  context: TaskContext | CompressedContext | Record<string, unknown> | string
  warning?: string
}

export function nextStartCompound(dir: string, compressed: boolean): NextStartResult | null {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    // Check WIP
    const stats = store.getStats()
    const wipCount = stats.byStatus.in_progress || 0
    if (wipCount >= 1) {
      log.warn(`WIP_EXCEEDED: ${wipCount} task(s) already in_progress`)
      return null
    }

    const doc = store.toGraphDocument()
    const result = findNextTask(doc)
    if (!result) return null

    const ctx = compressed ? buildCompressedContext(store, result.node.id) : buildTaskContext(store, result.node.id)

    // Mark in_progress
    store.updateNodeStatus(result.node.id, 'in_progress')

    const out: NextStartResult = {
      taskId: result.node.id,
      title: result.node.title,
      reason: result.reason,
      context: ctx ?? {},
    }
    if (result.warning) out.warning = result.warning
    return out
  } finally {
    store.close()
  }
}

// ── Compound: next-context-start ─────────────────────────

function nextContextStartCompound(dir: string, compressed: boolean): NextStartResult | null {
  return nextStartCompound(dir, compressed)
}

// ── Command Registration ─────────────────────────────────

/** Builds the `agf pipeline` CLI command (Commander definition). */
export function pipelineCommand(): Command {
  log.info('pipeline command registered')
  const cmd = new Command('pipeline').description(
    'Compound commands: multiple operations in a single store cycle (faster)',
  )

  // next-context
  cmd
    .command('next-context')
    .description('Find next task + load its context (1 store open)')
    .option('--full', 'Use full (uncompressed) context')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { full: boolean; dir: string }) => {
      const out = createCliOutput('pipeline.next-context')
      const result = nextContextCompound(opts.dir, !opts.full)
      if (!result) {
        out.err('NO_TASKS', 'Nenhuma task disponível para puxar.')
        return
      }
      out.ok(result)
    })

  // next-start
  cmd
    .command('next-start')
    .description('Find next task + load context + mark in_progress (1 store open)')
    .option('--full', 'Use full (uncompressed) context')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { full: boolean; dir: string }) => {
      const out = createCliOutput('pipeline.next-start')
      const result = nextStartCompound(opts.dir, !opts.full)
      if (!result) {
        out.err('NO_TASKS', 'Nenhuma task disponível para puxar ou WIP excedido.')
        return
      }
      out.ok(result)
    })

  // next-context-start (alias for next-start)
  cmd
    .command('next-context-start')
    .description('Alias for next-start: find + context + mark in_progress')
    .option('--full', 'Use full (uncompressed) context')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { full: boolean; dir: string }) => {
      const out = createCliOutput('pipeline.next-context-start')
      const result = nextContextStartCompound(opts.dir, !opts.full)
      if (!result) {
        out.err('NO_TASKS', 'Nenhuma task disponível para puxar ou WIP excedido.')
        return
      }
      out.ok(result)
    })

  return cmd
}
