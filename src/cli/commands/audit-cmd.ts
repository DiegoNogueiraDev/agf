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
import { ToolTokenStore } from '../../core/store/tool-token-store.js'
import { queryAuditLog, formatAuditEntry } from '../../core/observability/audit-query.js'
import type { AuditEntry, AuditFilter } from '../../core/observability/audit-query.js'
import { redactSecrets } from '../../core/security/tool-invocation-audit.js'

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
  const cmd = new Command('audit')
    .description('Consulta o audit trail de tool calls (queryAuditLog/formatAuditEntry)')
    .option('--node <id>', 'Filtra por node id')
    .option('--tool <name>', 'Filtra por nome da tool')
    .option('--status <status>', 'Filtra por status (success|error|denied)')
    .option('--since <iso>', 'Só entradas a partir deste timestamp ISO')
    .option('--limit <n>', 'Máximo de entradas', '50')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { node?: string; tool?: string; status?: string; since?: string; limit: string; dir: string }) => {
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
    })

  cmd
    .command('tool-usage')
    .description('Uso de tokens por MCP tool (ToolTokenStore.getUsageStats) — evidência para o deprecation gate')
    .option('--since-days <n>', 'Só chamadas dos últimos N dias')
    .option('--limit <n>', 'Máximo de tools exibidas', '20')
    .action((opts: { sinceDays?: string; limit: string }, command: Command) => {
      const out = createCliOutput('audit tool-usage')
      // node_wire_c39946ff34fa — 'tool-usage' não redeclara -d/--dir: o
      // comando pai 'audit' já o possui para sua própria action default, e
      // Commander atribui um -d passado após o nome do subcomando ao pai
      // quando ambos definem a mesma flag (deixando o filho preso ao seu
      // default). Lemos do pai em vez de duplicar a opção.
      const dir = (command.parent?.opts().dir as string | undefined) ?? process.cwd()
      const store = openStoreOrFail(dir, { requireExisting: true })
      try {
        const project = store.getProject()
        if (!project) {
          out.ok({ stats: [] }, { count: 0 })
          return
        }

        const tokenStore = new ToolTokenStore(store.getDb())
        const sinceDays = opts.sinceDays !== undefined ? Number(opts.sinceDays) : undefined
        const limit = coerceLimit(opts.limit, 20)
        const stats = tokenStore.getUsageStats(project.id, sinceDays).slice(0, limit)

        out.ok({ stats }, { count: stats.length })
      } finally {
        store.close()
      }
    })

  cmd
    .command('redact')
    .description('Redacta segredos (API keys, tokens, senhas) de um texto ou JSON (redactSecrets)')
    .argument('<input>', 'Texto plano ou string JSON a redactar')
    .action((input: string) => {
      const out = createCliOutput('audit redact')
      let value: unknown = input
      try {
        value = JSON.parse(input)
      } catch {
        // not JSON — redact as plain text
      }
      out.ok({ redacted: redactSecrets(value) })
    })

  return cmd
}
