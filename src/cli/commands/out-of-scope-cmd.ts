/*!
 * out-of-scope-cmd — agf out-of-scope CLI command.
 *
 * WHY: Exposes out-of-scope-store.ts (§EPIC-8.T06) — records concepts the
 * project explicitly chose NOT to support (.out-of-scope/*.md), so the
 * agent doesn't re-litigate the same idea later. `check` surfaces
 * token-overlap matches before a new feature is proposed/planned.
 *
 * Composes with: out-of-scope-store.ts (core, pure fs I/O — no store needed).
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import {
  recordOutOfScope,
  listOutOfScope,
  checkOutOfScope,
  OUT_OF_SCOPE_DIR,
  DEFAULT_MATCH_THRESHOLD,
} from '../../core/knowledge/out-of-scope-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'out-of-scope-cmd.ts' })

/** Builds the `agf out-of-scope` CLI command (Commander definition). */
export function outOfScopeCommand(): Command {
  log.info('out-of-scope command registered')
  const cmd = new Command('out-of-scope')
    .description('Decisões de escopo explicitamente descartadas (.out-of-scope/*.md) — evita re-litigar a mesma ideia')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('--dir <dir>', 'Diretório .out-of-scope', OUT_OF_SCOPE_DIR)

  dirOpt(
    cmd.command('record <concept> <reason>').description('Registra um conceito como fora de escopo, com a razão'),
  ).action((concept: string, reason: string, opts: { dir: string }) => {
    const out = createCliOutput('out-of-scope.record')
    try {
      out.ok(recordOutOfScope(concept, reason, opts.dir))
    } catch (err) {
      out.err('INVALID_ARGUMENT', getErrorMessage(err))
    }
  })

  dirOpt(cmd.command('list').description('Lista todas as decisões de fora-de-escopo registradas')).action(
    (opts: { dir: string }) => {
      const out = createCliOutput('out-of-scope.list')
      out.ok({ entries: listOutOfScope(opts.dir) })
    },
  )

  dirOpt(
    cmd
      .command('check <concept>')
      .description('Verifica se um conceito já foi descartado antes (similaridade de tokens)')
      .option('--threshold <n>', 'Limiar de similaridade (0-1)', String(DEFAULT_MATCH_THRESHOLD)),
  ).action((concept: string, opts: { dir: string; threshold: string }) => {
    const out = createCliOutput('out-of-scope.check')
    out.ok({ matches: checkOutOfScope(concept, opts.dir, Number(opts.threshold)) })
  })

  return cmd
}
