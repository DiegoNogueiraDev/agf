/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * agf mrd — surfaces merge/review/deprecate candidates computed from graph
 * data already on disk (no external APIs, no embeddings).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { detectMrdCandidates } from '../../core/analyzer/merge-review-deprecate-detector.js'

/** Builds the `agf mrd` CLI command. */
export function mrdCommand(): Command {
  return new Command('mrd')
    .description('Detect merge/review/deprecate candidates in the graph (--select for token economy)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--select <path>', 'Dot-path filter no campo data do envelope (ex.: data.merge)')
    .action((opts: { dir: string }) => {
      const out = createCliOutput('mrd')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const report = detectMrdCandidates(store.toGraphDocument())
        out.ok(report)
      } finally {
        store.close()
      }
    })
}
