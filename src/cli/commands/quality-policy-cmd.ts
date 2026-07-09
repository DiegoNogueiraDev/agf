/*!
 * quality-policy-cmd — agf quality-policy CLI command.
 *
 * WHY: Exposes QualityPolicy (Safety/Liveness gates, Lamport 1977) — declares
 * blocking/warning thresholds over named metrics, then evaluates them against
 * a metrics snapshot. Metric-agnostic: the caller supplies --metrics as JSON,
 * same pattern as swarm-cmd.ts's --votes.
 *
 * Composes with: quality-policy.ts (core, real quality_policies table).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { QualityPolicyStore, evaluatePolicy, type QualityGate } from '../../core/observability/quality-policy.js'
import { createLogger } from '../../core/utils/logger.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'quality-policy-cmd.ts' })

/** Builds the `agf quality-policy` CLI command (Commander definition). */
export function qualityPolicyCommand(): Command {
  log.info('quality-policy command registered')
  const cmd = new Command('quality-policy')
    .description('Políticas declarativas de qualidade — gates block/warn sobre métricas nomeadas (Lamport 1977)')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(
    cmd
      .command('create <name>')
      .description('Cria uma política (inativa por padrão)')
      .requiredOption('--gates <json>', 'JSON array de {metric,operator,threshold,severity}'),
  ).action((name: string, opts: { dir: string; gates: string }) => {
    const out = createCliOutput('quality-policy.create')
    let gates: QualityGate[]
    try {
      gates = JSON.parse(opts.gates) as QualityGate[]
    } catch (e) {
      out.err('PARSE_ERROR', getErrorMessage(e))
      return
    }
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const id = new QualityPolicyStore(store.getDb()).createPolicy(name, gates)
      out.ok({ id })
    } finally {
      store.close()
    }
  })

  dirOpt(cmd.command('activate <policyId>').description('Ativa uma política (desativa as demais)')).action(
    (policyId: string, opts: { dir: string }) => {
      const out = createCliOutput('quality-policy.activate')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        new QualityPolicyStore(store.getDb()).activatePolicy(policyId)
        out.ok({ policyId, active: true })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('show [policyId]').description('Mostra uma política por ID, ou a ativa se omitido')).action(
    (policyId: string | undefined, opts: { dir: string }) => {
      const out = createCliOutput('quality-policy.show')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const policyStore = new QualityPolicyStore(store.getDb())
        const policy = policyId ? policyStore.getPolicy(policyId) : policyStore.getActivePolicy()
        if (!policy) {
          out.err('NOT_FOUND', policyId ? `Política não encontrada: ${policyId}` : 'Nenhuma política ativa')
          return
        }
        out.ok(policy)
      } finally {
        store.close()
      }
    },
  )

  dirOpt(
    cmd
      .command('evaluate [policyId]')
      .description('Avalia uma política (ou a ativa) contra métricas fornecidas')
      .requiredOption('--metrics <json>', 'JSON object {metricName: number}'),
  ).action((policyId: string | undefined, opts: { dir: string; metrics: string }) => {
    const out = createCliOutput('quality-policy.evaluate')
    let metrics: Record<string, number>
    try {
      metrics = JSON.parse(opts.metrics) as Record<string, number>
    } catch (e) {
      out.err('PARSE_ERROR', getErrorMessage(e))
      return
    }
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const policyStore = new QualityPolicyStore(store.getDb())
      const policy = policyId ? policyStore.getPolicy(policyId) : policyStore.getActivePolicy()
      if (!policy) {
        out.err('NOT_FOUND', policyId ? `Política não encontrada: ${policyId}` : 'Nenhuma política ativa')
        return
      }
      out.ok(evaluatePolicy(policy, metrics))
    } finally {
      store.close()
    }
  })

  return cmd
}
