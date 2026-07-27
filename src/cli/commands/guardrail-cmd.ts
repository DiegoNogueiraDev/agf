/*!
 * guardrail-cmd — agf guardrail CLI command.
 *
 * WHY: Exposes GuardrailStore (guardrail-adapter.ts) — the missing WRITER/READER
 * for guardrail_executions (Design by Contract, Meyer 1986). runGuardrailPipeline
 * already computes results in-process; this surfaces the persisted history so
 * a caller can record and later inspect pass/fail runs across a trace.
 *
 * Composes with: guardrail-adapter.ts (core, real guardrail_executions table).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { GuardrailStore } from '../../core/observability/guardrail-adapter.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'guardrail-cmd.ts' })

/** Builds the `agf guardrail` CLI command (Commander definition). */
export function guardrailCommand(): Command {
  log.info('guardrail command registered')
  const cmd = new Command('guardrail')
    .description('Guardrails de qualidade persistidos — pre/post checks com fail_open/fail_closed (Meyer 1986)')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(
    cmd
      .command('record <traceId> <name> <position>')
      .description('Registra uma execução de guardrail')
      .option('--passed', 'Marca a execução como aprovada', false)
      .requiredOption('--score <n>', 'Score 0-1')
      .requiredOption('--latency <ms>', 'Latência em ms')
      .requiredOption('--strategy <strategy>', 'fail_open|fail_closed')
      .requiredOption('--details <text>', 'Detalhes da execução'),
  ).action(
    (
      traceId: string,
      name: string,
      position: string,
      opts: { dir: string; passed: boolean; score: string; latency: string; strategy: string; details: string },
    ) => {
      const out = createCliOutput('guardrail.record')
      if (opts.strategy !== 'fail_open' && opts.strategy !== 'fail_closed') {
        out.err('INVALID_STRATEGY', `Strategy inválida: ${opts.strategy}. Use fail_open|fail_closed`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        new GuardrailStore(store.getDb()).record({
          traceId,
          name,
          position,
          passed: opts.passed,
          score: Number(opts.score),
          latencyMs: Number(opts.latency),
          strategy: opts.strategy,
          details: opts.details,
        })
        out.ok({ traceId, name, recorded: true })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('by-trace <traceId>').description('Lista as execuções de guardrail de um trace')).action(
    (traceId: string, opts: { dir: string }) => {
      const out = createCliOutput('guardrail.by-trace')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok({ executions: new GuardrailStore(store.getDb()).getByTrace(traceId) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('pass-rate <traceId>').description('Taxa de aprovação (0-1) dos guardrails de um trace')).action(
    (traceId: string, opts: { dir: string }) => {
      const out = createCliOutput('guardrail.pass-rate')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok({ traceId, passRate: new GuardrailStore(store.getDb()).getPassRate(traceId) })
      } finally {
        store.close()
      }
    },
  )

  return cmd
}
