/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-15.2 — Approval Checker
 *
 * Pure heuristic that decides whether a tool invocation needs explicit
 * human approval before mcp-graph runs it. Backs the
 * `analyze(mode: "approval_check")` MCP entry point and the
 * `task:pre-execute` hook handler.
 */

import { BASH_PATTERNS, PATH_PATTERNS, maxSeverity, type ApprovalSeverity } from './approval-patterns.js'

export interface ApprovalCheckInput {
  /** Tool name as passed to MCP — case-insensitive comparison */
  tool: string
  input?: Record<string, unknown> | null
}

export interface ApprovalCheckResult {
  requires_approval: boolean
  severity: ApprovalSeverity
  reason: string
  /** Pattern ids that matched — useful for telemetry / suppression */
  matchedPatterns: string[]
}

const NO_APPROVAL: ApprovalCheckResult = {
  requires_approval: false,
  severity: 'low',
  reason: 'no sensitive pattern matched',
  matchedPatterns: [],
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function checkBash(command: string): ApprovalCheckResult {
  let severity: ApprovalSeverity = 'low'
  const matched: string[] = []
  let firstReason: string | null = null
  for (const pat of BASH_PATTERNS) {
    if (pat.re.test(command)) {
      matched.push(pat.id)
      severity = maxSeverity(severity, pat.severity)
      if (firstReason === null) firstReason = pat.reason
    }
  }
  if (matched.length === 0) return NO_APPROVAL
  return {
    requires_approval: true,
    severity,
    reason: firstReason ?? 'sensitive bash pattern',
    matchedPatterns: matched,
  }
}

function checkPath(filePath: string): ApprovalCheckResult {
  let severity: ApprovalSeverity = 'low'
  const matched: string[] = []
  let firstReason: string | null = null
  for (const pat of PATH_PATTERNS) {
    if (pat.re.test(filePath)) {
      matched.push(pat.id)
      severity = maxSeverity(severity, pat.severity)
      if (firstReason === null) firstReason = pat.reason
    }
  }
  if (matched.length === 0) return NO_APPROVAL
  return {
    requires_approval: true,
    severity,
    reason: firstReason ?? 'sensitive path',
    matchedPatterns: matched,
  }
}

const MUTATING_FILE_TOOLS = new Set(['write', 'edit', 'notebookedit', 'multiedit'])

/** checkApproval —  */
export function checkApproval(req: ApprovalCheckInput): ApprovalCheckResult {
  const tool = (req.tool ?? '').toLowerCase()
  const input = req.input ?? {}

  if (tool === 'bash') {
    const cmd = asString(input['command'])
    if (cmd) return checkBash(cmd)
    return NO_APPROVAL
  }

  if (MUTATING_FILE_TOOLS.has(tool)) {
    const filePath = asString(input['file_path']) ?? asString(input['path'])
    if (filePath) return checkPath(filePath)
    return NO_APPROVAL
  }

  return NO_APPROVAL
}
