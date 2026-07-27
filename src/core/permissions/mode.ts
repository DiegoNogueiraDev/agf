/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-E2 — claw-clone CLI / Task E2.2
 *
 * PermissionMode is re-exported from the worker-state schema (the schema is
 * the single source of truth — it ships with the persisted worker state).
 */

export { PermissionModeSchema, type PermissionMode } from '../worker-state/worker-state-schema.js'

/** Default mode when --permission-mode is not supplied (mirrors claw). */
export const DEFAULT_PERMISSION_MODE = 'workspace-write' as const
