/*!
 * knowledge-compile-cmd — agf knowledge-compile <sourceId> CLI command.
 * Task node_wire_60385c4b95c7.
 *
 * WHY: Exposes compileSource/upsertSource as a CLI tool so raw knowledge text
 * can be ingested and structured into a CompiledPage without a bespoke script.
 * Recompiling the same sourceId replaces the page in-place (version++).
 *
 * Composes with: compile-source.ts (core).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { compileSource, upsertSource } from '../../core/knowledge/compile-source.js'
import { McpGraphError } from '../../core/utils/errors.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'knowledge-compile-cmd.ts' })

/** Builds the `agf knowledge-compile` CLI command. */
export function knowledgeCompileCommand(): Command {
  log.info('knowledge-compile command registered')
  return new Command('knowledge-compile')
    .description('Ingere/compila uma source em CompiledPage (structured + links + version)')
    .argument('<sourceId>', 'Identificador da source')
    .option('--content <text>', 'Conteúdo bruto da source — se informado, ingere antes de compilar')
    .option('--ref <id...>', 'IDs de sources referenciadas (repetível) — viram links[]')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--json', 'Força saída em JSON envelope')
    .action((sourceId: string, opts: { content?: string; ref?: string[]; dir: string; json?: boolean }) => {
      const out = createCliOutput('knowledge-compile')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const db = store.getDb()
        if (opts.content !== undefined) {
          upsertSource(db, sourceId, opts.content, opts.ref ?? [])
        }
        const page = compileSource(db, sourceId)
        out.ok(page)
      } catch (err) {
        if (err instanceof McpGraphError) {
          out.err('NOT_FOUND', err.message)
          return
        }
        throw err
      } finally {
        store.close()
      }
    })
}
