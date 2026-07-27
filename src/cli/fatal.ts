/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 * Global error guard for the CLI entrypoint. Any uncaught throw or rejection
 * must still honor the `{ ok:false }` envelope contract instead of dumping a
 * raw stack trace to stdout. This module builds that terminal envelope; the
 * entrypoint wires it into `main().catch` + process-level handlers.
 */

import { isDatabaseLockedError, STORE_LOCKED_CODE } from '../core/store/lock-error.js'
import { isStoreNotFoundError, STORE_NOT_FOUND_CODE } from '../core/store/store-not-found-error.js'
import { isStoreCorruptError, STORE_CORRUPT_CODE } from '../core/store/store-corrupt-error.js'
import { isAgentDriverError, AGENT_DRIVER_ERROR_CODE } from '../core/errors/agent-driver-error.js'

export interface FatalEnvelope {
  ok: false
  status: 'fail'
  code: string
  error: string
  meta: { command: string; ms: number }
}

/** Build the terminal `ok:false` envelope for an uncaught error. */
export function buildFatalEnvelope(e: unknown): FatalEnvelope {
  let error: string
  if (e instanceof Error) {
    error = e.message || e.name
  } else if (typeof e === 'string') {
    error = e
  } else {
    try {
      error = JSON.stringify(e) ?? String(e)
    } catch {
      error = String(e)
    }
  }
  // A locked/contended store must fail loud with STORE_LOCKED, a missing
  // store with STORE_NOT_FOUND, and a corrupt store with STORE_CORRUPT —
  // never a generic UNCAUGHT (and never an empty envelope) — an agent caller
  // has to tell these apart from "no data". See core/store/lock-error.ts,
  // core/store/store-not-found-error.ts, core/store/store-corrupt-error.ts.
  // An AgentDriverError (LLM/agent driver failure) gets its own stable code
  // for the same reason. See core/errors/agent-driver-error.ts.
  const code = isDatabaseLockedError(e)
    ? STORE_LOCKED_CODE
    : isStoreNotFoundError(e)
      ? STORE_NOT_FOUND_CODE
      : isStoreCorruptError(e)
        ? STORE_CORRUPT_CODE
        : isAgentDriverError(e)
          ? AGENT_DRIVER_ERROR_CODE
          : 'UNCAUGHT'
  return { ok: false, status: 'fail', code, error, meta: { command: 'agf', ms: 0 } }
}
