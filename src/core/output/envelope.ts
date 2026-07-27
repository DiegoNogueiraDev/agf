/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Structured JSON output envelope — deterministic contract for CLI consumers.
 *
 * Every `agf` command emits exactly one OutputEnvelope to stdout.
 * CLI-to-CLI communication: consumer = agent-next / agent-verify → JSON.
 */

export interface OutMeta {
  command: string
  ms?: number
  count?: number
  /** Optional sub-mode label for commands with multiple output variants (e.g. 'decay'). */
  mode?: string
  /** Ratio saved by an optional output compression pass (e.g. `agf search --compress`). */
  compressionRatio?: number
  /** Resolved absolute --dir for graph-mutating commands — makes a write to the wrong project visible. */
  dir?: string
  /** Non-fatal per-source warnings (e.g. an unavailable store in `agf search --federated`). */
  warnings?: string[]
  /** Cross-store observability trace (e.g. `agf search --federated --trace`). */
  trace?: { traceId: string; partial: boolean; steps: unknown[] }
}

export interface OutputEnvelope<T = unknown> {
  ok: boolean
  /** 'ok' | 'advisory' | 'fail' — machine-readable status for agent consumers. */
  status?: 'ok' | 'advisory' | 'fail'
  code?: string
  /** Non-fatal human-readable message used by advisory envelopes. */
  message?: string
  data?: T
  error?: string
  meta: OutMeta
}

export function ok<T>(data: T, meta: OutMeta): OutputEnvelope<T> {
  return { ok: true, data, meta }
}

export function err(code: string, error: string, meta: OutMeta): OutputEnvelope<never> {
  return { ok: false, code, error, meta }
}
