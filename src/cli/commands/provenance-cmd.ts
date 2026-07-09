/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf provenance` — exposes the epistemic-confidence ladder as honesty gates.
 *
 * Pure / local-first: no graph mutation, no network. The driving agent calls
 * these to decide whether a claim is allowed to advance (promote), record a
 * forced reversal (downgrade), or mint a deterministic local receipt for the
 * `proven` tier (hash). Thin orchestration over src/core/provenance.
 */

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import {
  promoteTier,
  downgradeTier,
  computeTierDistribution,
  isLowMaturityEpic,
  hashNodeCanonical,
  MissingEvidenceError,
  InvalidCitationError,
  InvalidTestRunError,
  InvalidDowngradeError,
  EmptyCauseError,
  type EpistemicTier,
  type TierNode,
} from '../../core/provenance/index.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { openStoreOrFail } from '../open-store.js'
import { testReceiptExists } from '../../core/runner/test-receipt-store.js'

/**
 * Ledger-backed test-run resolver — present only when a graph store exists, so
 * `agf provenance promote` stays usable standalone (back-compat) but grows teeth
 * (validated requires a real receipt) the moment a project graph is available.
 */
function ledgerTestRunResolver(dir: string): ((id: string) => boolean) | undefined {
  try {
    const store = openStoreOrFail(dir, { requireExisting: true })
    const db = store.getDb()
    return (id: string) => testReceiptExists(db, id)
  } catch {
    return undefined
  }
}

const log = createLogger({ layer: 'cli', source: 'provenance-cmd.ts' })

const TIERS: readonly EpistemicTier[] = ['claim', 'cited', 'validated', 'proven']

function isTier(value: string): value is EpistemicTier {
  return (TIERS as readonly string[]).includes(value)
}

/** Builds the `agf provenance` CLI command (Commander definition). */
export function provenanceCommand(): Command {
  log.info('provenance command registered')
  const cmd = new Command('provenance').description(
    'Escada epistêmica (claim→cited→validated→proven): promote/downgrade/hash — gates de honestidade, local',
  )

  cmd
    .command('promote')
    .description('Valida a evidência exigida para promover um node a um tier')
    .requiredOption('--node <id>', 'Node id')
    .requiredOption('--to <tier>', 'Target tier: cited|validated|proven')
    .option('--from <tier>', 'Current tier (default: claim)', 'claim')
    .option('--citation <id>', 'citation_id (para cited)')
    .option('--test-run <id>', 'test_run_id (para validated)')
    .option('--receipt <id>', 'provenance_receipt_id (para proven; use `provenance hash`)')
    .option('-d, --dir <dir>', 'Diretório do projeto (habilita a checagem de recibo no ledger)', process.cwd())
    .action(
      (opts: {
        node: string
        to: string
        from: string
        citation?: string
        testRun?: string
        receipt?: string
        dir: string
      }) => {
        const out = createCliOutput('provenance.promote')
        if (!isTier(opts.to) || !isTier(opts.from)) {
          out.err('INVALID_TIER', `tier must be one of ${TIERS.join('|')}`)
          return
        }
        try {
          const result = promoteTier({
            nodeId: opts.node,
            currentTier: opts.from,
            targetTier: opts.to,
            evidence: {
              citation_id: opts.citation,
              test_run_id: opts.testRun,
              provenance_receipt_id: opts.receipt,
            },
            resolveTestRunId: ledgerTestRunResolver(opts.dir),
          })
          out.ok(result)
        } catch (e) {
          if (
            e instanceof MissingEvidenceError ||
            e instanceof InvalidCitationError ||
            e instanceof InvalidTestRunError
          ) {
            out.fail('MISSING_EVIDENCE', getErrorMessage(e), { tier: opts.from })
            return
          }
          throw e
        }
      },
    )

  cmd
    .command('downgrade')
    .description('Reverte o tier de um node quando a evidência cai (forget-gate)')
    .requiredOption('--node <id>', 'Node id')
    .requiredOption('--from <tier>', 'Current tier: validated|proven')
    .requiredOption('--test-run <id>', 'test_run_id que falhou')
    .requiredOption('--cause <text>', 'Motivo do downgrade (não-vazio)')
    .action((opts: { node: string; from: string; testRun: string; cause: string }) => {
      const out = createCliOutput('provenance.downgrade')
      if (!isTier(opts.from)) {
        out.err('INVALID_TIER', `tier must be one of ${TIERS.join('|')}`)
        return
      }
      try {
        const result = downgradeTier({
          nodeId: opts.node,
          currentTier: opts.from,
          test_run_id: opts.testRun,
          cause: opts.cause,
        })
        out.ok(result)
      } catch (e) {
        if (e instanceof InvalidDowngradeError || e instanceof EmptyCauseError) {
          out.fail('INVALID_DOWNGRADE', getErrorMessage(e), { from: opts.from })
          return
        }
        throw e
      }
    })

  cmd
    .command('hash')
    .description('Recibo determinístico local (sha256 canônico) — habilita o tier proven sem rede')
    .option('--content <text>', 'Conteúdo literal a hashear')
    .option('--file <path>', 'Arquivo a hashear')
    .action((opts: { content?: string; file?: string }) => {
      const out = createCliOutput('provenance.hash')
      if (opts.content === undefined && opts.file === undefined) {
        out.err('MISSING_INPUT', 'forneça --content ou --file')
        return
      }
      let payload: unknown
      if (opts.file !== undefined) {
        try {
          payload = readFileSync(opts.file, 'utf8')
        } catch (e) {
          out.err('NOT_FOUND', getErrorMessage(e))
          return
        }
      } else {
        payload = opts.content
      }
      const receiptId = hashNodeCanonical(payload)
      out.ok({ receiptId, algorithm: 'sha256-canonical' })
    })

  cmd
    .command('mix')
    .description('Distribuição de tiers + flag de baixa maturidade sobre um conjunto de nodes (JSON)')
    .requiredOption('--nodes <json>', 'JSON array de {id,title,tier}')
    .action((opts: { nodes: string }) => {
      const out = createCliOutput('provenance.mix')
      let parsed: TierNode[]
      try {
        parsed = JSON.parse(opts.nodes) as TierNode[]
      } catch (e) {
        out.err('PARSE_ERROR', getErrorMessage(e))
        return
      }
      const dist = computeTierDistribution(parsed)
      out.ok({ distribution: dist, lowMaturity: isLowMaturityEpic(dist) })
    })

  return cmd
}
