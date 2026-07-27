/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * CLI output helper — single source of truth for all command output.
 *
 * Every command calls `createCliOutput(name)` and uses `out.ok(data)` or
 * `out.err(code, msg)`. The helper emits a JSON envelope to stdout and
 * sets exitCode=1 on errors.
 *
 * Usage:
 *   const out = createCliOutput('next')
 *   out.ok({ node: result.node, reason: result.reason })
 *   out.err('NOT_FOUND', 'Node not found')
 */

import { writeEnvelope } from '../../core/output/writer.js'
import type { OutMeta } from '../../core/output/envelope.js'

export interface CliOutput {
  ok<T>(data: T, extra?: Partial<Omit<OutMeta, 'command' | 'ms'>>): void
  err(code: string, error: string, extra?: Partial<Omit<OutMeta, 'command' | 'ms'>>): void
  fail<T>(code: string, error: string, data: T, extra?: Partial<Omit<OutMeta, 'command' | 'ms'>>): void
  advisory<T>(code: string, message: string, data?: T, extra?: Partial<Omit<OutMeta, 'command' | 'ms'>>): void
}

export function createCliOutput(command: string): CliOutput {
  const t0 = Date.now()

  return {
    ok(data, extra) {
      const meta: OutMeta = { command, ms: Date.now() - t0, ...extra }
      writeEnvelope({ ok: true, data, meta })
    },
    err(code, error, extra) {
      const meta: OutMeta = { command, ms: Date.now() - t0, ...extra }
      writeEnvelope({ ok: false, code, error, meta })
      process.exitCode = 1
    },
    fail(code, error, data, extra) {
      const meta: OutMeta = { command, ms: Date.now() - t0, ...extra }
      writeEnvelope({ ok: false, status: 'fail', code, error, data, meta })
      process.exitCode = 1
    },
    advisory(code, message, data, extra) {
      const meta: OutMeta = { command, ms: Date.now() - t0, ...extra }
      writeEnvelope({ ok: true, status: 'advisory', code, message, data, meta })
    },
  }
}
