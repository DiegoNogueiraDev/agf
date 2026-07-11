/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * SessionState model with versioned schema and auto-migration.
 */

import { z } from 'zod/v4'
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'

export const LATEST_SESSION_VERSION = 2

const ApprovalStateSchema = z.object({
  pendingApproval: z.boolean(),
  approvedActions: z.array(
    z.object({
      action: z.string().optional(),
      path: z.string().optional(),
    }),
  ),
})

const PlanStateSchema = z.object({
  currentPlan: z.string().nullable(),
  planHistory: z.array(z.string()),
})

const WorkspaceStateSchema = z.object({
  files: z.array(z.string()),
  lastSave: z.number(),
})

export const SessionStateSchema = z.object({
  version: z.literal(2),
  approvalState: ApprovalStateSchema,
  planState: PlanStateSchema,
  workspaceState: WorkspaceStateSchema,
})

export type SessionState = z.infer<typeof SessionStateSchema>

/** Migrate a legacy v1 session record to the v2 SessionState shape. */
export function migrateV1toV2(v1: Record<string, unknown>): SessionState {
  const workspace = (v1.workspace as string[]) ?? []
  return {
    version: 2,
    approvalState: {
      pendingApproval: false,
      approvedActions: (v1.approvedActions as Array<Record<string, string>>) ?? [],
    },
    planState: {
      currentPlan: (v1.plan as string) ?? null,
      planHistory: (v1.planHistory as string[]) ?? [],
    },
    workspaceState: {
      files: workspace,
      lastSave: Date.now(),
    },
  }
}

/**
 * Load session from file. Auto-migrates v1→v2.
 * Returns default v2 state on missing file or parse error.
 */
export function loadSession(filePath: string): SessionState | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const version = (parsed.version as number) ?? 1
    if (version === 1) {
      const migrated = migrateV1toV2(parsed)
      saveSession(filePath, migrated)
      return migrated
    }
    return SessionStateSchema.parse(parsed)
  } catch {
    // Return default on corrupt/unparseable
    return {
      version: 2,
      approvalState: { pendingApproval: false, approvedActions: [] },
      planState: { currentPlan: null, planHistory: [] },
      workspaceState: { files: [], lastSave: Date.now() },
    }
  }
}

/**
 * Save session to file atomically using a temp file + rename.
 * This prevents partial writes from corrupting the session file.
 */
export function saveSession(filePath: string, state: SessionState): void {
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}
