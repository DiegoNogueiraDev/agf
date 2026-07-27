/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { spawn } from 'node:child_process'
import type { HookEvent } from './hook-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'shell-handler.ts' })

/**
 * Shell-handler runner. Mirrors the Claude Code hook contract:
 *  - stdin: JSON of the HookEvent (single line + EOF)
 *  - exit 0   → pass (no-op)
 *  - exit 2   → block; stderr is propagated as the block reason
 *  - other    → warn (non-fatal); stderr logged
 * Timeout default 5000 ms; SIGKILL on overrun.
 * Env is scrubbed to a minimal allowlist (PATH, HOME, plus MCP_GRAPH_* and
 * any explicit `env` from the config).
 */

export type ShellDecision = 'pass' | 'block' | 'warn'

export interface ShellHandlerConfig {
  id: string
  command: string
  args?: string[]
  env?: Record<string, string>
  timeoutMs?: number
  /** Working directory; defaults to process.cwd() */
  cwd?: string
}

export interface ShellHandlerResult {
  decision: ShellDecision
  exitCode: number | null
  stderr: string
  durationMs: number
  timedOut: boolean
}

const DEFAULT_TIMEOUT_MS = 5000
const MAX_STDERR_BYTES = 64 * 1024

const ALLOWED_HOST_ENV_KEYS = ['PATH', 'HOME'] as const

function buildScrubbedEnv(extra: Record<string, string> | undefined): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const key of ALLOWED_HOST_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) out[key] = value
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('MCP_GRAPH_') && value !== undefined) out[key] = value
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) out[key] = value
  }
  return out
}

/** runShellHandler —  */
export async function runShellHandler(config: ShellHandlerConfig, event: HookEvent): Promise<ShellHandlerResult> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()

  return new Promise<ShellHandlerResult>((resolve) => {
    const child = spawn(config.command, config.args ?? [], {
      cwd: config.cwd ?? process.cwd(),
      env: buildScrubbedEnv(config.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderrBuf = ''
    let stderrTruncated = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrTruncated) return
      const remaining = MAX_STDERR_BYTES - stderrBuf.length
      if (remaining <= 0) {
        stderrTruncated = true
        return
      }
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
      stderrBuf += slice.toString('utf8')
      // Cap reached → flag truncated, regardless of whether this exact chunk
      // overflowed. On Linux pipes the OS may have already dropped writes
      // beyond the pipe buffer, so chunk-overflow alone isn't sufficient.
      if (stderrBuf.length >= MAX_STDERR_BYTES) stderrTruncated = true
    })

    // We do not capture stdout — handler-to-context propagation goes via stderr
    // (matches Claude Code's contract). Drain to prevent backpressure stalls.
    child.stdout.on('data', () => {
      /* drain */
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      log.warn('hook:shell:spawn_error', { handlerId: config.id, error: String(err) })
      resolve({
        decision: 'warn',
        exitCode: null,
        stderr: String(err),
        durationMs: Date.now() - startedAt,
        timedOut: false,
      })
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const decision: ShellDecision = decide(code, signal, timedOut)
      resolve({
        decision,
        exitCode: code,
        stderr: stderrTruncated ? `${stderrBuf}\n[stderr truncated at ${MAX_STDERR_BYTES} bytes]` : stderrBuf,
        durationMs: Date.now() - startedAt,
        timedOut,
      })
    })

    try {
      const payload = JSON.stringify(event)
      child.stdin.write(payload + '\n', () => {
        child.stdin.end()
      })
    } catch (err) {
      log.warn('hook:shell:stdin_failed', { handlerId: config.id, error: String(err) })
      child.kill('SIGKILL')
    }
  })
}

function decide(code: number | null, signal: NodeJS.Signals | null, timedOut: boolean): ShellDecision {
  if (timedOut) return 'warn'
  if (signal && code === null) return 'warn'
  if (code === 0) return 'pass'
  if (code === 2) return 'block'
  return 'warn'
}
