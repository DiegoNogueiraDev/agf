/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires core/observability/audit-query.ts (queryAuditLog/formatAuditEntry) into
 * the CLI, sourced from ToolCallLog — the project's existing tool-call trail.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { coerceLimit } from '../shared/coerce.js'
import { ToolCallLog } from '../../core/store/tool-call-log.js'
import type { ToolCallEntry } from '../../core/store/tool-call-log.js'
import { queryAuditLog, formatAuditEntry } from '../../core/observability/audit-query.js'
import type { AuditEntry, AuditFilter } from '../../core/observability/audit-query.js'

/**
 * Maps a ToolCallLog row to the audit-query domain shape. tool_call_log only
 * ever records successful calls (see ToolCallLog.record), so status is always
 * 'success'.
 */
export function toAuditEntry(entry: ToolCallEntry): AuditEntry {
  return {
    timestamp: entry.calledAt,
    nodeId: entry.nodeId ?? '(project)',
    tool: entry.toolName,
    status: 'success',
    message: entry.toolArgs ?? '',
  }
}

/** Builds the `agf audit` CLI command (Commander definition). */
export function auditCommand(): Command {
  return new Command('audit')
    .description('Consulta o audit trail de tool calls (queryAuditLog/formatAuditEntry)')
    .option('--node <id>', 'Filtra por node id')
    .option('--tool <name>', 'Filtra por nome da tool')
    .option('--status <status>', 'Filtra por status (success|error|denied)')
    .option('--since <iso>', 'Só entradas a partir deste timestamp ISO')
    .option('--limit <n>', 'Máximo de entradas', '50')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (opts: { node?: string; tool?: string; status?: string; since?: string; limit: string; dir: string }) => {
        const out = createCliOutput('audit')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const project = store.getProject()
          if (!project) {
            out.ok({ entries: [], formatted: [] }, { count: 0 })
            return
          }

          const toolCallLog = new ToolCallLog(store.getDb())
          const limit = coerceLimit(opts.limit, 50)
          const entries = toolCallLog.getAllCalls(project.id, limit).map(toAuditEntry)

          const filter: AuditFilter = {
            nodeId: opts.node,
            tool: opts.tool,
            status: opts.status as AuditFilter['status'] | undefined,
            since: opts.since,
          }
          const filtered = queryAuditLog(entries, filter)
          const formatted = filtered.map(formatAuditEntry)

          out.ok({ entries: filtered, formatted }, { count: filtered.length })
        } finally {
          store.close()
        }
      },
    )
}
