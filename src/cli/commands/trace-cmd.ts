/*!
 * trace-cmd — agf trace CLI command.
 *
 * WHY: Exposes TraceStore (trace-store.ts) — the missing WRITER for
 * execution_traces/execution_spans (Observability Theorem, Kalman 1960).
 * agf dataset capture-traces already reads execution_traces, but nothing
 * wrote to it until this wire. Distinct from core/utils/trace-store.ts
 * (an unrelated AsyncLocalStorage trace-ID propagation helper).
 *
 * Composes with: trace-store.ts (core, real execution_traces/execution_spans tables).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { coerceLimit, errMessage } from '../shared/coerce.js'
import { TraceStore } from '../../core/observability/trace-store.js'
import { ToolResultStore } from '../../core/store/tool-result-store.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'trace-cmd.ts' })

/** Builds the `agf trace` CLI command (Commander definition). */
export function traceCommand(): Command {
  log.info('trace command registered')
  const cmd = new Command('trace')
    .description('Traces de execução persistentes — spans, custo e latência (Observability Theorem, Kalman 1960)')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(
    cmd
      .command('begin <threadId> <toolName>')
      .description('Inicia um trace')
      .option('--node-id <id>', 'Node associado'),
  ).action((threadId: string, toolName: string, opts: { dir: string; nodeId?: string }) => {
    const out = createCliOutput('trace.begin')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const traceId = new TraceStore(store.getDb()).beginTrace(threadId, opts.nodeId ?? null, toolName)
      out.ok({ traceId })
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('end <traceId> <status>')
      .description('Encerra um trace (status: completed|error)')
      .option('--tokens-in <n>', 'Tokens de entrada')
      .option('--tokens-out <n>', 'Tokens de saída')
      .option('--cost <n>', 'Custo estimado em USD'),
  ).action(
    (traceId: string, status: string, opts: { dir: string; tokensIn?: string; tokensOut?: string; cost?: string }) => {
      const out = createCliOutput('trace.end')
      if (status !== 'completed' && status !== 'error') {
        out.err('INVALID_STATUS', `Status inválido: ${status}. Use completed|error`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        new TraceStore(store.getDb()).endTrace(traceId, status, {
          ...(opts.tokensIn !== undefined ? { tokensIn: Number(opts.tokensIn) } : {}),
          ...(opts.tokensOut !== undefined ? { tokensOut: Number(opts.tokensOut) } : {}),
          ...(opts.cost !== undefined ? { estimatedCostUsd: Number(opts.cost) } : {}),
        })
        out.ok({ traceId, status })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('show <traceId>').description('Mostra um trace + seus spans')).action(
    (traceId: string, opts: { dir: string }) => {
      const out = createCliOutput('trace.show')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const traceStore = new TraceStore(store.getDb())
        const trace = traceStore.getTrace(traceId)
        if (!trace) {
          out.err('NOT_FOUND', `Trace não encontrado: ${traceId}`)
          return
        }
        out.ok({ trace, spans: traceStore.getSpansByTrace(traceId) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('by-node <nodeId>').description('Lista os traces de um node')).action(
    (nodeId: string, opts: { dir: string }) => {
      const out = createCliOutput('trace.by-node')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok({ traces: new TraceStore(store.getDb()).getTracesByNode(nodeId) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('cost [nodeId]').description('Custo agregado por node, ou resumo geral se omitido')).action(
    (nodeId: string | undefined, opts: { dir: string }) => {
      const out = createCliOutput('trace.cost')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const traceStore = new TraceStore(store.getDb())
        out.ok(nodeId ? traceStore.getCostByNode(nodeId) : traceStore.getCostSummary())
      } finally {
        store.close()
      }
    },
  )

  dirOpt(
    cmd
      .command('record-result <traceId> <toolName>')
      .description('Persiste o resultado de uma tool call sob um trace (ToolResultStore, audit/replay)')
      .option('--args <json>', 'Argumentos da tool (JSON)', '{}')
      .requiredOption('--result <json>', 'Resultado da tool (JSON)'),
  ).action((traceId: string, toolName: string, opts: { dir: string; args: string; result: string }) => {
    const out = createCliOutput('trace.record-result')
    let toolArgs: Record<string, unknown>
    let result: unknown
    try {
      toolArgs = JSON.parse(opts.args)
      result = JSON.parse(opts.result)
    } catch (e) {
      out.err('INVALID_INPUT', `--args/--result devem ser JSON válido: ${errMessage(e)}`)
      return
    }
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const projectId = store.getProject()?.id ?? 'unknown'
      const id = new ToolResultStore(store.getDb()).record(projectId, traceId, toolName, toolArgs, result)
      out.ok({ id, traceId, toolName })
    } finally {
      store.close()
    }
  })

  dirOpt(cmd.command('results <traceId>').description('Lista os resultados de tool persistidos sob um trace')).action(
    (traceId: string, opts: { dir: string }) => {
      const out = createCliOutput('trace.results')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const results = new ToolResultStore(store.getDb()).getByTrace(traceId)
        out.ok({ results }, { count: results.length })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(
    cmd
      .command('results-by-tool <toolName>')
      .description('Lista os resultados mais recentes de uma tool, no projeto atual')
      .option('--limit <n>', 'Máximo de resultados', '50'),
  ).action((toolName: string, opts: { dir: string; limit: string }) => {
    const out = createCliOutput('trace.results-by-tool')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const projectId = store.getProject()?.id ?? 'unknown'
      const limit = coerceLimit(opts.limit, 50)
      const results = new ToolResultStore(store.getDb()).getByToolName(projectId, toolName, limit)
      out.ok({ results }, { count: results.length })
    } finally {
      store.close()
    }
  })

  return cmd
}
