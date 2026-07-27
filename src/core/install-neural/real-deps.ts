/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * real-deps — production side-effect deps for {@link runInstallNeural}.
 *
 * Extracted here (out of init-cmd.ts) so BOTH `agf init` (neural phase) and the
 * standalone `agf install-neural` command wire the exact same npm/download/verify
 * implementation — single source of truth, no drift between the two entry points.
 */

import { spawn } from 'node:child_process'
import { ensureOnnxModelDir, getOnnxProvider, isOnnxAvailable } from '../rag/onnx-embeddings.js'
import type { InstallNeuralDeps, NpmInstallResult, DownloadModelResult } from './install-neural.js'

function realNpmInstall(pkg: string): Promise<NpmInstallResult> {
  return new Promise((resolve) => {
    const start = Date.now()
    const child = spawn('npm', ['install', pkg], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', (err) => resolve({ ok: false, error: err.message }))
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, durationMs: Date.now() - start })
      else resolve({ ok: false, error: `npm install exited with code ${code ?? 'null'}` })
    })
  })
}

async function realDownloadModel(modelsDir: string): Promise<DownloadModelResult> {
  try {
    ensureOnnxModelDir(modelsDir)
    const provider = await getOnnxProvider(modelsDir)
    if (provider === null) return { ok: false, error: 'getOnnxProvider returned null' }
    return { ok: true, modelsDir }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** buildRealNeuralDeps — the production deps (npm spawn + HF download + verify). */
export function buildRealNeuralDeps(): InstallNeuralDeps {
  return {
    npmInstall: realNpmInstall,
    downloadModel: realDownloadModel,
    isOnnxAvailable,
  }
}
