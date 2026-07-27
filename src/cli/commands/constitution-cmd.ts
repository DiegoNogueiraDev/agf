/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { ConstitutionChecker, type CheckNodeResult } from '../../core/constitution/constitution-checker.js'
import {
  getBuiltinConstitution,
  listBuiltinConstitutions,
  KARPATHY_BASELINE_NAME,
} from '../../core/constitution/built-in-constitutions.js'
import { detectKarpathyDrift, type KarpathyDrift } from '../../core/hooks/karpathy-drift-detector.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'constitution-cmd.ts' })

interface NodeLookupStore {
  getNodeById(id: string): { id: string; title: string; description?: string } | null
}

export function listConstitutionLines(): string[] {
  const lines: string[] = ['Constitutions built-in:']
  for (const c of listBuiltinConstitutions()) {
    lines.push(`  ${c.name}  (${c.principleCount} princípios) — ${c.description}`)
  }
  const baseline = getBuiltinConstitution(KARPATHY_BASELINE_NAME)
  if (baseline) {
    lines.push('')
    lines.push(`Princípios de ${baseline.name}:`)
    for (const p of baseline.principles) {
      const mark = p.enforceable ? '⊗ enforceable' : '· advisory'
      lines.push(`  ${p.title.padEnd(24)} [${mark}]`)
    }
  }
  return lines
}

export function checkNodeAgainstConstitution(store: NodeLookupStore, nodeId: string): CheckNodeResult | null {
  const node = store.getNodeById(nodeId)
  if (!node) return null
  const baseline = getBuiltinConstitution(KARPATHY_BASELINE_NAME)
  const checker = new ConstitutionChecker(baseline?.principles ?? [])
  return checker.checkNode({ id: node.id, title: node.title, description: node.description ?? null })
}

/**
 * Compares a vendored upstream principles doc (`## heading` sections) against
 * this project's local copy, so drift from an upstream source (e.g. the
 * karpathy-baseline's `upstream` repo) can be caught instead of silently rotting.
 */
export function checkConstitutionDrift(vendorPath: string, rulesPath: string): KarpathyDrift {
  const vendorContent = readFileSync(vendorPath, 'utf8')
  const rulesContent = readFileSync(rulesPath, 'utf8')
  return detectKarpathyDrift(vendorContent, rulesContent)
}

/** Builds the `agf constitution` CLI command (Commander definition). */
export function constitutionCommand(): Command {
  log.info('constitution command registered')
  return new Command('constitution')
    .description('Manage project principles (list, check)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--list', 'List built-in constitutions and principles')
    .option('--check <nodeId>', 'Check a graph node against the constitution')
    .option('--create <title>', 'Create a custom principle')
    .option('--drift-vendor <path>', 'Vendored upstream principles doc (used with --drift-rules)')
    .option('--drift-rules <path>', 'Local principles doc to compare against --drift-vendor')
    .action(
      (opts: {
        dir: string
        list?: boolean
        check?: string
        create?: string
        driftVendor?: string
        driftRules?: string
      }) => {
        const out = createCliOutput('constitution')

        if (typeof opts.create === 'string') {
          out.err('UNSUPPORTED', 'Princípios custom não são suportados pelo CLI — use os bundles built-in (--list).')
          return
        }
        if (typeof opts.driftVendor === 'string' || typeof opts.driftRules === 'string') {
          if (!opts.driftVendor || !opts.driftRules) {
            out.err('MISSING_ARG', '--drift-vendor e --drift-rules devem ser usados juntos.')
            return
          }
          try {
            out.ok(checkConstitutionDrift(opts.driftVendor, opts.driftRules))
          } catch (err) {
            out.err('NOT_FOUND', err instanceof Error ? err.message : String(err))
          }
          return
        }
        if (typeof opts.check === 'string') {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            const result = checkNodeAgainstConstitution(store, opts.check)
            if (!result) {
              out.err('NOT_FOUND', `Node desconhecido: ${opts.check}.`)
              return
            }
            out.ok({
              nodeId: result.nodeId,
              passed: result.passed,
              principlesChecked: result.principlesChecked,
              passRate: result.passRate,
              violations: result.violations,
            })
          } finally {
            store.close()
          }
          return
        }
        const entries = listBuiltinConstitutions().map((c) => ({
          name: c.name,
          principleCount: c.principleCount,
          description: c.description,
        }))
        const baseline = getBuiltinConstitution(KARPATHY_BASELINE_NAME)
        out.ok({
          constitutions: entries,
          principles: baseline?.principles.map((p) => ({
            title: p.title,
            enforceable: p.enforceable,
          })),
        })
      },
    )
}
