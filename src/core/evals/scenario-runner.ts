/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Runner de cenário do eval — semeia um workspace temp real, importa o PRD do
 * cenário, dirige o agente (via `orchestrate` INJETADO — a CLI passa
 * `runBuildOrchestration`, mantendo `core/` livre de `cli/`) e pontua pelo oráculo
 * `tests-green` + `done` do DoD. Store in-memory: só os arquivos do workspace
 * importam para o teste. Injetável → testes 0-token com `orchestrate`/`runTest` fakes.
 */
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { createLogger } from '../utils/logger.js'
import { classifyLlmError } from '../model-hub/llm-error.js'

const log = createLogger({ layer: 'core', source: 'scenario-runner.ts' })
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { SqliteStore } from '../store/sqlite-store.js'
import { TokenLedger } from '../autonomy/token-ledger.js'
import { persistLedger } from '../observability/llm-call-ledger.js'
import { calculateCost } from '../observability/cost-tracker.js'
import { computeQualityScore } from '../economy/eval-rubric.js'
import { testsGreen, defaultTestRunner, type TestRunner } from './scorers.js'
import type { ScenarioResult } from './scorecard.js'
import type { DeliveryReport } from '../orchestrator/run-delivery.js'

export interface Scenario {
  id: string
  /** T0..T5 (atômico → ápice de produção). */
  tier: string
  /** 'dev' (task técnica) ou 'product' (ask de produto). */
  persona?: string
  /** PRD/descrição da task importada no grafo. */
  prd: string
  /** Oráculo: comando de teste do cenário (exit 0 = resolvido). */
  testCmd: string
  /** Diretório a copiar para o workspace (arquivos reais semeados). */
  seedDir?: string
  /** Alternativa inline: path → conteúdo (usado em testes). */
  seed?: Record<string, string>
  tags?: string[]
  /** Se true, despeja o estado do grafo em graph-state.json no workspace. */
  dumpGraph?: boolean
  /** Max token budget for the scenario (used by economy benchmark suite). */
  tokenBudget?: number
  /** Whether the scenario is expected to resolve (used by economy benchmark suite). */
  expectedResolve?: boolean
}

export interface RunScenarioOpts {
  live: boolean
  maxSteps?: number
  model?: string
  provider?: string
  baseUrl?: string
  /** Workspace fixo (default: temp). */
  dir?: string
}

/** Assinatura compatível com `runBuildOrchestration` (injetado pela CLI). */
export type Orchestrate = (
  store: SqliteStore,
  opts: {
    dir: string
    prd: string
    maxSteps: number
    live: boolean
    testCmd: string
    ledger: TokenLedger
    onLog: (m: string) => void
  },
) => Promise<DeliveryReport>

export interface RunScenarioDeps {
  orchestrate: Orchestrate
  runTest?: TestRunner
  now?: () => number
  onLog?: (m: string) => void
}

function seedWorkspace(scenario: Scenario, dir: string): void {
  if (scenario.seedDir && existsSync(scenario.seedDir)) cpSync(scenario.seedDir, dir, { recursive: true })
  if (scenario.seed) {
    for (const [rel, content] of Object.entries(scenario.seed)) {
      const fp = join(dir, rel)
      mkdirSync(dirname(fp), { recursive: true })
      writeFileSync(fp, content, 'utf8')
    }
  }
}

/** Roda um cenário ponta-a-ponta e devolve o resultado pontuado. */
export async function runScenario(
  scenario: Scenario,
  opts: RunScenarioOpts,
  deps: RunScenarioDeps,
): Promise<ScenarioResult> {
  const now = deps.now ?? ((): number => Date.now())
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), `eval-${scenario.id}-`))
  seedWorkspace(scenario, dir)
  const prdPath = join(dir, 'PRD.md')
  writeFileSync(prdPath, scenario.prd, 'utf8')

  // Store EFÊMERO em memória: o grafo não precisa persistir; só os arquivos do
  // workspace (onde o oráculo roda) importam.
  const store = SqliteStore.open(':memory:')
  store.initProject(scenario.id)
  if (opts.provider) store.setProjectSetting('provider', opts.provider)
  if (opts.baseUrl) store.setProjectSetting('provider_base_url', opts.baseUrl)
  if (opts.model) store.setProjectSetting('model', opts.model)

  const ledger = new TokenLedger()
  const start = now()
  let report: DeliveryReport | null = null
  let orchestrateError: { message: string; kind: string } | undefined
  try {
    report = await deps.orchestrate(store, {
      dir,
      prd: prdPath,
      maxSteps: opts.maxSteps ?? 12,
      live: opts.live,
      testCmd: scenario.testCmd,
      ledger,
      onLog: deps.onLog ?? ((): void => {}),
    })
  } catch (err) {
    // runBuildOrchestration lança em escalação — conta como não-resolvido. Uma
    // falha PERMANENTE do provider (ex.: 401 auth com key inválida) não pode
    // virar resolve=0 silencioso: classifica, loga estruturado (o onLog pode ser
    // um sink no-op) e PROPAGA no ScenarioResult para a superfície explicar o porquê.
    const message = err instanceof Error ? err.message : String(err)
    const kind = classifyLlmError(err).kind
    orchestrateError = { message, kind }
    log.warn('scenario:orchestrate-failed', { scenario: scenario.id, kind, error: message })
    deps.onLog?.(`escalou: ${message}`)
  }
  const durationMs = now() - start
  // Sem report (exceção) = escalação.
  let stopped: string = report?.stopped ?? 'escalation'
  const steps = report?.steps ?? 0

  // Se o cenário pede, despeja o estado do grafo para o oracle test
  if (scenario.dumpGraph) {
    try {
      const graphDoc = store.toGraphDocument()
      writeFileSync(join(dir, 'graph-state.json'), JSON.stringify(graphDoc, null, 2), 'utf8')
    } catch {
      /* dump é soft-fail */
    }
  }

  const totals = ledger.totals()

  // Enforce token budget: if cumulative tokens exceed scenario.tokenBudget, override stopped.
  if (scenario.tokenBudget !== undefined && totals.total > scenario.tokenBudget) {
    stopped = 'budget_exhausted'
  }

  // Oráculo primário: o test-suite do cenário ficou verde?
  const tests = testsGreen(dir, scenario.testCmd, deps.runTest ?? defaultTestRunner)
  const done = stopped === 'done'
  const resolved = tests.passed && done
  const model = opts.model ?? 'auto'
  const costUsd = calculateCost(model, totals.tokensIn, totals.tokensOut).totalUsd
  persistLedger(store.getDb(), ledger, { sessionId: `eval_${scenario.id}`, provider: 'copilot' })
  store.close()

  const { qualityScore } = computeQualityScore({
    correctness: resolved ? 1.0 : 0.0,
    ac_coverage: tests.passed ? 1.0 : 0.0,
    token_cost_usd: costUsd,
    latency_ms: durationMs,
    hallucination_count: 0,
  })

  return {
    id: scenario.id,
    tier: scenario.tier,
    model,
    persona: scenario.persona,
    resolved,
    testsPassed: tests.passed,
    done,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    tokensTotal: totals.total,
    cachedTokensIn: totals.cachedTokensIn,
    costUsd,
    attempts: steps,
    durationMs,
    stopped,
    qualityScore,
    ...(orchestrateError ? { error: orchestrateError.message, errorKind: orchestrateError.kind } : {}),
  }
}

interface ScenarioManifest {
  id?: string
  tier?: string
  persona?: string
  prd?: string
  prdFile?: string
  testCmd?: string
  tags?: string[]
  dumpGraph?: boolean
  tokenBudget?: number
  expectedResolve?: boolean
}

/** Options for {@link loadSuite}. `strict` turns a malformed scenario.json from a silent skip into an actionable throw. */
export interface LoadSuiteOptions {
  /**
   * When true, a malformed scenario.json throws an Error naming the offending file
   * instead of being silently skipped (node_8aa9c5027b13, AC3). The `economy:gate`
   * uses this so a broken fixture fails loudly. Default false ⇒ byte-identical
   * skip+warn (backward-compat for every non-gate suite load).
   */
  strict?: boolean
}

/**
 * Carrega uma suíte de `<dir>/<scenario>/scenario.json` (+ `seed/` opcional).
 * `prd` inline ou `prdFile` relativo. Filtro opcional por tier. Em `strict`,
 * JSON malformado lança erro nomeando o arquivo (senão apenas skip+warn).
 */
export function loadSuite(suiteDir: string, tierFilter?: string, opts: LoadSuiteOptions = {}): Scenario[] {
  if (!existsSync(suiteDir)) return []
  const out: Scenario[] = []
  for (const entry of readdirSync(suiteDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const base = join(suiteDir, entry.name)
    const manifestPath = join(base, 'scenario.json')
    if (!existsSync(manifestPath)) continue
    let m: ScenarioManifest
    try {
      m = JSON.parse(readFileSync(manifestPath, 'utf8')) as ScenarioManifest
    } catch (err) {
      if (opts.strict) {
        throw new Error(`Cenário mal-formado em ${manifestPath}: ${String(err)}`, { cause: err })
      }
      log.warn('scenario-runner: failed to parse scenario.json', { path: manifestPath, error: String(err) })
      continue
    }
    const tier = m.tier ?? 'T0'
    if (tierFilter && tier !== tierFilter) continue
    const prd =
      m.prd ?? (m.prdFile && existsSync(join(base, m.prdFile)) ? readFileSync(join(base, m.prdFile), 'utf8') : '')
    if (!prd) continue
    const seedDir = join(base, 'seed')
    out.push({
      id: m.id ?? entry.name,
      tier,
      persona: m.persona,
      prd,
      testCmd: m.testCmd ?? 'npm test',
      seedDir: existsSync(seedDir) ? seedDir : undefined,
      tags: m.tags,
      dumpGraph: m.dumpGraph,
      tokenBudget: m.tokenBudget,
      expectedResolve: m.expectedResolve,
    })
  }
  return out.sort((a, b) => a.tier.localeCompare(b.tier) || a.id.localeCompare(b.id))
}
