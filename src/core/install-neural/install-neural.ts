/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * install-neural — orchestrates the opt-in to neural ONNX embeddings.
 *
 * Decision rationale: ADR-0055 (optional ONNX dependency) and
 * ADR-0056 (EmbeddingProvider interface).
 *
 * Three steps, fail-fast in order:
 *   1. `npm install onnxruntime-node` — the runtime (NOT saved to package.json)
 *   2. download the all-MiniLM-L6-v2 model files from Hugging Face
 *   3. verify ONNX is loadable post-install
 *
 * Pure orchestration with DI'd side-effect deps so the unit test can run
 * without spawning a real npm or hitting the network.
 */

export interface NpmInstallResult {
  readonly ok: boolean
  readonly durationMs?: number
  readonly error?: string
}

export interface DownloadModelResult {
  readonly ok: boolean
  readonly modelsDir?: string
  readonly error?: string
}

export interface InstallNeuralDeps {
  readonly npmInstall: (pkg: string) => Promise<NpmInstallResult>
  readonly downloadModel: (modelsDir: string) => Promise<DownloadModelResult>
  readonly isOnnxAvailable: () => Promise<boolean>
}

export interface InstallNeuralOptions {
  readonly dryRun: boolean
  readonly modelsDir: string
}

export type StepStatus = 'ok' | 'failed' | 'skipped'

export interface InstallNeuralResult {
  readonly status: 'ready' | 'degraded' | 'failed' | 'dry-run'
  readonly steps: {
    readonly npmInstall: StepStatus
    readonly downloadModel: StepStatus
    readonly verify: StepStatus
  }
  readonly plannedActions?: readonly string[]
  readonly error?: string
}

/** runInstallNeural —  */
export async function runInstallNeural(
  opts: InstallNeuralOptions,
  deps: InstallNeuralDeps,
): Promise<InstallNeuralResult> {
  if (opts.dryRun) {
    return {
      status: 'dry-run',
      steps: { npmInstall: 'skipped', downloadModel: 'skipped', verify: 'skipped' },
      plannedActions: [
        'npm install onnxruntime-node',
        `download all-MiniLM-L6-v2 model to ${opts.modelsDir}`,
        'verify ONNX provider availability',
      ],
    }
  }

  const npmResult = await deps.npmInstall('onnxruntime-node')
  if (!npmResult.ok) {
    return {
      status: 'failed',
      steps: { npmInstall: 'failed', downloadModel: 'skipped', verify: 'skipped' },
      error: npmResult.error ?? 'npm install failed',
    }
  }

  const downloadResult = await deps.downloadModel(opts.modelsDir)
  if (!downloadResult.ok) {
    return {
      status: 'failed',
      steps: { npmInstall: 'ok', downloadModel: 'failed', verify: 'skipped' },
      error: downloadResult.error ?? 'model download failed',
    }
  }

  const available = await deps.isOnnxAvailable()
  if (!available) {
    return {
      status: 'degraded',
      steps: { npmInstall: 'ok', downloadModel: 'ok', verify: 'failed' },
      error: 'onnxruntime-node installed but unavailable at runtime',
    }
  }

  return {
    status: 'ready',
    steps: { npmInstall: 'ok', downloadModel: 'ok', verify: 'ok' },
  }
}
