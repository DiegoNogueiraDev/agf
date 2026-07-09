/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-audit-cmd — Audit log query engine.
 */

export interface AuditEntry {
  timestamp: string
  nodeId: string
  tool: string
  status: 'success' | 'error' | 'denied'
  message: string
}

export interface AuditFilter {
  nodeId?: string
  tool?: string
  status?: 'success' | 'error' | 'denied'
  since?: string
}

export function queryAuditLog(entries: AuditEntry[], filter: AuditFilter): AuditEntry[] {
  return entries.filter((e) => {
    if (filter.nodeId && e.nodeId !== filter.nodeId) return false
    if (filter.tool && e.tool !== filter.tool) return false
    if (filter.status && e.status !== filter.status) return false
    if (filter.since && e.timestamp < filter.since) return false
    return true
  })
}

export function formatAuditEntry(entry: AuditEntry): string {
  const time = entry.timestamp.slice(11, 19)
  return `[${time}] ${entry.nodeId} | ${entry.tool} | ${entry.status} | ${entry.message}`
}
