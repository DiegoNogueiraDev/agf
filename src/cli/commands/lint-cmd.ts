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

export interface LintOptions {
  fix?: boolean
  file?: string
  all?: boolean
}

export interface LintInvocation {
  command: string
  args: string[]
  /** MUST stay false: shell:true concatenates the user --file into a shell string (CWE-78). */
  shell: boolean
}

/**
 * Build the eslint invocation. Runs `npx eslint …` with args as literal argv and
 * `shell: false`, so a user-supplied `--file` (a path or glob) can never be interpreted
 * by a shell — eslint expands globs itself. Passing an args array with `shell: true`
 * concatenates unescaped (Node DEP0190) and lets `--file 'x; rm -rf ~'` inject commands.
 */
export function buildLintInvocation(opts: LintOptions): LintInvocation {
  const args = ['eslint']
  if (opts.fix) args.push('--fix')
  if (opts.file) {
    args.push(opts.file)
  } else if (!opts.all) {
    args.push('--ext', '.ts,.tsx')
    args.push('src/')
  }
  return { command: 'npx', args, shell: false }
}

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
      const { command, args, shell } = buildLintInvocation(opts)

      log.info('lint:running', { args })
      const result = spawnSync(command, args, {
        cwd: projectDir,
        stdio: 'inherit',
        shell,
      })

      if (result.status === 0) {
        out.ok({ passed: true, code: result.status })
      } else {
        out.fail('LINT_FAILED', `Lint failed with code ${result.status}`, { passed: false, code: result.status })
      }
    })

  return cmd
}
