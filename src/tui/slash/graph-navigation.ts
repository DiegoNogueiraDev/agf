import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
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
import type { HealingConfig } from '../../schemas/healing.schema.js'
import { coupleNode } from '../../core/scaffolder/couple.js'
import { emitTaskHook, flushHooks } from '../../core/hooks/hook-runtime.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/graph-navigation.ts' })

const HEALING_MEMO_DIR = 'workflow-graph/memories'

export class GraphNavigationHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    log.debug(`graph-navigation execute: ${args}`)
    const { store, dir, onProgress, testCmd } = ctx
    const startMs = Date.now()
    const auto = args.includes('--auto')
    const dryRun = !auto

    const config: HealingConfig = {
      ...DEFAULT_HEALING_CONFIG,
      autoHeal: auto,
      dryRun,
    }

    const lines: string[] = ['═ /graph-navigation ═']

    onProgress({ step: 1, total: 6, label: 'Self-Healing (MAPE-K)...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const doc = store.toGraphDocument()
    const issues = monitorGraph(doc, config)
    const analyzed = analyzeIssues(issues)
    const actions = planActions(analyzed, doc)
    const execOpts: ExecuteOptions = { dryRun }
    const results = executeActions(actions, doc, execOpts)
    const report = buildKnowledge(analyzed, actions, results)
    lines.push(
      `  [1/6] Self-Healing: ${report.metrics.totalIssuesDetected} issues, ${report.metrics.totalHealed} healed (${(report.metrics.successRate * 100).toFixed(0)}% success)`,
    )
    for (const issue of analyzed.slice(0, 3)) {
      lines.push(`    \u26a0 [${issue.severity}] ${issue.title}: ${issue.message}`)
    }

    onProgress({ step: 2, total: 6, label: 'Self-Learning...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const memories = this.scanHealingMemories(dir)
    lines.push(`  [2/6] Self-Learning: ${memories.length} pattern(s) from healing memories`)
    for (const m of memories.slice(0, 3)) {
      lines.push(`    \uD83D\uDCD6 ${m}`)
    }

    onProgress({ step: 3, total: 6, label: 'Auto-Verify...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const verifyResult = this.runVerify(testCmd)
    lines.push(`  [3/6] Auto-Verify: ${verifyResult}`)

    onProgress({ step: 4, total: 6, label: 'Auto-Scaffold...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const scaffoldResult = this.detectUnimplemented(doc)
    lines.push(`  [4/6] Auto-Scaffold: ${scaffoldResult}`)

    onProgress({ step: 5, total: 6, label: 'Auto-Boilerplate...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const boilerplate = await this.runBoilerplate(store, dir, auto)
    lines.push(`  [5/6] Auto-Boilerplate: ${boilerplate}`)

    onProgress({ step: 6, total: 6, label: 'Auto-Dogfooding...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const dogfoodResult = this.runDogfoodingSteps(lines, config)
    lines.push(`  [6/6] Auto-Dogfooding: ${dogfoodResult}`)

    if (dryRun) {
      lines.push('')
      lines.push('\u26a0 Dry-run ativo — nenhuma modificacao aplicada. Use --auto para aplicar.')
    }

    const elapsed = Date.now() - startMs
    const elapsedStr = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`
    lines.push(`\u2550 ${elapsedStr} \u2550`)
    return lines.join('\n')
  }

  private scanHealingMemories(dir: string): string[] {
    const memoriesDir = join(dir, HEALING_MEMO_DIR)
    if (!existsSync(memoriesDir)) return []
    try {
      const files = readdirSync(memoriesDir)
      return files
        .filter((f) => f.startsWith('healing-') && f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
        .sort()
        .reverse()
    } catch {
      return []
    }
  }

  /**
   * Passo 5 — Auto-Boilerplate determinístico via acoplador determinístico. Usa o PRÓPRIO
   * projeto como corpus (`dir`) e gera scaffold p/ nodes backlog elegíveis. Dry-run
   * conta os elegíveis; `--auto` emite `scaffold:requested` (async) + flush. 0 LLM.
   */
  private async runBoilerplate(
    store: import('../../core/store/sqlite-store.js').SqliteStore,
    dir: string,
    auto: boolean,
  ): Promise<string> {
    const backlog = store.toGraphDocument().nodes.filter((n) => n.status === 'backlog')
    let eligible = 0
    let generated = 0
    for (const n of backlog) {
      const node = {
        id: n.id,
        title: n.title,
        description: n.description,
        tags: n.tags,
        acceptanceCriteria: n.acceptanceCriteria,
        metadata: n.metadata,
      }
      const preview = await coupleNode(store, node, { apply: false, workspaceDir: dir })
      if (preview.skipped) continue
      eligible++
      if (auto) {
        await emitTaskHook(store, 'scaffold:requested', { nodeId: n.id, apply: true, workspaceDir: dir })
        generated++
      }
    }
    if (auto) await flushHooks(store)
    if (eligible === 0) return '✓ nenhum node com scaffold determinístico disponível'
    return auto
      ? `✓ ${generated} scaffold(s) gerado(s) deterministicamente (0 token)`
      : `${eligible} scaffold(s) disponível(eis) — use --auto para gerar`
  }

  private runVerify(testCmd: string): string {
    try {
      execSync(testCmd, { stdio: 'pipe', timeout: 30000, windowsHide: true })
      return '\u2713 tests pass'
    } catch (err: unknown) {
      const stderr = err instanceof Error ? err.message : String(err)
      return `\u26a0 tests failed: ${stderr}`
    }
  }

  private detectUnimplemented(doc: { nodes: Array<{ type: string; status: string }> }): string {
    const backlog = doc.nodes.filter((n) => n.type === 'task' && n.status === 'backlog').length
    const done = doc.nodes.filter((n) => n.status === 'done').length
    return `${backlog} task(s) backlog, ${done} task(s) done`
  }

  private runDogfoodingSteps(lines: string[], config: HealingConfig): string {
    const selfChecks: string[] = []
    if (lines.length >= 6) selfChecks.push('\u2713 6 steps reported')
    if (!config.dryRun || lines.some((l) => l.includes('dry-run'))) selfChecks.push('\u2713 dry-run flag correct')
    if (selfChecks.length >= 2) return '\u2713 self-assessment pass'
    return '\u26a0 self-assessment partial'
  }
}
