/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-sentrux-adoption — Task 1.2: Sentrux presence detection with soft-fail.
 *
 * Runs `sentrux --version`. Returns {available, version} on success or
 * {available: false, hint} on absence. Never throws.
 *
 * The exec function is injectable for testing without module-level mocks.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'sentrux-adapter.ts' })

const execAsync = promisify(execFile)

const INSTALL_HINT = 'brew install sentrux/tap/sentrux'

export type SentruxDetectResult = { available: true; version: string } | { available: false; hint: string }

type ExecFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>

async function defaultExec(cmd: string, args: string[]): Promise<{ stdout: string }> {
  return execAsync(cmd, args)
}

export async function detectSentrux(exec: ExecFn = defaultExec): Promise<SentruxDetectResult> {
  try {
    const { stdout } = await exec('sentrux', ['--version'])
    const version = stdout.trim()
    log.info('sentrux:detected', { version })
    return { available: true, version }
  } catch {
    log.warn('sentrux:absent', { hint: INSTALL_HINT })
    return { available: false, hint: INSTALL_HINT }
  }
}
