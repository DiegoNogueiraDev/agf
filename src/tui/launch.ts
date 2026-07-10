/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Bootstrap da TUI — carrega o dashboard do store, monta a porta de comandos e
 * renderiza o container interativo (Ink). Imports de `ink`/`react` ficam neste
 * módulo (carregado sob demanda pelo comando `tui`), mantendo o startup leve.
 */
import { createElement } from 'react'
import { render } from 'ink'
import { InteractiveApp } from './interactive-app.js'
import { loadDashboardModel } from './model.js'
import type { CommandPort, AsyncCommandPort } from './dispatch.js'
import { makeAlgorithmsPort } from './algorithms-port.js'
import type { LiveRunner } from './live-runner.js'
import { findNextTask } from '../core/planner/next-task.js'
import { summarizeLedger, persistLedger } from '../core/observability/llm-call-ledger.js'
import { buildProofSnapshot, formatProofSnapshot } from '../core/economy/proof-snapshot.js'
import { runAutopilot, type AutopilotStep } from '../core/autonomy/autopilot-loop.js'
import { resolveHarvestHook } from '../cli/shared/build-harvest-hook.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { buildLiveImplement } from '../cli/shared/live-implement.js'
import { makeStorePort } from '../cli/shared/store-port.js'
import { collectStatus, formatStatus } from '../cli/shared/status-report.js'
import { calculateCost } from '../core/observability/cost-tracker.js'
import { listSkills, invokeSkill, defaultSkillRoots } from '../core/skills/skill-registry.js'
import { resolveTierModel } from '../core/model-hub/tier-router.js'
import { listPrinciples } from '../core/doctrine/principles.js'
import { listProviders, resolveProviderConfig } from '../core/model-hub/provider-registry.js'
import { selectProvider } from '../core/model-hub/resolve-provider.js'
import { evaluateProjectQuality } from '../core/harness/project-quality.js'
import { calculateDoraMetrics } from '../core/insights/dora-metrics.js'
import { detectBottlenecks } from '../core/insights/bottleneck-detector.js'
import { calculatePhaseDistribution } from '../core/insights/phase-distribution.js'
import { calculateMetrics } from '../core/insights/metrics-calculator.js'
import { checkDesignReadiness } from '../core/designer/definition-of-ready.js'
import { checkReviewReadiness } from '../core/reviewer/review-readiness.js'
import { checkHandoffReadiness } from '../core/handoff/delivery-checklist.js'
import { checkDeployReadiness } from '../core/deployer/deploy-readiness.js'
import { checkListeningReadiness } from '../core/listener/feedback-readiness.js'
import { SqliteLearningStore } from '../core/learning/sqlite-learning-store.js'
import { actionStats } from '../core/learning/learning-actions.js'
import { runHealing } from '../core/skills/persist-healing.js'
import { collectSrcFiles } from '../core/harness/collect-src.js'
import { createDefaultRegistry } from './skill-registry.js'
import { SessionCache } from './slash/session-cache.js'
import { warmupCache } from './slash/cache-warmup.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { buildLiveRunResult } from './live-run-result.js'
import { detectAgfLlm } from '../cli/shared/delegation.js'
import { McpGraphError } from '../core/utils/errors.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/launch.ts' })

// ── Skill Handlers (TUI-native, no MCP) ──────────────
import { GraphAnalyzeHandler } from '../skills/analyze/graph-analyze.js'
import { GraphPrdHandler } from '../skills/analyze/graph-prd.js'
import { GraphDesignHandler } from '../skills/design/graph-design.js'
import { GraphPlanHandler } from '../skills/plan/graph-plan.js'
import { GraphImplementHandler } from '../skills/implement/graph-implement.js'
import { GraphBugsHandler } from '../skills/implement/graph-bugs.js'
import { GraphValidateHandler } from '../skills/validate/graph-validate.js'
import { GraphPlatformHandler } from '../skills/validate/graph-platform.js'
import { GraphReviewHandler } from '../skills/review/graph-review.js'
import { GraphSecurityHandler } from '../skills/review/graph-security.js'
import { GraphQualityHandler } from '../skills/review/graph-quality.js'
import { GraphHandoffHandler } from '../skills/handoff/graph-handoff.js'
import { GraphDeployHandler } from '../skills/deploy/graph-deploy.js'
import { GraphListeningHandler } from '../skills/listening/graph-listening.js'
import { GraphHealHandler } from '../skills/cross-cutting/graph-heal.js'
import { GraphNavigationHandler } from './slash/graph-navigation.js'
import { BrowserHandler } from '../skills/cross-cutting/graph-browser.js'
import { CdpBrowserPort } from './cdp-browser-port.js'
import { DecomposePrdHandler } from '../skills/analyze/decompose-prd.js'
import { ToPrdHandler } from '../skills/analyze/to-prd.js'
import { PlanSprintHandler } from '../skills/plan/plan-sprint.js'
import { TracerBulletTddHandler } from '../skills/implement/tracer-bullet-tdd.js'
import { DodChecklistHandler } from '../skills/validate/dod-checklist.js'
import { HarnessRegressionCheckHandler } from '../skills/validate/harness-regression-check.js'
import { DeepModuleReviewHandler } from '../skills/review/deep-module-review.js'
import { ZoomOutHandler } from '../skills/review/zoom-out.js'

const STEP_ICON: Record<string, string> = { done: '✓', escalated: '⚠', in_progress: '→' }

/** Soma o custo USD das chamadas registradas no ledger (via tabela de preço). */
function ledgerCostUsd(ledger: TokenLedger): number {
  return ledger.entries().reduce((acc, e) => acc + calculateCost(e.model, e.tokensIn, e.tokensOut).totalUsd, 0)
}

/** Monta o runner de execução ao vivo (autopilot/run) sobre o store. */
function buildLiveRunner(store: SqliteStore): LiveRunner {
  return {
    async autopilot(maxIterations, onLine, signal) {
      const ledger = new TokenLedger()
      const live = buildLiveImplement({
        store,
        dir: process.cwd(),
        testCmd: 'npm test',
        retries: 2,
        ledger,
        onLog: onLine,
      })
      const port = makeStorePort(store)
      const result = await runAutopilot(port, {
        maxIterations,
        implement: live.implement,
        onHarvest: resolveHarvestHook(store, process.cwd(), {}),
        signal,
        onStep: (s: AutopilotStep) => onLine(`${STEP_ICON[s.action] ?? '·'} ${s.title} [${s.action}] ${s.detail}`),
      })
      const t = ledger.totals()
      return `Resumo: ${result.completed} concluída(s), ${result.escalated} escalada(s) · ${t.total} tok ≈ $${ledgerCostUsd(ledger).toFixed(4)} (parou: ${result.stopped})`
    },
    async run(prompt, onLine) {
      const llm = detectAgfLlm(store, process.env)
      const result = await buildLiveRunResult({
        prompt,
        available: llm.available,
        implement: async (p) => {
          const ledger = new TokenLedger()
          const live = buildLiveImplement({
            store,
            dir: process.cwd(),
            testCmd: 'npm test',
            retries: 2,
            ledger,
            onLog: onLine,
          })
          const ok = await live.implement({ id: `run_${Date.now().toString(36)}`, title: p })
          const t = ledger.totals()
          return `${ok ? '✓ verde' : '⚠ falhou'} · ${t.total} tok ≈ $${ledgerCostUsd(ledger).toFixed(4)}`
        },
      })
      return result.summary
    },
  }
}

/** Adapta o `SqliteStore` à porta estreita usada pelos slash-commands. */
export function buildCommandPort(store: SqliteStore): CommandPort {
  return {
    findNext() {
      const r = findNextTask(store.toGraphDocument())
      if (!r) return null
      if (r.warning === 'all_tasks_blocked') return { blocked: true }
      return { id: r.node.id, title: r.node.title, reason: r.reason }
    },
    stats() {
      const s = store.getStats()
      return { totalNodes: s.totalNodes, byStatus: s.byStatus }
    },
    metrics() {
      const s = summarizeLedger(store.getDb())
      return { total: s.totals.total, costUsd: s.totals.costUsd, calls: s.totals.calls }
    },
    proofSnapshot() {
      return buildProofSnapshot(store)
    },
    status() {
      return formatStatus(collectStatus(store)).join('\n')
    },
    getPhase() {
      return store.getProjectSetting?.('currentPhase') ?? 'IMPLEMENT'
    },
    getModel() {
      return resolveTierModel('build')
    },
    listSkills(phase?: string) {
      const roots = defaultSkillRoots(process.cwd())
      return roots.flatMap((r) => {
        const { skills } = listSkills(r, phase)
        return skills.map((s) => ({ name: s.name, desc: s.description, category: s.category }))
      })
    },
    getSkill(name: string) {
      for (const r of defaultSkillRoots(process.cwd())) {
        const found = invokeSkill(r, name)
        if (found) return { name: found.name, body: found.body }
      }
      return undefined
    },
    principles() {
      return listPrinciples().map((p) => ({ title: p.title, category: p.category, statement: p.statement }))
    },
    providers() {
      return ['copilot', ...listProviders()]
    },
    providerCurrent() {
      const setting = store.getProjectSetting?.('provider') ?? null
      const baseUrl = store.getProjectSetting?.('provider_base_url') ?? undefined
      const choice = selectProvider(setting, process.env, baseUrl)
      return choice.kind === 'copilot'
        ? `copilot${setting && setting !== 'copilot' ? ` (setting='${setting}' sem chave → fallback)` : ''}`
        : `${choice.providerId} (${choice.baseURL})`
    },
    providerSet(id: string) {
      if (id !== 'copilot' && !resolveProviderConfig(id)) return `Provider desconhecido: ${id}. Use /provider list.`
      store.setProjectSetting?.('provider', id)
      // Limpa o endpoint ao trocar (evita base-url de um provider vazar p/ outro).
      store.setProjectSetting?.('provider_base_url', '')
      return `✓ provider = ${id}`
    },
    providerSetUrl(url: string) {
      const v = url.trim()
      store.setProjectSetting?.('provider_base_url', v)
      return v ? `✓ endpoint = ${v}` : '✓ endpoint limpo (volta ao baseURL padrão)'
    },
    quality() {
      const files = collectSrcFiles(process.cwd())
      const r = evaluateProjectQuality(files)
      return {
        testScore: r.testScore,
        logScore: r.logScore,
        passed: r.gate.passed,
        totalModules: r.totalModules,
        darkModules: r.darkModules,
      }
    },
    insights(sub: string) {
      const doc = store.toGraphDocument()
      if (sub === 'dora') {
        const d = calculateDoraMetrics(store)
        const alert = d.trendAlert.active ? ` ⚠ ${d.trendAlert.message}` : ''
        return `DORA: deploy/dia=${d.deploymentFrequency.toFixed(2)} · lead p50=${d.leadTime.p50.toFixed(2)}h · CFR=${(d.changeFailureRate * 100).toFixed(0)}% · ${d.trend}${alert}`
      }
      if (sub === 'bottlenecks') {
        const b = detectBottlenecks(doc)
        return `Gargalos: ${b.blockedTasks.length} bloqueadas · ${b.missingAcceptanceCriteria.length} sem AC · ${b.oversizedTasks.length} oversized`
      }
      if (sub === 'phases') {
        return calculatePhaseDistribution(doc)
          .map((p) => `${p.phase}: ${p.taskCount} (${p.percentage.toFixed(0)}%)`)
          .join(' · ')
      }
      const m = calculateMetrics(doc)
      const b = detectBottlenecks(doc)
      return `Insights: ${m.totalTasks} tasks · ${(m.completionRate * 100).toFixed(0)}% done · ${b.blockedTasks.length} bloqueadas — use /insights dora|bottlenecks|phases`
    },
    gate(phase: string) {
      const doc = store.toGraphDocument()
      const runners: Record<string, () => { ready: boolean; score: number; grade: string }> = {
        design: () => checkDesignReadiness(doc),
        review: () => checkReviewReadiness(doc),
        handoff: () => checkHandoffReadiness(doc),
        deploy: () => checkDeployReadiness(doc),
        listening: () => checkListeningReadiness(doc),
      }
      const phases = phase === 'all' ? Object.keys(runners) : [phase]
      const lines: string[] = []
      for (const p of phases) {
        const run = runners[p]
        if (!run) return `Fase desconhecida: ${p}. Use design|review|handoff|deploy|listening|all.`
        const r = run()
        lines.push(`gate ${p}: ${r.ready ? '✓ READY' : '✗ NOT READY'} (score ${r.score}, ${r.grade})`)
      }
      return lines.join('\n')
    },
    learning(_sub: string) {
      const stats = actionStats(new SqliteLearningStore(store))
      if (stats.totalRecords === 0) return 'Learning: sem registros ainda — rode /autopilot.'
      const top = stats.agents
        .slice(0, 5)
        .map((a) => `${a.agentId} (tasks=${a.taskCount}, AC=${(a.acPassRate * 100).toFixed(0)}%)`)
        .join(' · ')
      return `Learning: ${stats.totalRecords} registro(s) — ${top}`
    },
    heal(arg: string) {
      const apply = arg.trim() === 'apply'
      const { report, applied, detected } = runHealing(store, { apply })
      const mode = apply ? 'APPLY' : 'DRY-RUN'
      if (detected === 0) return `Self-healing [${mode}]: grafo saudável — nada a curar.`
      return `Self-healing [${mode}]: ${detected} problema(s), ${report.actions.length} ação(ões)${apply ? `, ${applied} aplicada(s)` : ' (use /heal apply)'}`
    },
    getGraphNodes() {
      const doc = store.toGraphDocument()
      return doc.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        status: n.status,
        parentId: n.parentId,
        sprint: n.sprint,
      }))
    },
    cacheStats() {
      return {
        sessionHits: 0,
        sessionMisses: 0,
        sessionSize: 0,
        sessionCapacity: 0,
        sessionEvictions: 0,
        toolCacheHits: 0,
        toolCacheMisses: 0,
        toolCacheInvalidations: 0,
        tokensSavedEstimate: 0,
        costAvoidedUsd: 0,
      }
    },
    algorithms: makeAlgorithmsPort(store),
  }
}

/** Monta a porta assíncrona (check, decompose, import-prd, doctor). */
export function buildAsyncPort(store: SqliteStore, dir: string): AsyncCommandPort {
  return {
    async check(nodeId: string): Promise<string> {
      const { checkDefinitionOfDone } = await import('../core/implementer/definition-of-done.js')
      const doc = store.toGraphDocument()
      const report = checkDefinitionOfDone(doc, nodeId)
      const checks = report.checks ?? []
      if (checks.length === 0) return `Node não encontrado ou sem checks: ${nodeId}`
      const lines = checks.map((c: { name: string; passed: boolean; message?: string }) => {
        const icon = c.passed ? '✓' : '✗'
        return `${icon} ${c.name}${c.message ? `: ${c.message}` : ''}`
      })
      const passed = checks.filter((c: { passed: boolean }) => c.passed).length
      lines.push(`\nDoD: ${passed}/${checks.length} checks passaram`)
      return lines.join('\n')
    },
    async decompose(): Promise<string> {
      const { detectLargeTasks } = await import('../core/planner/decompose.js')
      const doc = store.toGraphDocument()
      const results = detectLargeTasks(doc)
      if (results.length === 0) return '✓ Nenhuma task grande encontrada.'
      return results.map((r) => `⚠ ${r.node.id} "${r.node.title}" — ${r.reasons.join(', ')}`).join('\n')
    },
    async importPrd(file: string): Promise<string> {
      const { readFileContent } = await import('../core/parser/file-reader.js')
      const { extractEntities } = await import('../core/parser/extract.js')
      const { convertToGraph } = await import('../core/importer/index.js')
      const fileResult = await readFileContent(file)
      const entities = extractEntities(fileResult.text)
      const graph = convertToGraph(entities, file)
      if (!store.getProject()) store.initProject(dir.split('/').pop() ?? 'project')
      store.bulkInsert(graph.nodes, graph.edges)
      ;(store as { recordImport?: (f: string, n: number, e: number) => void }).recordImport?.(
        file,
        graph.nodes.length,
        graph.edges.length,
      )
      return `✓ Importado: ${graph.nodes.length} nós, ${graph.edges.length} arestas`
    },
    async runDoctor(): Promise<string> {
      const { runDoctor } = await import('../core/doctor/doctor-runner.js')
      const report = await runDoctor(dir)
      const lines = report.checks.map((c) => {
        const icon = c.level === 'ok' ? '✓' : c.level === 'warning' ? '⚠' : '✗'
        return `${icon} ${c.name}: ${c.message}`
      })
      lines.push(`\nResumo: ${report.summary.ok} ok · ${report.summary.warning} warn · ${report.summary.error} erro`)
      return lines.join('\n')
    },
    async build(arg: string): Promise<string> {
      const { runDelivery } = await import('../core/orchestrator/run-delivery.js')
      const { deriveDeliveryState } = await import('../core/orchestrator/delivery-state.js')
      const { autoDecomposeLarge } = await import('../core/planner/auto-decompose.js')
      const ledger = new TokenLedger()
      const live = buildLiveImplement({ store, dir, testCmd: 'npm test', retries: 2, ledger })
      const port = makeStorePort(store)
      const maxSteps = Math.max(1, parseInt(arg, 10) || 20)
      const report = await runDelivery(
        () => deriveDeliveryState(store),
        {
          importPrd: async () => {
            throw new McpGraphError('sem PRD no grafo — use /generate-prd ou /import-prd primeiro')
          },
          decompose: async () => {
            autoDecomposeLarge(store)
          },
          implement: async () => {
            await runAutopilot(port, {
              maxIterations: 1,
              implement: live.implement,
              onHarvest: resolveHarvestHook(store, dir, {}),
            })
          },
        },
        { maxSteps },
      )
      persistLedger(store.getDb(), ledger, { sessionId: 'tui_build', provider: 'copilot' })
      return `Build: ${report.steps} passo(s), parou em '${report.stopped}'. Tokens: ${ledger.totals().total}.`
    },
    async generatePrd(description: string): Promise<string> {
      const { generatePrd } = await import('../core/prd/generate-prd.js')
      const { extractEntities } = await import('../core/parser/extract.js')
      const { convertToGraph } = await import('../core/importer/index.js')
      const { buildClientFromProject } = await import('../cli/shared/provider-context.js')
      const { client } = buildClientFromProject(store)
      const ledger = new TokenLedger()
      const md = await generatePrd(description, {
        generate: async (p) => {
          const res = await client.run('plan', p)
          ledger.recordCall('tui_prd', {
            model: res.model,
            prompt: p,
            response: res.text,
            reportedIn: res.tokensIn,
            reportedOut: res.tokensOut,
            reportedCachedIn: res.cachedTokensIn,
            fromCache: res.fromCache,
          })
          return res.text
        },
      })
      const entities = extractEntities(md)
      const graph = convertToGraph(entities, 'PRD.md')
      if (!store.getProject()) store.initProject(dir.split('/').pop() ?? 'project')
      store.bulkInsert(graph.nodes, graph.edges)
      persistLedger(store.getDb(), ledger, { sessionId: 'tui_prd', provider: 'copilot' })
      return `✓ PRD gerado e importado: ${graph.nodes.length} nós, ${graph.edges.length} arestas`
    },
    async deliver(request: string): Promise<string> {
      // Mesma cadeia do CLI `deliver`: normalizar (0 token) → PRD → grafo → build.
      const { generatePrd } = await import('../core/prd/generate-prd.js')
      const { extractEntities } = await import('../core/parser/extract.js')
      const { convertToGraph } = await import('../core/importer/index.js')
      const { normalizeInput } = await import('../core/intake/normalize-input.js')
      const { buildClientFromProject } = await import('../cli/shared/provider-context.js')
      const { runBuildOrchestration } = await import('../cli/shared/run-build.js')
      const ledger = new TokenLedger()
      const { client } = buildClientFromProject(store)
      const norm = await normalizeInput({ kind: 'text', value: request })
      const md = await generatePrd(norm.text, {
        generate: async (p) => {
          const res = await client.run('plan', p)
          ledger.recordCall('deliver_prd', {
            model: res.model,
            prompt: p,
            response: res.text,
            reportedIn: res.tokensIn,
            reportedOut: res.tokensOut,
            fromCache: res.fromCache,
          })
          return res.text
        },
      })
      if (!store.getProject()) store.initProject(dir.split('/').pop() ?? 'project')
      const graph = convertToGraph(extractEntities(md), 'PRD.md')
      store.bulkInsert(graph.nodes, graph.edges)
      const report = await runBuildOrchestration(store, {
        dir,
        maxSteps: 20,
        live: false,
        testCmd: 'npm test',
        ledger,
        onLog: () => {},
      })
      persistLedger(store.getDb(), ledger, { sessionId: 'tui_deliver', provider: 'copilot' })
      return `✓ deliver: ${graph.nodes.length} nós → ${report.steps} passo(s), '${report.stopped}'. Tokens: ${ledger.totals().total} (${norm.tokensSaved} evitados no intake).`
    },
    async gaps(severity?: string): Promise<string> {
      const { detectAllGaps } = await import('../core/gaps/index.js')
      const { formatGapsHuman } = await import('../core/gaps/format.js')
      const doc = store.toGraphDocument()
      const all = detectAllGaps(doc)
      const filtered = severity === 'required' ? all.filter((g) => g.severity === 'required') : all
      if (filtered.length === 0) return '✓ Sem lacunas detectadas.'
      const { buildGapReport } = await import('../core/gaps/gap-types.js')
      return formatGapsHuman(buildGapReport(filtered))
    },
    async savings(reset?: boolean): Promise<string> {
      const { getCumulativeSavings, resetSavings, formatSavingsReport } =
        await import('../core/economy/savings-tracker.js')
      if (reset) {
        resetSavings(store)
        return '✓ Savings zerados.'
      }
      const s = getCumulativeSavings(store)
      const proof = buildProofSnapshot(store)
      return [...formatSavingsReport(s), ...formatProofSnapshot(proof)].join('\n')
    },
    async preflight(topic: string): Promise<string> {
      const { runPreflight, deriveTopic } = await import('../core/preflight/preflight.js')
      const { realGitProbe, makeGraphProbe } = await import('../core/preflight/preflight-adapters.js')
      const t = deriveTopic(topic)
      const report = runPreflight({ topic: t, git: realGitProbe, graph: makeGraphProbe(store) })
      const lines: string[] = [`Preflight: ${report.verdict}`]
      for (const f of report.findings) lines.push(`  ${f}`)
      return lines.join('\n')
    },
    async brief(id: string): Promise<string> {
      const { buildEnrichedBrief, renderBriefMarkdown } = await import('../core/context/executor-brief.js')
      const brief = await buildEnrichedBrief(store, id, { projectDir: dir })
      if (brief === null) return `Node "${id}" não encontrado no grafo.`
      return renderBriefMarkdown(brief)
    },
    async submit(id: string): Promise<string> {
      return `Para submeter o resultado, use o terminal:\n  agf submit ${id} --result '{"arquivos":[],"testes":{"passed":0,"failed":0},"desvios":[]}'`
    },
    providers() {
      return ['copilot', ...listProviders()]
    },
    providerCurrent() {
      const setting = store.getProjectSetting?.('provider') ?? null
      const baseUrl = store.getProjectSetting?.('provider_base_url') ?? undefined
      const choice = selectProvider(setting, process.env, baseUrl)
      return choice.kind === 'copilot' ? 'copilot' : `${choice.providerId} (${choice.baseURL})`
    },
    providerSet(id: string) {
      if (id !== 'copilot' && !resolveProviderConfig(id)) return `Provider desconhecido: ${id}`
      store.setProjectSetting?.('provider', id)
      store.setProjectSetting?.('provider_base_url', '')
      return `✓ provider = ${id}`
    },
    providerSetUrl(url: string) {
      store.setProjectSetting?.('provider_base_url', url.trim())
      return url.trim() ? `✓ endpoint = ${url.trim()}` : '✓ endpoint limpo'
    },
    async providerConnect(id: string, apiKey?: string): Promise<string> {
      const { resolveProviderConfig } = await import('../core/model-hub/provider-registry.js')
      const { pingProvider } = await import('../core/doctor/provider-ping.js')

      const cfg = resolveProviderConfig(id)
      const isOllama = id === 'ollama'

      if (!cfg && !isOllama) return `Provider desconhecido: "${id}". Use /provider list para ver os disponíveis.`

      // Determine source: env > manual > ollama-local
      const envVar = cfg?.envVar ?? ''
      const envKey = envVar ? process.env[envVar] : undefined
      let source: 'env' | 'manual' | 'ollama-local'
      let effectiveKey: string | undefined

      if (isOllama) {
        source = 'ollama-local'
        effectiveKey = undefined
      } else if (envKey) {
        source = 'env'
        effectiveKey = envKey
      } else if (apiKey) {
        source = 'manual'
        effectiveKey = apiKey
        // Persist the key to the project env file is out of scope; user must export it manually
      } else {
        return `Nenhuma chave para "${id}". Exporte ${envVar} ou passe a chave: /provider connect ${id} <api-key>`
      }

      // Persist provider choice (key is never stored — only the provider id and optional base-url)
      store.setProjectSetting?.('provider', id)
      if (isOllama) store.setProjectSetting?.('provider_base_url', 'http://localhost:11434/v1')

      // Probe reachability (3 s timeout, real fetch)
      const baseURL = isOllama ? 'http://localhost:11434/v1' : (cfg?.baseURL ?? '')
      const pingResult = await pingProvider(
        { provider: id, envVar, endpoint: `${baseURL}/models` },
        effectiveKey ?? '',
        3000,
        fetch as Parameters<typeof pingProvider>[3],
      ).catch(() => ({ reachable: false }))

      const status = pingResult.reachable ? '✓ alcançável' : '⚠ sem resposta (verifique a chave/rede)'
      return `✓ Provider: ${id} | fonte: ${source} | ${status}\nPersistido: provider=${id}${isOllama ? ', base-url=http://localhost:11434/v1' : ''}`
    },
    async loopStart(payload: string, every: string): Promise<string> {
      const { spawnSync } = await import('node:child_process')
      const result = spawnSync('npm', ['run', 'dev', '--', 'loop', 'start', payload, '--every', every], {
        encoding: 'utf8',
        cwd: dir,
      })
      return result.stdout?.trim() || result.stderr?.trim() || `Loop iniciado: ${payload} a cada ${every}`
    },
    async loopStop(target: string): Promise<string> {
      const { spawnSync } = await import('node:child_process')
      const result = spawnSync('npm', ['run', 'dev', '--', 'loop', 'stop', target], {
        encoding: 'utf8',
        cwd: dir,
      })
      return result.stdout?.trim() || result.stderr?.trim() || `Loop ${target} parado`
    },
    async agfStart(): Promise<string> {
      const { spawnSync } = await import('node:child_process')
      const result = spawnSync('npm', ['run', 'dev', '--', 'start', '--dir', dir], {
        encoding: 'utf8',
        cwd: dir,
      })
      return result.stdout?.trim() || result.stderr?.trim() || 'agf start: nenhuma task disponível'
    },
    async feedback(message: string): Promise<string> {
      // agf never transmits on the user's behalf. Feedback is a link the human
      // follows, not a payload the tool ships — no machine fingerprint, no token,
      // no silent POST. See src/tests/local-first-no-network.test.ts.
      const url = 'https://github.com/DiegoNogueiraDev/agf/issues/new'
      return `agf não envia nada por você. Abra a issue em ${url}

${message.trim()}`
    },
  }
}

/** Abre a TUI interativa sobre um store já aberto; resolve quando o usuário sai. */
export async function launchTui(store: SqliteStore): Promise<void> {
  log.info('launching TUI')
  const dir = process.cwd()
  const dashboard = loadDashboardModel(store)
  const port = buildCommandPort(store)
  const cachedPort = new SessionCache(port)
  // Pre-warming assíncrono: popula cache sem bloquear a renderização
  setImmediate(() => {
    void warmupCache(cachedPort)
  })
  const asyncPort = buildAsyncPort(store, dir)
  const liveRunner = buildLiveRunner(store)

  // Cria o SkillRegistry com comandos built-in
  const registry = createDefaultRegistry()

  // Registra skills dinamicas de .agents/skills/ e src/skills/
  const skillCommands = defaultSkillRoots(dir).flatMap((r) => {
    const { skills } = listSkills(r)
    return skills.map((s) => {
      const cmd = {
        name: s.name,
        usage: `/${s.name}`,
        desc: `[${s.category}] ${s.description}`,
        source: 'skill' as const,
      }
      // Registra no registry unificado (sem handler por enquanto)
      registry.register({
        name: s.name,
        usage: `/${s.name}`,
        desc: s.description,
        phase: s.category ?? 'cross-cutting',
        handler: undefined,
      })
      return cmd
    })
  })

  // Registra handlers TUI (sem MCP) — substitui handler:undefined por handlers reais
  const handlerMap: Record<string, { handler: import('./skill-handler-port.js').SkillHandlerPort; usage: string }> = {
    'graph-analyze': { handler: new GraphAnalyzeHandler(), usage: '/graph-analyze' },
    'graph-prd': { handler: new GraphPrdHandler(), usage: '/graph-prd <descrição>' },
    'graph-design': { handler: new GraphDesignHandler(), usage: '/graph-design' },
    'graph-plan': { handler: new GraphPlanHandler(), usage: '/graph-plan' },
    'graph-implement': { handler: new GraphImplementHandler(), usage: '/graph-implement [nodeId]' },
    'graph-bugs': { handler: new GraphBugsHandler(), usage: '/graph-bugs [hunt|fix <desc>]' },
    'graph-validate': { handler: new GraphValidateHandler(), usage: '/graph-validate' },
    'graph-platform': { handler: new GraphPlatformHandler(), usage: '/graph-platform' },
    'graph-review': { handler: new GraphReviewHandler(), usage: '/graph-review' },
    'graph-security': { handler: new GraphSecurityHandler(), usage: '/graph-security' },
    'graph-quality': { handler: new GraphQualityHandler(), usage: '/graph-quality' },
    'graph-handoff': { handler: new GraphHandoffHandler(), usage: '/graph-handoff' },
    'graph-deploy': { handler: new GraphDeployHandler(), usage: '/graph-deploy' },
    'graph-listening': { handler: new GraphListeningHandler(), usage: '/graph-listening' },
    'graph-heal': { handler: new GraphHealHandler(), usage: '/graph-heal [graph|harness|learn] [--apply]' },
    'graph-navigation': { handler: new GraphNavigationHandler(), usage: '/graph-navigation [--auto]' },
    browser: { handler: new BrowserHandler(new CdpBrowserPort()), usage: '/browser <subcomando> [args]' },
    'decompose-prd': { handler: new DecomposePrdHandler(), usage: '/decompose-prd [epicId]' },
    'to-prd': { handler: new ToPrdHandler(), usage: '/to-prd <descrição>' },
    'plan-sprint': { handler: new PlanSprintHandler(), usage: '/plan-sprint [horas] [focusFactor]' },
    'tracer-bullet-tdd': { handler: new TracerBulletTddHandler(), usage: '/tracer-bullet-tdd [nodeId]' },
    'dod-checklist': { handler: new DodChecklistHandler(), usage: '/dod-checklist [nodeId]' },
    'harness-regression-check': {
      handler: new HarnessRegressionCheckHandler(),
      usage: '/harness-regression-check [--save] [--reset]',
    },
    'deep-module-review': { handler: new DeepModuleReviewHandler(), usage: '/deep-module-review [dir]' },
    'zoom-out': { handler: new ZoomOutHandler(), usage: '/zoom-out <arquivo | dir>' },
  }
  for (const [name, h] of Object.entries(handlerMap)) {
    const existing = registry.find(name)
    if (existing) {
      registry.register({ ...existing, handler: h.handler, usage: h.usage })
    } else {
      registry.register({
        name,
        usage: h.usage,
        desc: `${name.replace('graph-', '').replace(/-/g, ' ')} (handler)`,
        phase: 'cross-cutting',
        handler: h.handler,
      })
    }
  }

  const instance = render(
    createElement(InteractiveApp, {
      dashboard,
      port: cachedPort,
      asyncPort,
      liveRunner,
      skillCommands,
      skillRegistry: registry,
      store,
      dir,
      testCmd: 'npm test',
    }),
  )
  await instance.waitUntilExit()
}
