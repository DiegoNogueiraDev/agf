/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-heal — navegação de auto-cura MAPE-K.
 *
 * Combines:
 *   - Reactive: pattern-based failure diagnosis (daemon-self-healing.ts)
 *   - Proactive: MAPE-K control loop (self-healing-engine.ts)
 *   - Self-learning: error memory scan (self-healing-listener.ts)
 *
 * No MCP dependency. Operates directly against SqliteStore.
 */

import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import {
  monitorGraph,
  analyzeIssues,
  planActions,
  executeActions,
  buildKnowledge,
  DEFAULT_HEALING_CONFIG,
  type ExecuteOptions,
} from '../../core/skills/self-healing-engine.js'
import { DaemonSelfHealer } from '../../core/daemon/daemon-self-healing.js'
import type { HealingConfig, HealingAction } from '../../schemas/healing.schema.js'
import { fmtSummary } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-heal.ts' })

const HEALING_MEMO_DIR = 'workflow-graph/memories'

export class GraphHealHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress, signal } = ctx
    const mode = (args.trim().split(/\s+/)[0] || 'full').toLowerCase()

    const config: HealingConfig = {
      ...DEFAULT_HEALING_CONFIG,
      autoHeal: args.includes('--apply'),
      dryRun: !args.includes('--apply'),
    }

    const startMs = Date.now()

    switch (mode) {
      case 'graph':
        return this.runGraphScan(store, config, onProgress, signal, startMs)
      case 'harness':
        return this.runHarnessScan(store, onProgress, startMs)
      case 'learn':
        return this.runLearnScan(dir, onProgress, startMs)
      case 'full':
      default:
        return this.runFullScan(store, dir, config, onProgress, signal, startMs)
    }
  }

  private async runFullScan(
    store: SkillExecutionContext['store'],
    dir: string,
    config: HealingConfig,
    onProgress: SkillExecutionContext['onProgress'],
    signal: SkillExecutionContext['signal'],
    startMs: number,
  ): Promise<string> {
    const lines: string[] = ['═ /graph-heal (full) ═']

    // Phase 1: Graph MAPE-K
    onProgress({ step: 1, total: 3, label: 'Monitorando grafo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const doc = store.toGraphDocument()

    const issues = monitorGraph(doc, config)
    const analyzed = analyzeIssues(issues)
    const actions = planActions(analyzed, doc)

    const execOpts: ExecuteOptions = { dryRun: config.dryRun }
    const results = executeActions(actions, doc, execOpts)
    const report = buildKnowledge(analyzed, actions, results)

    lines.push('')
    lines.push(
      `── MAPE-K: ${report.metrics.totalIssuesDetected} issues, ${report.metrics.totalHealed} healed, ${(report.metrics.successRate * 100).toFixed(0)}% success`,
    )
    if (report.metrics.totalIssuesDetected > 0) {
      lines.push(`   severity: ${fmtSummary(report.metrics.bySeverity as Record<string, number>)}`)
      lines.push(`   types: ${fmtSummary(report.metrics.byIssueType as Record<string, number>)}`)
    }

    // List top issues
    const topIssues = analyzed.slice(0, 8)
    for (const issue of topIssues) {
      const icon =
        issue.severity === 'critical' ? '⛔' : issue.severity === 'high' ? '⚠' : issue.severity === 'medium' ? '◆' : '·'
      lines.push(`   ${icon} [${issue.severity}] ${issue.title}: ${issue.message}`)
      const action = actions.find((a: HealingAction) => a.issueId === issue.id)
      if (action) {
        const status = results.find((r) => r.actionId === action.id)
        lines.push(`      → ${action.description} ${status?.success ? (config.dryRun ? '(dry-run)' : '✓') : '✗'}`)
      }
    }

    // Phase 2: Harness scan
    onProgress({ step: 2, total: 3, label: 'Escaneando harness...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    lines.push('── Harness: verifique dimensões com /quality')

    // Phase 3: Error memories
    onProgress({
      step: 3,
      total: 3,
      label: 'Revisando memórias de erro...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const memories = this.scanHealingMemories(dir)
    if (memories.length > 0) {
      lines.push(
        `   📖 ${memories.length} memória(s) de auto-correção: ${memories.slice(0, 5).join(', ')}${memories.length > 5 ? ` +${memories.length - 5}` : ''}`,
      )
    } else {
      lines.push('   📖 Nenhuma memória de erro encontrada')
    }

    if (config.dryRun) {
      lines.push('')
      lines.push('⚠ Dry-run ativo. Para aplicar, use: /graph-heal --apply')
    }

    lines.push('')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private async runGraphScan(
    store: SkillExecutionContext['store'],
    config: HealingConfig,
    onProgress: SkillExecutionContext['onProgress'],
    signal: SkillExecutionContext['signal'],
    startMs: number,
  ): Promise<string> {
    onProgress({
      step: 1,
      total: 1,
      label: 'Monitorando grafo (MAPE-K)...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const doc = store.toGraphDocument()
    const issues = monitorGraph(doc, config)
    const analyzed = analyzeIssues(issues)
    const actions = planActions(analyzed, doc)
    const execOpts: ExecuteOptions = { dryRun: config.dryRun }
    const results = executeActions(actions, doc, execOpts)
    const report = buildKnowledge(analyzed, actions, results)

    const lines: string[] = [
      `═ /graph-heal graph ═`,
      `Issues: ${report.metrics.totalIssuesDetected} · Healed: ${report.metrics.totalHealed} · Success: ${(report.metrics.successRate * 100).toFixed(0)}%`,
    ]
    for (const issue of analyzed) {
      const sev = issue.severity === 'critical' ? '⛔' : issue.severity === 'high' ? '⚠' : '·'
      lines.push(`${sev} [${issue.severity}] ${issue.title}: ${issue.message}`)
    }
    if (config.dryRun) lines.push('(dry-run — use --apply para executar)')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private async runHarnessScan(
    store: SkillExecutionContext['store'],
    onProgress: SkillExecutionContext['onProgress'],
    startMs: number,
  ): Promise<string> {
    onProgress({ step: 1, total: 1, label: 'Escaneando harness...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    return [
      '═ /graph-heal harness ═',
      'Use /quality para ver o score completo de harness.',
      'Use /graph-heal para scan MAPE-K completo.',
      `═ ${fmtElapsed(Date.now() - startMs)} ═`,
    ].join('\n')
  }

  private async runLearnScan(
    dir: string,
    onProgress: SkillExecutionContext['onProgress'],
    startMs: number,
  ): Promise<string> {
    onProgress({
      step: 1,
      total: 1,
      label: 'Escaneando memórias healing-*...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const memories = this.scanHealingMemories(dir)
    if (memories.length === 0) {
      return [
        '═ /graph-heal learn ═',
        'Nenhuma memória de auto-correção encontrada.',
        `═ ${fmtElapsed(Date.now() - startMs)} ═`,
      ].join('\n')
    }

    const lines: string[] = ['═ /graph-heal learn ═']
    for (const name of memories) {
      lines.push(`  📖 ${name}`)
    }
    lines.push(`${memories.length} memória(s) de auto-correção.`)
    lines.push(`Consulte com: cat workflow-graph/memories/<name>.md`)
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private scanHealingMemories(dir: string): string[] {
    const memoriesDir = path.join(dir, HEALING_MEMO_DIR)
    if (!existsSync(memoriesDir)) return []

    try {
      const files = readdirSync(memoriesDir)
      return files
        .filter((f) => f.startsWith('healing-') && f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
        .sort()
    } catch {
      return []
    }
  }
}

function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m${s % 60}s`
}

/** Exported for testing. */
export const EXPORTED = { DaemonSelfHealer, fmtElapsed }
