/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * AI Compress — ultra-compact envelope transformer for AI consumption.
 *
 * Strips noise fields, flattens check arrays to compact objects, converts
 * booleans to ✓/✗ symbols, and removes redundant meta. Target: ~75% token
 * reduction vs raw envelope.
 *
 * Applied AFTER --select projection (when --ai is active).
 */

import type { OutputEnvelope, OutMeta } from './envelope.js'

// ── Noise field removal ──────────────────────────────────

/** Keys renamed for brevity in AI output. */
const KEY_RENAMES: Record<string, string> = {
  acceptanceCriteria: 'ac',
}

/** Fields stripped from data at any depth. */
const NOISE_KEYS = new Set([
  // Colony / pheromone detail
  'caste',
  'pheromoneDeposited',
  'programCheckpoint',
  'colony_signals',
  // Financial drill-down
  'pricing',
  'commands',
  'economyBlock',
  'globalTotals',
  'leverSavings',
  'delegateEconomy',
  'costByTask',
  'economyConfig',
  'tasks',
  'bySession',
  'byTask',
  'levers',
  'delegateNote',
  // Config detail
  'endpoint',
  'failover',
  'cache',
  'modeReason',
  // Human-readable duplicates
  'summary',
  'alertMessage',
  'rationale',
  'details',
  'color',
  // Timestamps / meta
  'timestamp',
  'createdAt',
  // Always-true/constant fields
  'confidenceLevel',
])

/**
 * Keys that are noise drill-down in most envelopes but ARE the primary payload
 * of a specific command — so they must survive stripping for that command.
 * Without this, e.g. `economy list` (payload key `levers`) collapses to `{}`
 * in default AI mode, hiding the whole bio/math lever catalog from the agent.
 */
const COMMAND_OWNED_KEYS: Record<string, ReadonlySet<string>> = {
  economy: new Set(['levers']),
  // `bySession` reads as financial drill-down, and in most envelopes it is. Here it answers "how
  // much did this sitting save?" — which is the only reason `session_id` stopped being the constant
  // `'cli'`. Stripped, the whole session work would have shipped invisible to the agent that asked.
  savings: new Set(['bySession']),
}

const NO_OWNED_KEYS: ReadonlySet<string> = new Set()

// ── Gate check compression ────────────────────────────────

interface GateCheck {
  name: string
  passed: boolean
  details: string
  severity?: string
}

/**
 * Compress gate checks array into a flat object: { checkName: "details ✓" }.
 * Drops `severity` field. Converts `passed` boolean to ✓/✗ suffix.
 */
function compressChecks(checks: GateCheck[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of checks) {
    const symbol = c.passed ? '✓' : '✗'
    out[c.name] = `${c.details} ${symbol}`
  }
  return out
}

// ── Savings compression ───────────────────────────────────

interface SavingsReport {
  totals?: { tokensIn?: number; tokensOut?: number; cost?: number; saved?: number }
  totalSaved?: number
  savingsRate?: number
  [key: string]: unknown
}

function compressSavings(s: SavingsReport): { tok: number; cost: number; saved: number; rate: string } {
  return {
    tok: (s.totals?.tokensIn ?? 0) + (s.totals?.tokensOut ?? 0),
    cost: Math.round((s.totals?.cost ?? 0) * 100) / 100,
    saved: s.totalSaved ?? s.totals?.saved ?? 0,
    rate: `${s.savingsRate ?? 0}%`,
  }
}

// ── Colony signals compression ────────────────────────────

interface ColonySignals {
  suggested_model?: string
  [key: string]: unknown
}

function compressColony(c: ColonySignals): { model: string } | undefined {
  if (!c?.suggested_model) return undefined
  return { model: c.suggested_model }
}

// ── Bottleneck compression ────────────────────────────────

interface BlockedTask {
  id: string
  title: string
  blockerIds?: string[]
  blockerTitles?: string[]
  [key: string]: unknown
}

function compressBlocked(tasks: BlockedTask[]): Array<{ id: string; title: string; blockedBy: string[] }> {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    blockedBy: t.blockerIds ?? [],
  }))
}

// ── Status distribution compression ───────────────────────

interface StatusEntry {
  status: string
  count: number
  percentage?: number
  [key: string]: unknown
}

function compressStatusDist(entries: StatusEntry[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entries) out[e.status] = e.count
  return out
}

// ── Deep clean: strip noise keys recursively ──────────────

function stripNoise(obj: unknown, owned: ReadonlySet<string> = NO_OWNED_KEYS): unknown {
  if (Array.isArray(obj)) return obj.map((v) => stripNoise(v, owned))
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (NOISE_KEYS.has(k) && !owned.has(k)) continue
      const nk = KEY_RENAMES[k] ?? k
      out[nk] = stripNoise(v, owned)
    }
    return out
  }
  return obj
}

// ── Main compressor ───────────────────────────────────────

/**
 * Compress an envelope for ultra-compact AI consumption.
 * Assumes --select projection has already been applied.
 */
export function aiCompress<T>(env: OutputEnvelope<T>): OutputEnvelope {
  // 1. Strip meta noise, but keep meta.dir — it exists precisely so a write
  // to the wrong project is visible even in compressed output; stripping it
  // here would silently defeat the safety feature for every AI-mode caller.
  const meta: OutMeta = { command: env.meta.command, ...(env.meta.dir ? { dir: env.meta.dir } : {}) }

  // 2. Compress data based on shape detection
  let data = env.data as Record<string, unknown> | undefined

  if (data && typeof data === 'object') {
    data = compressData(env.meta.command, data)
  }

  // 3. Strip noise keys from the entire data tree (exempting command-owned keys)
  if (data) {
    const owned = COMMAND_OWNED_KEYS[env.meta.command] ?? NO_OWNED_KEYS
    data = stripNoise(data, owned) as Record<string, unknown>
  }

  // 4. Build compressed envelope (minimal: ok + required fields)
  const result: Record<string, unknown> = {
    ok: env.ok,
  }
  if (env.code) result.code = env.code
  if (data) result.data = data
  if (!env.ok && env.error) result.error = env.error
  result.meta = meta
  return result as unknown as OutputEnvelope
}

function compressData(command: string, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data }

  // Gate: flatten checks arrays. A `design` report may arrive wrapped by
  // wrapDesignPhaseAdvisory (out-of-phase-advisory) when out-of-phase —
  // ready/score/grade/checks then live under `.data`, not the report itself.
  if (command === 'gate' && Array.isArray(out.phases)) {
    out.phases = out.phases.map((p: Record<string, unknown>) => {
      const report = p.report as Record<string, unknown> | undefined
      if (!report) return p
      const isAdvisory = report.advisory === true
      const source = (isAdvisory ? report.data : report) as Record<string, unknown> | undefined
      if (!source) return p
      return {
        phase: p.phase,
        ...(isAdvisory ? { advisory: true as const, phaseWarning: report.phaseWarning } : {}),
        ready: source.ready,
        score: source.score,
        grade: source.grade,
        checks: Array.isArray(source.checks) ? compressChecks(source.checks as GateCheck[]) : source.checks,
      }
    })
  }

  // Check: flatten checks array
  if (command === 'check' && out.dod && typeof out.dod === 'object') {
    const dod = out.dod as Record<string, unknown>
    if (Array.isArray(dod.checks)) {
      dod.checks = compressChecks(dod.checks as GateCheck[])
    }
  }

  // Done: compress savings, flatten next
  if (command === 'done') {
    if (out.savings && typeof out.savings === 'object') {
      out.savings = compressSavings(out.savings as SavingsReport)
    }
    if (out.colony_signals) {
      const compressed = compressColony(out.colony_signals as ColonySignals)
      if (compressed) out.model = compressed.model
    }
  }

  // Submit: compress savings
  if (command === 'submit') {
    if (out.savings && typeof out.savings === 'object') {
      out.savings = compressSavings(out.savings as SavingsReport)
    }
  }

  // Start: compress colony_signals
  if (command === 'start' && out.colony_signals) {
    const compressed = compressColony(out.colony_signals as ColonySignals)
    if (compressed) {
      out.model = compressed.model
      delete out.colony_signals
    }
  }

  // Insights summary: compress statusDistribution, blockedTasks
  if (command === 'insights.summary' || command === 'insights') {
    if (Array.isArray(out.statusDistribution)) {
      out.statusDistribution = compressStatusDist(out.statusDistribution as StatusEntry[])
    }
    if (out.bottlenecks && typeof out.bottlenecks === 'object') {
      const bn = out.bottlenecks as Record<string, unknown>
      if (Array.isArray(bn.blockedTasks)) {
        bn.blockedTasks = compressBlocked(bn.blockedTasks as BlockedTask[])
      }
    }
  }

  // Insights bottlenecks: compress blockedTasks
  if (command === 'insights.bottlenecks') {
    if (Array.isArray(out.blockedTasks)) {
      out.blockedTasks = compressBlocked(out.blockedTasks as BlockedTask[])
    }
  }

  // Harness: keep only breakdown scores
  if (command === 'harness' && out.breakdown && typeof out.breakdown === 'object') {
    const bd = out.breakdown as Record<string, Record<string, unknown>>
    const compact: Record<string, number> = {}
    for (const [dim, v] of Object.entries(bd)) {
      compact[dim] = (v.score as number) ?? 0
    }
    out.breakdown = compact
  }

  // Metrics: compress totals
  if (command === 'metrics' && out.totals && typeof out.totals === 'object') {
    const t = out.totals as Record<string, unknown>
    out.totals = {
      calls: t.calls,
      tokens: t.total,
      cost: Math.round((t.costUsd as number) * 100) / 100,
    }
  }

  // Kanban: strip ledger, compress metrics
  if (command === 'kanban' && out.board && typeof out.board === 'object') {
    const board = out.board as Record<string, unknown>
    delete board.ledger
    if (board.metrics && typeof board.metrics === 'object') {
      const m = board.metrics as Record<string, unknown>
      board.metrics = {
        wipViolations: m.wipViolations,
        blocked: m.blockedPercentage,
      }
    }
  }

  // Gaps: flatten checks, keep essential fields
  if (command === 'gaps' && Array.isArray(out.gaps)) {
    out.gaps = out.gaps.map((g: Record<string, unknown>) => ({
      kind: g.kind,
      severity: g.severity,
      nodeId: g.nodeId,
      evidence: g.evidence,
      fix: (g.enrichment as Record<string, unknown>)?.applyVia,
      instruction: (g.enrichment as Record<string, unknown>)?.instruction,
    }))
  }

  return out
}
