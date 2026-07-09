/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `agf doctor` checks for the optional Sentrux integration.
 *
 * WHY a separate module: doctor-checks.ts is the registry of environment probes and
 * grows every time one is added — it crossed the project's 800-line ceiling when
 * these landed. The ceiling exists to force cohesion, not to be worked around with a
 * re-export, so the Sentrux probes live where they belong: one concern, one file.
 *
 * Every check here is optional and soft-failing. Sentrux is a third-party binary the
 * user may not have; its absence is a `warning` with a suggestion, never an error and
 * never a throw. `agf doctor` must report on a machine that has nothing installed.
 *
 * Pattern (DIP): each probe has a `…With(deps)` form that takes its I/O injected, and
 * a thin production wrapper that supplies the real filesystem/exec. Tests drive the
 * former; nothing here needs a real binary to be covered.
 *
 * Consumers: doctor-runner.ts (the `--sentrux-health` surface).
 */

import path from 'node:path'
import { existsSync } from 'node:fs'
import { createLogger } from '../utils/logger.js'
import { detectSentrux, type SentruxDetectResult } from '../integrations/sentrux-adapter.js'
import type { CheckResult } from './doctor-types.js'

const log = createLogger({ layer: 'core', source: 'doctor-checks-sentrux.ts' })

/**
 * Check Sentrux integration (testable — accepts injected binary flag + basePath).
 * Validates: binary in PATH, .sentrux/rules.toml present.
 */
export function checkSentruxWith(opts: { binaryFound: boolean; basePath: string }): CheckResult {
  const rulesPath = path.join(opts.basePath, '.sentrux', 'rules.toml')

  if (!opts.binaryFound) {
    return {
      name: 'sentrux',
      level: 'warning',
      message: 'Sentrux binary not found in PATH',
      suggestion: 'Install Sentrux: see https://github.com/sentrux/sentrux#installation',
    }
  }

  if (!existsSync(rulesPath)) {
    return {
      name: 'sentrux',
      level: 'warning',
      message: 'Sentrux binary available but .sentrux/rules.toml not found',
      suggestion: `Create .sentrux/rules.toml at expected path: ${rulesPath}`,
    }
  }

  return {
    name: 'sentrux',
    level: 'ok',
    message: 'Sentrux available and .sentrux/rules.toml present',
  }
}

/**
 * Check Sentrux integration using real filesystem (production path).
 */
export function checkSentrux(basePath: string): CheckResult {
  let binaryFound = false
  try {
    const pathDirs = (process.env['PATH'] ?? '').split(path.delimiter)
    binaryFound = pathDirs.some(
      (dir) => existsSync(path.join(dir, 'sentrux')) || existsSync(path.join(dir, 'sentrux.exe')),
    )
  } catch (err) {
    log.debug('sentrux binary probe failed', { err: String(err) })
  }
  return checkSentruxWith({ binaryFound, basePath })
}

/**
 * Check Sentrux binary health by actually invoking `sentrux --version`
 * (testable — accepts an injected detector). Never throws: detectSentrux
 * soft-fails to {available: false} when the binary is absent or errors.
 */
export async function checkSentruxHealthSafeWith(detect: () => Promise<SentruxDetectResult>): Promise<CheckResult> {
  const result = await detect()
  if (result.available) {
    return {
      name: 'sentrux-health',
      level: 'ok',
      message: `Sentrux ${result.version} detected`,
    }
  }
  return {
    name: 'sentrux-health',
    level: 'warning',
    message: 'Sentrux binary not detected',
    suggestion: result.hint,
  }
}

/**
 * Check Sentrux binary health using the real detectSentrux (production path).
 */
export function checkSentruxHealthSafe(): Promise<CheckResult> {
  return checkSentruxHealthSafeWith(detectSentrux)
}
