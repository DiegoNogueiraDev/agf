/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * agf sandbox — wires the Wave-12 sandbox module's dormant primitives into a
 * real CLI surface. Scoped narrowly to `detect` (deterministic, filesystem-
 * only stack detection, zero subprocess/container spawning) — the riskier
 * build-execution surface (executeBuild, docker/podman isolation) is a
 * separate follow-up left for a dedicated design pass, not bundled here.
 */

import { Command } from 'commander'
import { detectStack } from '../../core/sandbox/stack-detector.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'sandbox-cmd.ts' })

/** Builds the `agf sandbox` CLI command (Commander definition). */
export function sandboxCommand(): Command {
  log.info('sandbox command registered')
  const cmd = new Command('sandbox').description('Wave-12 sandbox: stack detection and (future) isolated builds')

  cmd
    .command('detect')
    .description('Detect the build/test stack (npm/maven/gradle/go/pip) via marker files, no subprocess spawn')
    .option('-d, --dir <dir>', 'Diretório do projeto a inspecionar', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('sandbox.detect')
      const result = detectStack(opts.dir)
      out.ok(result)
    })

  return cmd
}
