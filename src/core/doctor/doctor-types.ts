/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Types for the `mcp-graph doctor` diagnostic command.
 */

export type CheckLevel = 'ok' | 'warning' | 'error'

export interface CheckResult {
  name: string
  level: CheckLevel
  message: string
  suggestion?: string
}

export interface DoctorReport {
  checks: CheckResult[]
  summary: { ok: number; warning: number; error: number }
  passed: boolean
}
