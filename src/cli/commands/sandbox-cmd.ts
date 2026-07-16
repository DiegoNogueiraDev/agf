/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * agf sandbox — wires the Wave-12 sandbox module's dormant primitives into a
 * real CLI surface. `detect` is deterministic, filesystem-only stack
 * detection (zero subprocess/container spawning). `build` wires executeBuild
 * (node_wire_7b67ba16613c), scoped to `isolation: 'process'` only — docker/
 * podman isolation remain a separate follow-up left for a dedicated design
 * pass, not bundled here.
 */

import { Command } from 'commander'
import { detectStack } from '../../core/sandbox/stack-detector.js'
import { executeBuild, type BuilderProfile } from '../../core/sandbox/builder-executor.js'
import { FallbackResolver } from '../../core/sandbox/fallback-resolver.js'
import { updateGraphFromReport } from '../../core/sandbox/reporter.js'
import { SANDBOX_ARCHITECTURE } from '../../core/sandbox/sandbox-architecture.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'

const log = createLogger({ layer: 'cli', source: 'sandbox-cmd.ts' })

/** Mirrors builder-executor.ts's own DEFAULT_TIMEOUT_MS (not exported). */
const DEFAULT_TIMEOUT_MS = 300_000

/** Builds the `agf sandbox` CLI command (Commander definition). */
export function sandboxCommand(): Command {
  log.info('sandbox command registered')
  const cmd = new Command('sandbox').description('Wave-12 sandbox: stack detection and process-isolated builds')

  cmd
    .command('detect')
    .description('Detect the build/test stack (npm/maven/gradle/go/pip) via marker files, no subprocess spawn')
    .option('-d, --dir <dir>', 'Diretório do projeto a inspecionar', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('sandbox.detect')
      const result = detectStack(opts.dir)
      out.ok(result)
    })

  cmd
    .command('build')
    .description('Run a build/test command under process isolation, capturing stdout/stderr with a hard timeout')
    .requiredOption('--command <command>', 'Program to execute (no shell interpretation)')
    .option('--args <args>', 'Comma-separated command arguments')
    .option('--work-dir <dir>', 'Working directory for the child process', process.cwd())
    .option('--timeout-ms <ms>', 'Hard timeout in ms before SIGKILL', String(DEFAULT_TIMEOUT_MS))
    .option('--profile <profile>', 'Profile label forwarded to the Reporter (ci-mirror|fast|full)', 'ci-mirror')
    .option(
      '--node <id>',
      'Graph node to update via the Reporter (blocks on failure, unblocks a blocked task on success)',
    )
    .option('-d, --dir <dir>', 'Project directory (required with --node)', process.cwd())
    .action(
      async (opts: {
        command: string
        args?: string
        workDir: string
        timeoutMs: string
        profile: string
        node?: string
        dir: string
      }) => {
        const out = createCliOutput('sandbox.build')
        const result = await executeBuild({
          command: opts.command,
          args: opts.args ? opts.args.split(',').map((a) => a.trim()) : [],
          workDir: opts.workDir,
          isolation: 'process',
          timeoutMs: parseInt(opts.timeoutMs, 10) || DEFAULT_TIMEOUT_MS,
          profile: opts.profile as BuilderProfile,
        })
        if (opts.node) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          const graphUpdate = updateGraphFromReport(store, opts.node, {
            success: result.success,
            status: result.status,
          })
          out.ok({ ...result, graphUpdate })
          return
        }
        out.ok(result)
      },
    )

  cmd
    .command('architecture')
    .description('Print the Wave-12 sandbox functional architecture document (5 layers, key constraints)')
    .action(() => {
      const out = createCliOutput('sandbox.architecture')
      out.ok(SANDBOX_ARCHITECTURE)
    })

  cmd
    .command('resolve-isolation')
    .description(
      'Probe docker/podman/process availability and resolve the isolation mode `agf sandbox build` would fall back to',
    )
    .action(async () => {
      const out = createCliOutput('sandbox.resolve-isolation')
      const resolver = new FallbackResolver()
      const [docker, podman, proc] = await Promise.all([
        resolver.checkDockerAvailability(),
        resolver.checkPodmanAvailability(),
        resolver.checkProcessAvailability(),
      ])
      const result = resolver.resolveExecutionMode({ docker, podman, process: proc })
      out.ok(result)
    })

  return cmd
}
