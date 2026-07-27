/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { spawnSync, execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { openStoreOrFail } from '../open-store.js'
import { CodeStore } from '../../core/code/code-store.js'
import { resolveBlastTestFiles } from '../../core/code/blast-test-resolver.js'
import { selectBlastTarget } from '../../core/code/blast-target-selector.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'test-cmd.ts' })

/** Builds the `agf test` CLI command (Commander definition). */
export function testCommand(): Command {
  log.info('test command registered')
  const cmd = new Command('test').description(
    'Run vitest tests, graph-aware: default runs affected tests for current task',
  )

  cmd
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--blast', 'Run full test suite (vitest run)')
    .option('--changed', 'Run tests affected by git changes (vitest --changed)')
    .option('--file <path>', 'Test a specific file or glob pattern')
    .option('--node <id>', 'Run tests affected by symbols in a graph node')
    .option('--reporter <name>', 'Vitest reporter (default: verbose)', 'verbose')
    .action(
      async (opts: {
        dir: string
        blast?: boolean
        changed?: boolean
        file?: string
        node?: string
        reporter: string
      }) => {
        const out = createCliOutput('test')
        const projectDir = resolve(opts.dir)
        const args = ['vitest', 'run', '--reporter', opts.reporter]

        if (opts.file) {
          args.push(opts.file)
        } else if (opts.node) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            const node = store.getNodeById(opts.node)
            if (!node) {
              out.err('NOT_FOUND', `Node ${opts.node} not found`)
              return
            }
            const testFiles = node.testFiles ?? []
            if (testFiles.length > 0) {
              args.push(...testFiles)
            } else {
              out.err('NOT_FOUND', `Node ${opts.node} has no linked test files. Add testFiles metadata or use --file.`)
              return
            }
          } finally {
            store.close()
          }
        } else if (opts.changed) {
          args.push('--changed', 'HEAD')
        } else if (opts.blast) {
          // Use code-index blast radius; fall back to vitest --changed HEAD if index is empty
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            const codeStore = new CodeStore(store.getDb())
            const projectId = store.getProject()?.id ?? ''
            let changedFiles: string[] = []
            try {
              const gitOut = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: projectDir, encoding: 'utf8' })
              changedFiles = gitOut.trim().split('\n').filter(Boolean)
            } catch {
              // git not available or not a repo — skip blast radius
            }
            const testFiles = resolveBlastTestFiles(codeStore, projectId, changedFiles)
            const target = selectBlastTarget(changedFiles, testFiles)

            if (target.noOp) {
              log.info('test:blast:no-op', { reason: 'no changed files' })
              out.ok({ passed: true, ranTests: 0, noOp: true })
              return
            } else if (target.fallback) {
              // Fall back to vitest's native --changed HEAD
              args.push('--changed', 'HEAD')
              log.info('test:blast:fallback', { reason: 'code-index empty or no coverage for changed files' })
            } else {
              args.push(...target.files)
              log.info('test:blast:code-index', { files: target.files.length })
            }
          } finally {
            store.close()
          }
        } else {
          // Default: run the whole suite
        }

        log.info('test:running', { args })
        const result = spawnSync('npx', args, {
          cwd: projectDir,
          stdio: 'inherit',
          shell: true,
        })

        if (result.status === 0) {
          out.ok({ passed: true, code: result.status })
        } else {
          out.fail('TESTS_FAILED', `Tests failed with code ${result.status}`, { passed: false, code: result.status })
        }
      },
    )

  return cmd
}
