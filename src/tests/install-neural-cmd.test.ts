/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { installNeuralCommand, executeInstallNeural } from '../cli/commands/install-neural-cmd.js'
import { buildRealNeuralDeps } from '../core/install-neural/real-deps.js'
import type { InstallNeuralDeps } from '../core/install-neural/install-neural.js'

function stubDeps(overrides: Partial<InstallNeuralDeps> = {}): InstallNeuralDeps {
  return {
    npmInstall: async () => ({ ok: true }),
    downloadModel: async (modelsDir) => ({ ok: true, modelsDir }),
    isOnnxAvailable: async () => true,
    ...overrides,
  }
}

describe('installNeuralCommand', () => {
  it('registers a Commander command named install-neural with a --dir option', () => {
    const cmd = installNeuralCommand()
    expect(cmd.name()).toBe('install-neural')
    const flags = cmd.options.map((o) => o.long)
    expect(flags).toContain('--dir')
    expect(flags).toContain('--dry-run')
  })
})

describe('executeInstallNeural', () => {
  it('installs the model under <dir>/workflow-graph/models and reports ready', async () => {
    let received = ''
    const deps = stubDeps({
      downloadModel: async (modelsDir) => {
        received = modelsDir
        return { ok: true, modelsDir }
      },
    })
    const result = await executeInstallNeural({ dir: '/proj', dryRun: false }, deps)
    expect(result.status).toBe('ready')
    expect(received).toBe(join('/proj', 'workflow-graph', 'models'))
  })

  it('propagates a failed status without throwing when npm install fails', async () => {
    const deps = stubDeps({ npmInstall: async () => ({ ok: false, error: 'boom' }) })
    const result = await executeInstallNeural({ dir: '/proj', dryRun: false }, deps)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('boom')
  })

  it('returns planned actions on dry-run without side effects', async () => {
    let called = false
    const deps = stubDeps({
      npmInstall: async () => {
        called = true
        return { ok: true }
      },
    })
    const result = await executeInstallNeural({ dir: '/proj', dryRun: true }, deps)
    expect(result.status).toBe('dry-run')
    expect(called).toBe(false)
    expect(result.plannedActions?.length).toBeGreaterThan(0)
  })
})

describe('buildRealNeuralDeps', () => {
  it('wires the three side-effect dependencies runInstallNeural needs', () => {
    const deps = buildRealNeuralDeps()
    expect(typeof deps.npmInstall).toBe('function')
    expect(typeof deps.downloadModel).toBe('function')
    expect(typeof deps.isOnnxAvailable).toBe('function')
  })
})
