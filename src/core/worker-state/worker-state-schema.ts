/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-E2 — claw-clone CLI / Task E2.1
 *
 * .mcp-graph/worker-state.json schema.
 *
 * Mirrors claw-code's .claw/worker-state.json contract — the REPL or
 * `mcp-graph prompt` writes this on the first turn so subsequent
 * `mcp-graph state` calls can introspect the active worker.
 */

import { z } from 'zod/v4'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'worker-state/worker-state-schema.ts' })

/** Three permission modes, identical to claw-code's surface. */
export const PermissionModeSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access'])
export type PermissionMode = z.infer<typeof PermissionModeSchema>

/**
 * Worker-state record. Both `started_at` and `last_turn_at` are ISO-8601
 * timestamps (UTC, ms-precision) so log-correlation across processes is
 * unambiguous.
 */
export const WorkerStateSchema = z.object({
  worker_id: z.string().min(1),
  session_ref: z.string().min(1),
  model: z.string().min(1),
  permission_mode: PermissionModeSchema,
  started_at: z.iso.datetime(),
  last_turn_at: z.iso.datetime(),
  cwd: z.string().min(1),
})
export type WorkerState = z.infer<typeof WorkerStateSchema>
