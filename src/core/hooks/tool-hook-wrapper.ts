/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { HookBus } from './hook-bus.js'

type AnyHandler = (args: Record<string, unknown>) => Promise<unknown>

/**
 * Wraps a tool handler to emit tool:pre-call before and tool:post-call after execution.
 * The wrapper is a pass-through: it preserves the handler return value and re-throws errors.
 * tool_token_usage telemetry is untouched — that runs in unified-gate.ts independently.
 */
export function withToolHooks(toolName: string, handler: AnyHandler, hookBus: HookBus): AnyHandler {
  return async (args: Record<string, unknown>): Promise<unknown> => {
    const timestamp = new Date().toISOString()

    await hookBus.emit({ channel: 'tool:pre-call', timestamp, payload: { toolName, args } })

    const startedAt = Date.now()
    let error: string | undefined

    let resultPreview: string | undefined
    try {
      const resultValue = await handler(args)
      try {
        const raw = String(typeof resultValue === 'object' ? JSON.stringify(resultValue) : resultValue)
        resultPreview = raw.length > 1000 ? raw.slice(0, 1000) + '…' : raw
      } catch {
        /* non-serializable result — skip preview */
      }
      return resultValue
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      const durationMs = Date.now() - startedAt
      await hookBus.emit({
        channel: 'tool:post-call',
        timestamp: new Date().toISOString(),
        payload: { toolName, durationMs, resultPreview, ...(error !== undefined ? { error } : {}) },
      })
    }
  }
}
