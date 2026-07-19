/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf install-neural` — opt into ONNX neural embeddings.
 *
 * Thin CLI wrapper over {@link runInstallNeural}. Exists as a first-class command
 * so the doctor's "degraded mode" suggestion points at something real (previously it
 * suggested the nonexistent `mcp-graph install-neural`). Reuses the shared production
 * deps from {@link buildRealNeuralDeps} so it stays byte-identical with `agf init`'s
 * neural phase.
 */

import { Command } from 'commander'
import path from 'node:path'
import {
  runInstallNeural,
  type InstallNeuralDeps,
  type InstallNeuralResult,
} from '../../core/install-neural/install-neural.js'
import { buildRealNeuralDeps } from '../../core/install-neural/real-deps.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'install-neural.ts' })

export interface InstallNeuralCliOptions {
  dir: string
  dryRun: boolean
}

/**
 * executeInstallNeural — pure orchestration (DI'd deps) shared by the command and
 * tests. Resolves the canonical models dir (<dir>/workflow-graph/models) and runs
 * the install; never throws — failures surface as a non-'ready' status.
 */
export function executeInstallNeural(
  opts: InstallNeuralCliOptions,
  deps: InstallNeuralDeps,
): Promise<InstallNeuralResult> {
  const modelsDir = path.join(path.resolve(opts.dir), 'workflow-graph', 'models')
  return runInstallNeural({ dryRun: opts.dryRun, modelsDir }, deps)
}

/** installNeuralCommand — builds the `agf install-neural` Commander definition. */
export function installNeuralCommand(): Command {
  return new Command('install-neural')
    .description('Install ONNX runtime + model to enable neural RAG embeddings')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--dry-run', 'Show what would be installed without changing anything', false)
    .action(async (opts: { dir: string; dryRun: boolean }) => {
      const out = createCliOutput('install-neural')
      try {
        const result = await executeInstallNeural({ dir: opts.dir, dryRun: opts.dryRun }, buildRealNeuralDeps())
        if (result.status === 'ready' || result.status === 'dry-run') {
          out.ok(result)
        } else {
          out.fail('NEURAL_INSTALL_FAILED', result.error ?? 'Neural install did not complete', result)
        }
      } catch (err) {
        log.error(`install-neural failed: ${getErrorMessage(err)}`)
        out.err('NEURAL_INSTALL_ERROR', getErrorMessage(err))
      }
    })
}
