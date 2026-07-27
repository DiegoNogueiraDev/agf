/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'
import type { HookBus } from './hook-bus.js'
import { detectBannedPhrases } from './anti-hallucination-detector.js'
import { extractFacts, formatFactsAsMemory } from './extract-keywords.js'
import { extractStructured, compactBullets } from './compact-extract.js'
import { pushFact, getCompactFacts } from './context-injection.js'
import { checkDestructiveDbIntent } from './destructive-db-guard.js'
import { installMessageUpdateBridge } from '../session/session-events.js'
import { persistLesson } from '../autonomy/lessons-store.js'
import { createHash } from 'node:crypto'
import { checkApproval } from '../approval/approval-checker.js'
import { verifyAndPromote } from '../utils/verified-auto-promote.js'
import { scanForPii, redactPii } from './memory-pii-scanner.js'
import { countInProgressForAgent, getWipCap } from './wip-cap-guard.js'
import { isBudgetLow } from './agent-budget-precheck.js'
import { ApprovalTimeoutTracker, getApprovalTimeoutMs } from './approval-timeout.js'
import { postApprovalToSlack, type Severity } from './approval-slack-bridge.js'
import { enforceBashVerdict } from './bash-validation-hook.js'
import { checkDocSync } from './doc-sync-hook.js'
import { runCitationCoverageCheck } from './citation-coverage-hook.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { OperationError } from '../utils/errors.js'
import { LockManager } from '../store/lock-manager.js'

const log = createLogger({ layer: 'core', source: 'builtin-handlers.ts' })

export const builtinHandlerIds = [
  'builtin:audit-log',
  'builtin:telemetry',
  'builtin:harness-regression',
  'builtin:anti-hallucination',
  'builtin:approval-required',
  'builtin:verified-auto-promote',
  'builtin:memory-pii-scanner',
  'builtin:wip-cap-guard',
  'builtin:agent-budget-precheck',
  'builtin:approval-timeout',
  'builtin:approval-slack',
  'builtin:destructive-db-guard',
  'builtin:bash-validation',
  'builtin:doc-sync-guard',
  'builtin:citation-coverage-guard',
] as const

/**
 * Registers the built-in hook handlers onto the provided HookBus.
 * No-op when MCP_GRAPH_HOOKS_DISABLED=true (test mode).
 *
 * `store` is optional for backward compatibility; the verified-auto-promote
 * handler is skipped when no store is provided.
 */
export function registerBuiltinHandlers(bus: HookBus, store?: SqliteStore): void {
  if (process.env.MCP_GRAPH_HOOKS_DISABLED === 'true') return

  // Session layer: re-emit a session:message-update for every llm:post-call so
  // the application surface (TUI/Web/API) receives discrete message events.
  installMessageUpdateBridge(bus)

  // Audit-log: records task completions and errors to the structured logger
  bus.on('task:post-complete', async (event) => {
    log.info('hook:audit:task-complete', {
      nodeId: event.payload['nodeId'],
      title: event.payload['title'],
      ts: event.timestamp,
    })
  })

  bus.on('task:error', async (event) => {
    log.warn('hook:audit:task-error', {
      nodeId: event.payload['nodeId'],
      error: event.payload['error'],
      ts: event.timestamp,
    })
  })

  // Doc-sync guard: on task completion, flag docs (CLAUDE.md, .claude/rules/,
  // docs/) that went stale relative to graph activity. Best-effort and opt-out
  // via MCP_GRAPH_DOC_SYNC=off — never breaks the completing task.
  bus.on('task:post-complete', async () => {
    try {
      const report = checkDocSync({ cwd: process.cwd() })
      for (const advisory of report.advisories) {
        log.warn('hook:doc-sync:drift', {
          path: advisory.path,
          reason: advisory.reason,
          ageDays: Math.round(advisory.ageDays),
        })
      }
    } catch (err) {
      log.debug('hook:doc-sync:failed', { error: String(err) })
    }
  })

  // Citation-coverage guard: on task completion, flag the node's declared
  // src/core/ implementationFiles that lack a §CITATION. Best-effort and
  // requires a store (reads implementationFiles + disk) — skipped when no
  // store is injected. Opt-out via MCP_GRAPH_CITATION_GUARD=off.
  if (store) {
    bus.on('task:post-complete', async (event) => {
      const nodeId = event.payload['nodeId']
      if (typeof nodeId !== 'string' || nodeId.length === 0) return
      try {
        const report = runCitationCoverageCheck(store, nodeId)
        if (report && report.missing.length > 0) {
          log.warn('hook:citation-coverage:missing', {
            nodeId,
            missing: report.missing,
            scanned: report.scanned,
          })
        }
      } catch (err) {
        log.debug('hook:citation-coverage:failed', { error: String(err) })
      }
    })
  }

  // Telemetry: records tool call durations for observability
  bus.on('tool:pre-call', async (event) => {
    log.debug('hook:telemetry:tool-pre-call', { toolName: event.payload['toolName'], ts: event.timestamp })
  })

  bus.on('tool:post-call', async (event) => {
    log.info('hook:telemetry:tool-post-call', {
      toolName: event.payload['toolName'],
      durationMs: event.payload['durationMs'],
      ts: event.timestamp,
    })
  })

  // §2.3a L0 — Keyword extraction: escaneia output por padrões e salva em memória
  bus.on('tool:post-call', async (event) => {
    const output = event.payload['resultPreview']
    const toolName = event.payload['toolName']
    if (typeof output !== 'string' || output.length === 0) return
    if (typeof toolName !== 'string') return
    const facts = extractFacts(output, toolName, event.timestamp)
    if (facts.length === 0) return
    const entry = formatFactsAsMemory(facts)
    if (!entry) return
    log.debug('hook:extract-keywords:found', {
      toolName,
      count: facts.length,
      kinds: [...new Set(facts.map((f) => f.kind))],
    })
    for (const f of facts) pushFact(`[${f.kind}] ${f.text}`)
  })

  // §2.3b L1 — Pré-compact extraction: parseia JSON/listas, compacta em bullets
  bus.on('tool:post-call', async (event) => {
    const output = event.payload['resultPreview']
    const toolName = event.payload['toolName']
    if (typeof output !== 'string' || output.length === 0) return
    if (typeof toolName !== 'string') return
    const blocks = extractStructured(output)
    if (blocks.length === 0) return
    const bullets: string[] = []
    for (const block of blocks) {
      bullets.push(...compactBullets(block))
    }
    if (bullets.length === 0) return
    log.debug('hook:compact-extract:found', {
      toolName,
      blocks: blocks.length,
      bullets: bullets.length,
    })
    for (const b of bullets) pushFact(b.replace(/^- /, ''))
  })

  // §2.3c L2 — Context injection: no session:start, injeta facts compactos
  bus.on('session:start', async (_event) => {
    const contextBlock = getCompactFacts()
    if (!contextBlock) return
    log.info('hook:context-injection:injected', {
      lines: contextBlock.split('\n').length,
    })
  })

  // §EPIC-13.3 — Anti-hallucination: scans `payload.prompt` (when callers
  // include it) on task:pre-execute and emits an advisory log entry naming
  // each forbidden phrase. Pure-advisory: never blocks task execution.
  bus.on('task:pre-execute', async (event) => {
    const prompt = event.payload['prompt']
    if (typeof prompt !== 'string' || prompt.length === 0) return
    const hits = detectBannedPhrases(prompt)
    if (hits.length > 0) {
      log.warn('hook:anti-hallucination:detected', {
        nodeId: event.payload['nodeId'],
        bannedPhrases: hits,
        rule: '.claude/rules/anti-hallucination.md',
      })
    }
  })

  // §SprintE.5 — Destructive DB guard: refuses to forward a task whose
  // prompt or tool-input would wipe the mcp-graph store. Surfaces a
  // human-readable reason via logger.error so the orchestrator (and the
  // user) sees exactly why the task was halted.
  bus.on('task:pre-execute', async (event) => {
    const prompt = event.payload['prompt']
    const confirm = event.payload['destructiveConfirmation']
    if (typeof prompt !== 'string' || prompt.length === 0) return
    const verdict = checkDestructiveDbIntent(prompt, typeof confirm === 'string' ? confirm : null)
    if (verdict.blocked) {
      log.error('hook:destructive-db-guard:blocked', {
        nodeId: event.payload['nodeId'],
        matched: verdict.matchedPattern,
        reason: verdict.reason,
      })
      recordDestructiveAttempt(store, 'task:pre-execute', verdict.matchedPattern, prompt)
      throw new OperationError(verdict.reason ?? 'destructive-db-guard: blocked')
    }
  })

  bus.on('tool:pre-call', async (event) => {
    const toolName = event.payload['toolName']
    const input = event.payload['toolInput']
    if (toolName !== 'Bash' || !input || typeof input !== 'object') return
    const cmd = (input as Record<string, unknown>)['command']
    if (typeof cmd !== 'string') return
    const verdict = checkDestructiveDbIntent(cmd)
    if (verdict.blocked) {
      log.error('hook:destructive-db-guard:blocked-bash', {
        matched: verdict.matchedPattern,
        reason: verdict.reason,
      })
      recordDestructiveAttempt(store, 'tool:pre-call:Bash', verdict.matchedPattern, cmd)
      throw new OperationError(verdict.reason ?? 'destructive-db-guard: blocked')
    }
  })

  // §EPIC-claw-bash-validation — bash-validation-hook.ts bridges the pure
  // bash-validator.ts risk classifier (path escape, inline exec, dynamic
  // shell) into the bus, complementary to destructive-db-guard above (DB-
  // specific patterns). ADR-0060: only "forbidden" blocks; "destructive"/
  // "warn" log and continue.
  bus.on('tool:pre-call', async (event) => {
    const toolName = event.payload['toolName']
    const input = event.payload['toolInput']
    if (toolName !== 'Bash' || !input || typeof input !== 'object') return
    const cmd = (input as Record<string, unknown>)['command']
    if (typeof cmd !== 'string') return
    enforceBashVerdict(cmd)
  })

  // §EPIC-15.2 — Approval Required: scans `payload.tool` + `payload.toolInput`
  // on tool:pre-call, and emits APPROVAL_REQUIRED via the same bus when a
  // sensitive pattern matches. Pure-advisory: never blocks the call here —
  // the actual block-and-wait is done by callers polling
  // signal-file-watcher.waitForApproval. This handler is the bus-level
  // signal so consumers (UI, Slack bridge, etc.) can render the prompt.
  bus.on('tool:pre-call', async (event) => {
    const tool = event.payload['toolName']
    const input = event.payload['toolInput']
    if (typeof tool !== 'string') return
    const resultValue = checkApproval({
      tool,
      input: input && typeof input === 'object' ? (input as Record<string, unknown>) : null,
    })
    if (resultValue.requires_approval) {
      log.warn('hook:approval-required:detected', {
        tool,
        nodeId: event.payload['nodeId'],
        severity: resultValue.severity,
        reason: resultValue.reason,
        matched: resultValue.matchedPatterns,
      })
      await bus.emit({
        channel: 'approval:required',
        timestamp: event.timestamp,
        payload: {
          nodeId: event.payload['nodeId'],
          tool,
          severity: resultValue.severity,
          reason: resultValue.reason,
          matched: resultValue.matchedPatterns,
        },
      })
    }
  })

  // Verified auto-promote: on task:post-complete, walks parent chain and
  // promotes ancestors only when their deliverable verifies (sourceRef exists +
  // testFiles exist + tests pass). Closes the drift gap where status="done"
  // was assumed without verification. Skipped when store is not injected or
  // when MCP_GRAPH_VERIFIED_AUTO_PROMOTE=off.
  if (store && process.env.MCP_GRAPH_VERIFIED_AUTO_PROMOTE !== 'off') {
    bus.on('task:post-complete', async (event) => {
      const nodeId = event.payload['nodeId']
      if (typeof nodeId !== 'string' || nodeId.length === 0) return
      try {
        const resultValue = await verifyAndPromote(store, nodeId)
        if (resultValue.promoted.length > 0) {
          log.info('hook:verified-auto-promote:done', {
            triggeredBy: nodeId,
            promoted: resultValue.promoted,
          })
        }
        if (resultValue.rejected.length > 0) {
          log.warn('hook:verified-auto-promote:rejected', {
            triggeredBy: nodeId,
            rejected: resultValue.rejected,
          })
        }
      } catch (err) {
        log.error('hook:verified-auto-promote:error', {
          nodeId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  // §EPIC-21.T05 — Memory PII scanner. Scans memory:pre-store payload.content
  // for email/SSN/credit-card (Luhn)/API-token patterns. Default: redacts
  // in-place via payload mutation. Strict mode (MCP_GRAPH_PII_STRICT=true):
  // throws to abort the store. Toggle: MCP_GRAPH_PII_SCANNER=off.
  if (process.env.MCP_GRAPH_PII_SCANNER !== 'off') {
    bus.on('memory:pre-store', async (event) => {
      const content = event.payload['content']
      if (typeof content !== 'string' || content.length === 0) return
      const hits = scanForPii(content)
      if (hits.length === 0) return
      const kinds = [...new Set(hits.map((h) => h.kind))]
      log.warn('hook:memory:pii-detected', {
        kinds,
        count: hits.length,
        nodeId: event.payload['nodeId'],
      })
      if (process.env.MCP_GRAPH_PII_STRICT === 'true') {
        // Caller must check payload.rejected and abort the store. HookBus
        // catches exceptions, so we cannot throw here — we mutate instead.
        event.payload['rejected'] = true
        event.payload['rejectionReason'] = `PII detected (${kinds.join(', ')})`
        return
      }
      // Default: redact in-place (caller reads mutated content from payload).
      event.payload['content'] = redactPii(content)
    })
  }

  // §EPIC-21.T09 — WIP cap guard. Enforces WIP per-agentId.
  // Conta nodes status=in_progress por agente em task:pre-execute. Se >= cap
  // (MCP_GRAPH_WIP_CAP, default 1), bloqueia com WipLimitError.
  // Toggle: MCP_GRAPH_WIP_GUARD=off. Lease via LockManager.
  if (store && process.env.MCP_GRAPH_WIP_GUARD !== 'off') {
    bus.on('task:pre-execute', async (event) => {
      const agentId = event.payload['agentId']
      const nodeId = event.payload['nodeId']
      const agentIdStr = typeof agentId === 'string' && agentId.length > 0 ? agentId : null

      if (agentIdStr) {
        try {
          const locks = new LockManager(store.getDb())
          const resourceId = `task:${nodeId}`
          const existing = locks.isHeldByOther(resourceId, agentIdStr)
          if (existing) {
            throw new OperationError(
              `wip:lock-conflict Task ${nodeId} ja esta alocada para agente ${existing.agentId}. ` +
                `Use lease_token=${existing.leaseToken} para reivindicar.`,
            )
          }
        } catch (err) {
          if (err instanceof OperationError) throw err
          log.error('hook:wip-cap:lock-error', { error: String(err) })
        }
      }

      try {
        const cap = getWipCap(process.env)
        const current = countInProgressForAgent(store, agentIdStr)
        if (current >= cap) {
          const label = agentIdStr || 'global'
          throw new OperationError(
            `wip:limit-exceeded WIP cap=${cap} atingido (${current} in_progress) para agente "${label}". ` +
              `Finalize ou reverta a task atual antes de iniciar outra.`,
          )
        }
      } catch (err) {
        if (err instanceof OperationError) throw err
        log.error('hook:wip-cap:error', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  // §EPIC-21.T11 — agent-budget-precheck. Adverte (não bloqueia) quando o
  // consumo já está em ≥90% do cap. Caller injeta currentUsd e capUsd no
  // payload (BudgetLedger.aggregate + project_settings cap_usd_per_run).
  // Toggle: MCP_GRAPH_AGENT_BUDGET_GUARD=off.
  if (process.env.MCP_GRAPH_AGENT_BUDGET_GUARD !== 'off') {
    bus.on('agent:pre-spawn', async (event) => {
      const currentUsd = event.payload['currentUsd']
      const capUsd = event.payload['capUsd']
      if (typeof currentUsd !== 'number') return
      const cap = typeof capUsd === 'number' ? capUsd : undefined
      if (isBudgetLow({ currentUsd, capUsd: cap })) {
        log.warn('hook:agent:budget-low', {
          agentId: event.payload['agentId'],
          currentUsd,
          capUsd: cap,
          ratio: cap ? currentUsd / cap : null,
        })
      }
    })
  }

  // §EPIC-21.T13 — approval-timeout-escalate. Em approval:required, arma um
  // timer; se nenhum approval:resolved chegar dentro do timeout, escala via
  // log.error(consumer pode wirar Slack ping em separado). Toggle:
  // MCP_GRAPH_APPROVAL_TIMEOUT_GUARD=off para não armar timers.
  if (process.env.MCP_GRAPH_APPROVAL_TIMEOUT_GUARD !== 'off') {
    const timeoutMs = getApprovalTimeoutMs(process.env)
    const tracker = new ApprovalTimeoutTracker(timeoutMs, (approvalId, context) => {
      log.error('hook:approval:timeout', {
        approvalId,
        timeoutMs,
        ...context,
      })
    })
    bus.on('approval:required', async (event) => {
      const approvalId =
        typeof event.payload['approvalId'] === 'string'
          ? event.payload['approvalId']
          : `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      tracker.arm(approvalId, {
        tool: event.payload['tool'],
        nodeId: event.payload['nodeId'],
        reason: event.payload['reason'],
      })
    })
    // Optional resolve channel: callers emit a synthetic "approval:resolved"
    // event with payload.approvalId to cancel the timer. Channel is not in
    // HOOK_CHANNELS yet; we listen via the underlying bus event mechanism.
    bus.on('session:end', async () => {
      tracker.clear() // graceful shutdown
    })
  }

  // approval-slack-bridge: the Slack ping named (but never wired) in the
  // approval-timeout-escalate comment above. postApprovalToSlack is a no-op
  // (posted:false) when MCP_GRAPH_APPROVAL_SLACK=off or SLACK_WEBHOOK_URL is
  // unset — safe to always register.
  bus.on('approval:required', async (event) => {
    const result = await postApprovalToSlack({
      tool: String(event.payload['tool'] ?? 'unknown'),
      severity: (event.payload['severity'] as Severity) ?? 'medium',
      reason: String(event.payload['reason'] ?? ''),
      matched: Array.isArray(event.payload['matched']) ? event.payload['matched'].join(', ') : undefined,
      nodeId: typeof event.payload['nodeId'] === 'string' ? event.payload['nodeId'] : undefined,
    })
    if (result.reason === 'failed') {
      log.warn('hook:approval-slack:failed', { status: result.status })
    }
  })

  // Harness regression: warns on session:end when harness score drops > 5 pts
  bus.on('session:end', async (event) => {
    const delta = typeof event.payload['delta'] === 'number' ? event.payload['delta'] : 0
    if (delta < -5) {
      log.warn('hook:harness-regression:detected', {
        scoreBefore: event.payload['scoreBefore'],
        scoreAfter: event.payload['scoreAfter'],
        delta,
      })
    } else {
      log.debug('hook:harness-regression:ok', { delta })
    }
  })
}

/**
 * §SprintE.5 — Persist a destructive-db-attempt to lessons_learned so the
 * audit trail survives across restarts and the orchestrator can spot
 * repeated probes against the store. Best-effort: lessons table may not
 * exist on early-migration installs, in which case we just log.
 */
function recordDestructiveAttempt(
  store: SqliteStore | undefined,
  channel: string,
  matchedPattern: string | null,
  excerpt: string,
): void {
  if (!store) return
  try {
    const hash = createHash('sha256')
      .update(`destructive-db-attempt:${matchedPattern ?? 'unknown'}:${excerpt.slice(0, 200)}`)
      .digest('hex')
      .slice(0, 32)
    persistLesson(store.getDb(), {
      patternHash: hash,
      description: `destructive-db-attempt (${matchedPattern ?? 'unknown'}) blocked at ${channel}`,
      recommendedAction: 'review prompt source — repeated attempts indicate prompt-injection or misconfigured agent',
      confidence: 0.9,
      source: 'destructive-db-guard',
    })
  } catch (err) {
    log.debug('hook:destructive-db-guard:lesson_record_failed', { error: String(err) })
  }
}
