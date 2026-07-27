/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { findUnwiredMockBranches } from '../../core/harness/wire-check.js'

const log = createLogger({ layer: 'cli', source: 'wire-check-cmd.ts' })

/** Builds the `agf wire-check` CLI command (Commander definition). */
export function wireCheckCommand(): Command {
  log.info('wire-check command registered')
  return new Command('wire-check')
    .description('Signal mock-gated branches (useMock=false, !mock) never activated by any real (non-test) caller')
    .argument('<file>', 'Arquivo a verificar (relativo ao projeto)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((file: string, opts: { dir: string }) => {
      const out = createCliOutput('wire-check')
      const targetPath = join(opts.dir, file)
      if (!existsSync(targetPath)) {
        out.err('NOT_FOUND', `Arquivo não encontrado: ${file}`)
        return
      }

      const target = { path: file, content: readFileSync(targetPath, 'utf-8') }
      const allFiles = globSync('src/**/*.{ts,tsx}', { cwd: opts.dir, ignore: ['**/node_modules/**'] })
        .filter((p) => p !== file)
        .map((p) => ({ path: p, content: readFileSync(join(opts.dir, p), 'utf-8') }))

      const unwired = findUnwiredMockBranches(target, [target, ...allFiles])
      out.ok({ file, unwiredBranches: unwired })
    })
}
