/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { buildTaskContext, buildCompressedContext, summarizeTaskContext } from '../../core/context/compact-context.js'
import { applyFlowToCompact } from '../../core/context/flow-compact.js'
import { recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { computeContextHealthScore } from '../../core/context/context-health.js'
import { RealContextRuntimeService } from '../../core/services/context-runtime.js'
import { collectGitContext, formatGitContextXml } from '../../core/utils/git-context.js'
import { findRelevantDomainSkills, formatDomainSkillsBlock } from '../../core/skills/domain-skill-retrieval.js'
import { join } from 'node:path'

const log = createLogger({ layer: 'cli', source: 'context-cmd.ts' })

/** Builds the `agf context` CLI command (Commander definition). */
export function contextCommand(): Command {
  log.info('context command registered')
  const cmd = new Command('context')
    .description('Emite o context-pack (compact) de um nó (tool MCP `context`)')
    // Without this, Commander's own -d/--dir on this command's action collides
    // with the identically-named option on subcommands (health/summary/detail),
    // silently discarding whatever --dir the subcommand was actually called with.
    .enablePositionalOptions()
    .argument('<id>', 'ID do nó')
    .option('--compressed', 'Usa a vizinhança comprimida (menos tokens) — DEFAULT', true)
    .option('--full', 'Contexto completo sem compressão (mais tokens)')
    .option('--format <fmt>', 'Formato de saída: json (default) | markdown (narrative summary)', 'json')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { compressed: boolean; full: boolean; format: string; dir: string }) => {
      const out = createCliOutput('context')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        // --full overrides --compressed (explicit human mode)
        const useCompressed = opts.full ? false : opts.compressed

        if (opts.format === 'markdown') {
          const ctx = buildTaskContext(store, id)
          if (!ctx) {
            out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
            return
          }
          out.ok({ markdown: summarizeTaskContext(ctx) })
          return
        }

        // Flow (λ_flow): when enabled, dilute the graph neighbourhood by Φ-governed
        // topological decay and record the input-token cut as the `flow` lever — so
        // it shows in `agf savings` and feeds the spiral. Returns null when flow is
        // off or the node is missing → fall through to legacy (non-regression).
        const flow = applyFlowToCompact(store, id)
        if (flow) {
          if (flow.flow.tokensSaved > 0) {
            try {
              recordLeverEvent(store.getDb(), {
                sessionId: `context_${id}`,
                nodeId: id,
                lever: 'flow',
                tokensBefore: flow.flow.tokensBaseline,
                tokensAfter: flow.flow.tokensActual,
                saved: flow.flow.tokensSaved,
                accepted: true,
                gateOutcome: 'accepted',
                score: flow.flow.phi,
              })
            } catch {
              // telemetry never breaks the context hot path
            }
          }
          out.ok(flow.context)
          return
        }

        const ctx = useCompressed ? buildCompressedContext(store, id) : buildTaskContext(store, id)
        if (!ctx) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }

        // node_wire_cd98047410c5 — domain-skill-retrieval wire. Deterministic,
        // zero-token surfacing of learned domain skills relevant to this task's
        // title/description. Silent no-op when workflow-graph/domain-skills has
        // nothing matching (most projects today) — additive only.
        const node = store.getNodeById(id)
        if (node) {
          const skillsDir = join(opts.dir, 'workflow-graph', 'domain-skills')
          const query = `${node.title} ${node.description ?? ''}`
          const matches = findRelevantDomainSkills(skillsDir, query, { limit: 5 })
          if (matches.length > 0) {
            const block = formatDomainSkillsBlock(matches)
            if (block) (ctx as unknown as Record<string, unknown>).domainSkills = block
          }
        }

        out.ok(ctx)
      } finally {
        store.close()
      }
    })

  // `agf context health` subcommand — scores context quality 0-100
  cmd.addCommand(
    new Command('health')
      .description('Compute context health score (0-100): size, freshness, relevance dimensions')
      .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
      .action((_opts: { dir: string }) => {
        const out = createCliOutput('context.health')
        // Health is evaluated by the caller with real messages; CLI surfaces a baseline
        // (empty session = perfect health) so the command is always usable in scripts.
        const report = computeContextHealthScore([])
        out.ok(report)
      }),
  )

  // `agf context summary` — graph-wide counts (byType/byStatus/nextTask)
  cmd.addCommand(
    new Command('summary')
      .description('Resumo do grafo: contagem por tipo/status, total de nós, próxima task')
      .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
      .action((opts: { dir: string }) => {
        const out = createCliOutput('context.summary')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          out.ok(new RealContextRuntimeService(store).summary())
        } finally {
          store.close()
        }
      }),
  )

  // `agf context git` — compact git state (branch, dirty files, recent commits)
  cmd.addCommand(
    new Command('git')
      .description('Estado git compacto: branch, arquivos dirty, commits recentes')
      .option('--format <fmt>', 'Formato de saída: json (default) | xml (bloco pronto p/ prompt de LLM)', 'json')
      .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
      .action((opts: { format: string; dir: string }) => {
        const out = createCliOutput('context.git')
        const ctx = collectGitContext(opts.dir)
        if (opts.format === 'xml') {
          out.ok({ xml: formatGitContextXml(ctx) })
          return
        }
        out.ok(ctx)
      }),
  )

  // `agf context detail <id>` — a single node's children/edge counts
  cmd.addCommand(
    new Command('detail')
      .description('Detalhe de um nó: contagem de filhos e arestas')
      .argument('<id>', 'ID do nó')
      .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
      .action((id: string, opts: { dir: string }) => {
        const out = createCliOutput('context.detail')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const detail = new RealContextRuntimeService(store).nodeDetail(id)
          if (!detail) {
            out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
            return
          }
          out.ok(detail)
        } finally {
          store.close()
        }
      }),
  )

  return cmd
}
