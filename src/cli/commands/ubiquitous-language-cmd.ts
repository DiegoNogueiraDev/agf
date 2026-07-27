/*!
 * ubiquitous-language-cmd — agf ubiquitous-language CLI command.
 *
 * WHY: Exposes ubiquitous-language.ts (§EPIC-8.T04) — parse + merge + render
 * the '## Vocabulário Canonical' section of a project's domain-vocabulary
 * doc (default CONTEXT.md). Its own docblock named an MCP tool as the
 * intended caller, but this transform is pure and needs no MCP server —
 * a direct file read/merge/write CLI wire is the mechanical, correct fit.
 *
 * Composes with: ubiquitous-language.ts (core, pure string transforms).
 */

import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createCliOutput } from '../shared/cli-output.js'
import {
  parseVocab,
  mergeVocab,
  renderVocabSection,
  upsertVocabSection,
  type VocabTerm,
} from '../../core/knowledge/ubiquitous-language.js'
import { createLogger } from '../../core/utils/logger.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'ubiquitous-language-cmd.ts' })
const DEFAULT_FILE = 'CONTEXT.md'

function readDoc(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf-8') : ''
}

/** Builds the `agf ubiquitous-language` CLI command (Commander definition). */
export function ubiquitousLanguageCommand(): Command {
  log.info('ubiquitous-language command registered')
  const cmd = new Command('ubiquitous-language')
    .description('Vocabulário canonical do domínio — seção "## Vocabulário Canonical" em CONTEXT.md')
    .enablePositionalOptions()

  const fileOpt = (c: Command): Command => c.option('--file <path>', 'Arquivo de destino', DEFAULT_FILE)

  fileOpt(cmd.command('list').description('Lista os termos já registrados')).action((opts: { file: string }) => {
    const out = createCliOutput('ubiquitous-language.list')
    out.ok({ terms: parseVocab(readDoc(opts.file)) })
  })

  fileOpt(
    cmd
      .command('add <term> <definition>')
      .description('Adiciona (ou completa) um termo no vocabulário canonical')
      .option('--avoid <text>', 'Nota de anti-padrão a evitar'),
  ).action((term: string, definition: string, opts: { file: string; avoid?: string }) => {
    const out = createCliOutput('ubiquitous-language.add')
    try {
      const doc = readDoc(opts.file)
      const existing = parseVocab(doc)
      const incoming: VocabTerm = { term, definition, ...(opts.avoid ? { avoid: opts.avoid } : {}) }
      const merged = mergeVocab(existing, [incoming])
      const section = renderVocabSection(merged)
      writeFileSync(opts.file, upsertVocabSection(doc, section))
      out.ok({ terms: merged })
    } catch (err) {
      out.err('CONFLICT', getErrorMessage(err))
    }
  })

  return cmd
}
