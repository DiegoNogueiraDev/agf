/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'lint-cmd.ts' })

/** Builds the `agf lint` CLI command (Commander definition). */
export function lintCommand(): Command {
  log.info('lint command registered')
  const cmd = new Command('lint').description('Run eslint on affected files (graph-aware) or entire project')

  cmd
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--fix', 'Auto-fix lint issues')
    .option('--file <path>', 'Lint a specific file or glob')
    .option('--all', 'Lint entire project (not just changed files)')
    .action(async (opts: { dir: string; fix?: boolean; file?: string; all?: boolean }) => {
      const out = createCliOutput('lint')
      const projectDir = resolve(opts.dir)
      const args = ['eslint']

      if (opts.fix) args.push('--fix')

      if (opts.file) {
        args.push(opts.file)
      } else if (!opts.all) {
        args.push('--ext', '.ts,.tsx')
        args.push('src/')
      }

      log.info('lint:running', { args })
      const result = spawnSync('npx', args, {
        cwd: projectDir,
        stdio: 'inherit',
        shell: true,
      })

      if (result.status === 0) {
        out.ok({ passed: true, code: result.status })
      } else {
        out.fail('LINT_FAILED', `Lint failed with code ${result.status}`, { passed: false, code: result.status })
      }
    })

  return cmd
}
