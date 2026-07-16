/*!
 * `agf ac` — AC quality commands.
 * Task node_836654d6a6c9. lint subcommand: node_wire_86ecb1a9b0b0.
 * suggest subcommand: node_wire_171ebe1ab311.
 *
 * Subcommands:
 *   harden <id>  — rewrites weak ACs on a node to GWT skeleton; supports --dry-run
 *   lint <id>    — flags vague/untestable quality terms in a node's ACs
 *   suggest <id> — suggests standard edge-case ACs (empty_input/error_path/boundary/concurrency)
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { rewriteWeakAcs } from '../../core/analyzer/ac-harden.js'
import { injectNfrAc } from '../../core/analyzer/nfr-ac-injector.js'
import { lintAcsBatch } from '../../core/analyzer/ac-linter.js'
import { suggestEdgeCaseAcs } from '../../core/analyzer/edge-case-suggester.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'ac-cmd.ts' })

export function acCommand(): Command {
  log.info('ac command registered')
  const cmd = new Command('ac').description('AC quality tools')

  cmd.addCommand(
    new Command('harden')
      .description('Rewrite weak ACs on a node to Given-When-Then skeleton')
      .argument('<id>', 'Node ID')
      .option('--dry-run', 'Show proposed rewrites without modifying the graph', false)
      .option('-d, --dir <dir>', 'Project directory', process.cwd())
      .action((id: string, opts: { dryRun: boolean; dir: string }) => {
        const out = createCliOutput('ac.harden')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const node = store.getNodeById(id)
          if (!node) {
            out.err('NOT_FOUND', `Node not found: ${id}`)
            return
          }

          const acs: string[] = Array.isArray(node.acceptanceCriteria) ? node.acceptanceCriteria : []
          const rewrites = rewriteWeakAcs(acs)
          const weakRewrites = rewrites.filter((r) => r.wasWeak)

          if (!opts.dryRun && weakRewrites.length > 0) {
            const updated = rewrites.map((r) => r.rewritten)
            store.updateNode(id, { acceptanceCriteria: updated })
          }

          out.ok({
            nodeId: id,
            dryRun: opts.dryRun,
            totalAcs: acs.length,
            weakCount: weakRewrites.length,
            rewrites: rewrites.map((r) => ({
              original: r.original,
              rewritten: r.rewritten,
              wasWeak: r.wasWeak,
            })),
          })
        } finally {
          store.close()
        }
      }),
  )

  cmd.addCommand(
    new Command('nfr')
      .description('Inject a measurable NFR AC stub into a node')
      .argument('<id>', 'Node ID')
      .option(
        '--kind <kind>',
        'NFR kind: perf|performance|security|a11y|accessibility|reliability|scalability',
        'performance',
      )
      .option('--dry-run', 'Show proposed AC without modifying the graph', false)
      .option('-d, --dir <dir>', 'Project directory', process.cwd())
      .action((id: string, opts: { kind: string; dryRun: boolean; dir: string }) => {
        const out = createCliOutput('ac.nfr')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const node = store.getNodeById(id)
          if (!node) {
            out.err('NOT_FOUND', `Node not found: ${id}`)
            return
          }
          let injection
          try {
            injection = injectNfrAc(id, opts.kind)
          } catch (err) {
            out.err('INVALID_KIND', err instanceof Error ? err.message : String(err))
            return
          }
          if (!opts.dryRun) {
            const existing: string[] = Array.isArray(node.acceptanceCriteria) ? node.acceptanceCriteria : []
            store.updateNode(id, { acceptanceCriteria: [...existing, injection.acText] })
          }
          out.ok({ ...injection, dryRun: opts.dryRun })
        } finally {
          store.close()
        }
      }),
  )

  cmd.addCommand(
    new Command('lint')
      .description("Flag vague/untestable quality terms in a node's acceptance criteria")
      .argument('<id>', 'Node ID')
      .option('-d, --dir <dir>', 'Project directory', process.cwd())
      .action((id: string, opts: { dir: string }) => {
        const out = createCliOutput('ac.lint')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const node = store.getNodeById(id)
          if (!node) {
            out.err('NOT_FOUND', `Node not found: ${id}`)
            return
          }

          const acs: string[] = Array.isArray(node.acceptanceCriteria) ? node.acceptanceCriteria : []
          const results = lintAcsBatch(acs)

          out.ok({
            nodeId: id,
            totalAcs: acs.length,
            ambiguousCount: results.length,
            results,
          })
        } finally {
          store.close()
        }
      }),
  )

  cmd.addCommand(
    new Command('suggest')
      .description('Suggest standard edge-case ACs (empty_input/error_path/boundary/concurrency) for a node')
      .argument('<id>', 'Node ID')
      .option('--dry-run', 'Show suggestions without appending them to the graph', false)
      .option('-d, --dir <dir>', 'Project directory', process.cwd())
      .action((id: string, opts: { dryRun: boolean; dir: string }) => {
        const out = createCliOutput('ac.suggest')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const node = store.getNodeById(id)
          if (!node) {
            out.err('NOT_FOUND', `Node not found: ${id}`)
            return
          }

          const suggestions = suggestEdgeCaseAcs({
            title: node.title,
            description: node.description,
            type: node.type,
          })

          if (!opts.dryRun && suggestions.length > 0) {
            const existing: string[] = Array.isArray(node.acceptanceCriteria) ? node.acceptanceCriteria : []
            const additions = suggestions.map((s) => s.acText)
            store.updateNode(id, { acceptanceCriteria: [...existing, ...additions] })
          }

          out.ok({
            nodeId: id,
            dryRun: opts.dryRun,
            suggestionCount: suggestions.length,
            suggestions,
          })
        } finally {
          store.close()
        }
      }),
  )

  return cmd
}
