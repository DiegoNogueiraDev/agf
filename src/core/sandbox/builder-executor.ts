/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Wave-12 Sandbox — Builder Executor (Camada 2: Runner)
 *
 * Executes a build/test command under an isolation strategy, captures stdout
 * and stderr, enforces a hard timeout, and reports a normalized outcome. This
 * iteration ships **process isolation only** — Docker and Podman paths are
 * declared in the schema but will land in follow-up subtasks
 * (`node_0a4d4b371422` Docker, `node_39b52afc6313` Podman). Requesting them
 * now throws a clear error so callers do not silently run under the wrong
 * isolation guarantee.
 *
 * Policy highlights:
 *   - Timeout uses SIGKILL (hard-kill) per Wave-12 constraint — a SIGTERM
 *     grace period is inadequate for the predictability this layer promises.
 *   - Profile (ci-mirror / fast / full) is currently metadata-only; process
 *     isolation does not differentiate behavior across profiles, but the
 *     BuilderResult preserves the requested profile for the Reporter layer.
 *   - stdout/stderr are captured as UTF-8 strings; binary stacks (Java
 *     surefire, etc.) remain lossless because parsers inside the Reporter
 *     consume the text representations.
 */

import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { SandboxError } from '../errors/sandbox-error.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'builder-executor.ts' })

const DEFAULT_CONTAINER_IMAGE = 'node:20'

export type BuilderStatus = 'success' | 'failure' | 'error' | 'timeout'
export type BuilderProfile = 'ci-mirror' | 'fast' | 'full'
export type BuilderIsolation = 'process' | 'docker' | 'podman'

export interface BuilderExecutorOptions {
  /** Program to execute. No shell interpretation unless you spawn one explicitly. */
  command: string
  /** Command arguments. */
  args?: string[]
  /** Working directory for the child process. */
  workDir?: string
  /** Isolation mechanism: process, docker, or podman. */
  isolation: BuilderIsolation
  /** Hard timeout. Default: 300_000 (5 min). */
  timeoutMs?: number
  /** Profile label forwarded to the Reporter. Default: `ci-mirror`. */
  profile?: BuilderProfile
  /** Extra environment variables (merged onto `process.env`). */
  env?: Record<string, string>
  /** Container image override for docker/podman isolation. Default: `node:20`. */
  containerImage?: string
}

export interface BuilderResult {
  success: boolean
  status: BuilderStatus
  /** Process exit code. `null` when killed by a signal. */
  exitCode: number | null
  /** Signal that terminated the process, if any. */
  signal: string | null
  stdout: string
  stderr: string
  durationMs: number
  isolation: BuilderIsolation
  profile: BuilderProfile
}

const DEFAULT_TIMEOUT_MS = 300_000

function resolveWorkDir(isolation: BuilderIsolation, workDir?: string): string {
  if (workDir) return workDir
  if (isolation === 'process') return process.cwd()
  return mkdtempSync(join(tmpdir(), 'agf-sandbox-'))
}

export function buildContainerArgs(
  isolation: 'docker' | 'podman',
  containerImage: string,
  workDir: string,
  command: string,
  args: string[],
): string[] {
  return ['run', '--rm', '-v', `${workDir}:/work`, '-w', '/work', containerImage, command, ...args]
}

function executeWithSpawn(
  runtime: string,
  spawnArgs: string[],
  options: {
    workDir: string
    timeoutMs: number
    profile: BuilderProfile
    isolation: BuilderIsolation
    env?: Record<string, string>
  },
): Promise<BuilderResult> {
  const { workDir, timeoutMs, profile, isolation, env } = options
  const startedAt = Date.now()
  const mergedEnv = env ? { ...process.env, ...env } : process.env

  return new Promise<BuilderResult>((resolve) => {
    const child = spawn(runtime, spawnArgs, {
      cwd: workDir,
      env: mergedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch (err) {
        log.debug('intentional-swallow', { error: String(err), reason: 'process already gone' })
      }
    }, timeoutMs)

    const finish = (status: BuilderStatus, exitCode: number | null, signal: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const durationMs = Date.now() - startedAt
      const success = status === 'success'
      log.debug('sandbox:builder:finished', {
        status,
        exitCode: String(exitCode ?? 'null'),
        signal: String(signal ?? 'null'),
        durationMs: String(durationMs),
        profile,
        isolation,
      })
      resolve({
        success,
        status,
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs,
        isolation,
        profile,
      })
    }

    child.on('error', (err: Error) => {
      log.warn('sandbox:builder:spawn-error', { error: err.message })
      finish('error', null, null)
    })

    child.on('exit', (code, signal) => {
      if (timedOut) {
        finish('timeout', code, signal)
        return
      }
      if (code === 0) {
        finish('success', 0, signal)
      } else {
        finish('failure', code, signal)
      }
    })
  })
}

export async function executeBuild(options: BuilderExecutorOptions): Promise<BuilderResult> {
  const {
    command,
    args = [],
    isolation,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    profile = 'ci-mirror',
    env,
    containerImage = DEFAULT_CONTAINER_IMAGE,
  } = options

  const workDir = resolveWorkDir(isolation, options.workDir)

  if (isolation === 'process') {
    return executeWithSpawn(command, args, { workDir, timeoutMs, profile, isolation, env })
  }

  if (isolation === 'docker' || isolation === 'podman') {
    const runtime = isolation === 'docker' ? 'docker' : 'podman'
    const spawnArgs = buildContainerArgs(isolation, containerImage, workDir, command, args)
    return executeWithSpawn(runtime, spawnArgs, { workDir, timeoutMs, profile, isolation, env })
  }

  throw new SandboxError(`Unsupported isolation: "${isolation}"`)
}
