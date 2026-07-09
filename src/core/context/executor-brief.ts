/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { buildTaskContext } from './compact-context.js'
import { CodeStore } from '../code/code-store.js'
import { getColonySignals } from '../colony/colony-signals.js'
import { computeTaskCaste, casteToModelTier } from '../colony/task-caste.js'
import { analyzeImpact } from '../code/graph-traversal.js'
import { prepareTask } from '../autonomy/task-prep.js'
import { applyBriefCeiling, BRIEF_TOKEN_CEILING } from './brief-ceiling.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'executor-brief.ts' })

// ── Doctrine constants ───────────────────────────────────

/** Things the executor must NOT do (scope guardrails). */
const NOT_LIST: readonly string[] = [
  'não criar deps novas',
  'não refatorar vizinhos',
  'não mudar defaults',
  'não tocar hot-path',
]

/** What to do under uncertainty. */
const UNCERTAINTY = 'se o contrato falhar ou faltar info, PARE e reporte; se ambíguo, escolha e justifique em 1 linha'

/** Self-review checklist run before declaring done. */
const SELF_REVIEW: readonly string[] = [
  'sobrou placeholder?',
  'escopo vazou?',
  'todos os AC cobertos?',
  'default preservado?',
]

/** Definition of done gate, in order. */
const DOD: readonly string[] = ['typecheck', 'file test', 'blast', 'lint']

/** Shape the executor must return when it reports back. */
const RETURN_SCHEMA = '{arquivos[], testes{passed,failed}, desvios[]}'

// Judgment placeholders — seeded, must remain `<fill:` so the executor fills them.
const PLACEHOLDER_IMITATE = '<fill: arquivo-espelho a seguir como padrão>'
const PLACEHOLDER_READ_TOUCH = '<fill: paths exatos + símbolos a ler/reusar>'
const PLACEHOLDER_CONTRACT = '<fill: assinatura/tipos/comportamento>'
const PLACEHOLDER_TEST_WITH = '<fill: fixture/stub concreto, ex.: :memory:, counter>'

// ── Types ────────────────────────────────────────────────

export interface ExecutorBrief {
  /** node.description || node.title */
  intent: string
  task: { id: string; type: string; title: string; xpSize?: string; estimateMinutes?: number }
  /** judgment placeholder: mirror file to follow as the pattern */
  imitate: string
  /** judgment placeholder: exact paths + symbols to read/reuse */
  readTouch: string
  /** judgment placeholder, seeded: signature/types/behavior */
  contract: string
  /** from context (auto) */
  acceptanceCriteria: string[]
  /** doctrine constants */
  notList: string[]
  /** best-effort blast radius (index-independent) */
  blastRadius: string[]
  /** derived from xpSize */
  budget: string
  /** constant */
  uncertainty: string
  /** judgment placeholder: concrete fixture/stub */
  testWith: string
  /** constant: ['typecheck','file test','blast','lint'] */
  dod: string[]
  /** constant checklist */
  selfReview: string[]
  /** constant return schema */
  returnSchema: string
  /** blockers.length === 0 && dependsOn.every(d => d.resolved) */
  readyToDelegate: boolean
  /** unresolved blockers, for transparency */
  blockers: Array<{ id: string; title: string }>
  /** Optional ranked repo-map (PageRank, budgeted) — present only when the brief is enriched. */
  repoMap?: string
  /** Optional prior project memories surfaced for the task — present only when enriched. */
  priorMemories?: Array<{ name: string; snippet: string }>
  /** Optional reuse hint (a similar task's exact/scaffold match) — present only when enriched. */
  reuseHint?: string
  /**
   * Optional stigmergy pheromone trails — files that prior successful tasks touched,
   * strongest first, in a human-readable hint line. Present only when enriched and
   * the `stigmergy` lever is on.
   */
  pheromoneHints?: string
  /** Colony intelligence: recommended agent caste for this task context. */
  caste?: 'TRAIL' | 'EXPLORE' | 'FUNGAL'
  /** Colony health snapshot: deterministic, zero-LLM grade of overall project health. */
  colony_health?: { grade: string; caste: string; quarantined_count: number; suggested_model: string }
  /** Task-level caste recommendation derived from node.type + priority + AC complexity. */
  recommended_caste?: 'minima' | 'pequena' | 'media' | 'soldado'
  /** Model tier suggested for this task based on recommended_caste. */
  recommended_model?: 'cheap' | 'build' | 'frontier'
}

/** Tokens consumed by the external pilot (Claude/Copilot/Codex) when implementing this task. */
export interface PilotUsage {
  tokens_in: number
  tokens_out: number
  model: string
}

export interface ExecutorResult {
  arquivos: string[]
  testes: { passed: number; failed: number }
  desvios: string[]
  /** Optional: pilot's own token usage for ledger tracking. */
  usage?: PilotUsage
}

export function parseExecutorResult(raw: string): ExecutorResult | null {
  const trimmed = raw.trim()

  const jsonTry = trimmed.startsWith('{') ? trimmed : null
  if (jsonTry) {
    try {
      const parsed = JSON.parse(jsonTry)
      if (
        Array.isArray(parsed.arquivos) &&
        typeof parsed.testes?.passed === 'number' &&
        typeof parsed.testes?.failed === 'number' &&
        Array.isArray(parsed.desvios)
      ) {
        const result: ExecutorResult = {
          arquivos: parsed.arquivos,
          testes: parsed.testes,
          desvios: parsed.desvios,
        }
        if (
          parsed.usage &&
          typeof parsed.usage.tokens_in === 'number' &&
          typeof parsed.usage.tokens_out === 'number' &&
          typeof parsed.usage.model === 'string'
        ) {
          result.usage = {
            tokens_in: parsed.usage.tokens_in,
            tokens_out: parsed.usage.tokens_out,
            model: parsed.usage.model,
          }
        }
        return result
      }
    } catch {
      // fall through to regex extraction
    }
  }

  return null
}

export function validateBriefReady(brief: ExecutorBrief): { ready: boolean; unfilled: string[] } {
  const checkFields: Array<keyof ExecutorBrief> = ['imitate', 'readTouch', 'contract', 'testWith']
  const unfilled = checkFields.filter((key) => (brief[key] as string).includes('<fill:'))
  return { ready: unfilled.length === 0, unfilled }
}

// ── Helpers ──────────────────────────────────────────────

/** Map an xpSize to a short token-budget hint. Defaults to the S text. */
function budgetFromXpSize(xpSize: string | undefined): string {
  switch (xpSize) {
    case 'M':
      return '~3–5 arquivos, sem deps'
    case 'L':
    case 'XL':
      return 'decompor antes; >5 arquivos'
    case 'XS':
    case 'S':
    default:
      return '~1–2 arquivos, sem deps, sem hot-path'
  }
}

/**
 * Best-effort blast radius. Index-independent: works with ONLY a graph store.
 *
 * 1. If the node has a sourceRef.file, that path is the first entry.
 * 2. OPTIONALLY enrich via `analyzeImpact` over the code index — wrapped in
 *    try/catch so a missing index, missing symbol, or any failure is ignored.
 *
 * Never throws; returns `[]` when there is nothing to report.
 */
function bestEffortBlastRadius(store: SqliteStore, sourceFile: string | undefined): string[] {
  const radius: string[] = []
  if (sourceFile) radius.push(sourceFile)

  try {
    const project = store.getProject()
    // We only enrich when we have an anchor symbol to seed traversal. A planning
    // task node usually has none, so this is genuinely best-effort and the graph
    // store alone is always sufficient for the function to succeed.
    if (project && sourceFile) {
      const codeStore = new CodeStore(store.getDb())
      const symbolName = sourceFile
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '')
      if (symbolName) {
        const impact = analyzeImpact(codeStore, symbolName, project.id, 'upstream', 2)
        for (const affected of impact.affectedSymbols) {
          if (affected.file && !radius.includes(affected.file)) radius.push(affected.file)
        }
      }
    }
  } catch (err) {
    log.debug('executor-brief:blast-radius:skipped', { error: err instanceof Error ? err.message : String(err) })
  }

  return radius
}

// ── Main function ────────────────────────────────────────

/**
 * Build a structured executor brief (delegation spec) from a graph node.
 *
 * Pure, deterministic, no LLM, no CLI. Returns `null` when the node is missing
 * (the command layer maps that to NOT_FOUND). Judgment fields are left as
 * `<fill:` placeholders — the caller's judgment fills them, not this function.
 */
export function buildExecutorBrief(store: SqliteStore, nodeId: string): ExecutorBrief | null {
  const ctx = buildTaskContext(store, nodeId)
  if (!ctx) return null

  const { task, acceptanceCriteria, blockers, dependsOn, sourceRef } = ctx

  const intent = task.description ?? task.title

  const taskSummary: ExecutorBrief['task'] = {
    id: task.id,
    type: task.type,
    title: task.title,
  }
  if (task.xpSize !== undefined) taskSummary.xpSize = task.xpSize
  // estimateMinutes lives on the node, not on the compact TaskSummary — read it
  // directly to keep the brief faithful to the source node.
  const node = store.getNodeById(nodeId)
  if (node?.estimateMinutes !== undefined) taskSummary.estimateMinutes = node.estimateMinutes

  const blockerList = blockers.map((b) => ({ id: b.id, title: b.title }))
  const readyToDelegate = blockerList.length === 0 && dependsOn.every((d) => d.resolved)

  const signals = getColonySignals(store.getStats())
  const taskCaste = computeTaskCaste({
    type: task.type,
    priority: task.priority ?? 3,
    acceptanceCriteria,
  })
  return {
    intent,
    task: taskSummary,
    imitate: PLACEHOLDER_IMITATE,
    readTouch: PLACEHOLDER_READ_TOUCH,
    contract: PLACEHOLDER_CONTRACT,
    acceptanceCriteria,
    notList: [...NOT_LIST],
    blastRadius: bestEffortBlastRadius(store, sourceRef?.file),
    budget: budgetFromXpSize(task.xpSize),
    uncertainty: UNCERTAINTY,
    testWith: PLACEHOLDER_TEST_WITH,
    dod: [...DOD],
    selfReview: [...SELF_REVIEW],
    returnSchema: RETURN_SCHEMA,
    readyToDelegate,
    blockers: blockerList,
    caste: signals.caste,
    colony_health: {
      grade: signals.colony_health_grade,
      caste: signals.caste,
      quarantined_count: signals.quarantined_count,
      suggested_model: signals.suggested_model,
    },
    recommended_caste: taskCaste,
    recommended_model: casteToModelTier(taskCaste),
  }
}

/**
 * Build an ExecutorBrief enriched with the **shared** task-prep gains — the same
 * repo-map / reuse / memory-inject the `--live` provider path gets, delivered to the
 * external agent that actually writes the code (single prep authority: {@link prepareTask}).
 *
 * `buildExecutorBrief` stays the synchronous, deterministic core; this is the async
 * composition that attaches the optional enrichment fields. When nothing is available
 * to inject the fields stay absent and the rendered brief is byte-identical to the core.
 * `projectDir` enables the memory-inject (the safe per-task seam, no cached hot path).
 */
export async function buildEnrichedBrief(
  store: SqliteStore,
  nodeId: string,
  opts: { projectDir?: string } = {},
): Promise<ExecutorBrief | null> {
  const brief = buildExecutorBrief(store, nodeId)
  if (!brief) return null

  const prep = await prepareTask(
    store,
    { id: brief.task.id, title: brief.task.title },
    { ...(opts.projectDir !== undefined ? { projectDir: opts.projectDir } : {}) },
  )

  if (prep.repoMap) brief.repoMap = prep.repoMap
  if (prep.priorMemories.length > 0) {
    brief.priorMemories = prep.priorMemories.map((m) => ({ name: m.name, snippet: m.snippet }))
  }
  if (prep.reuse.kind === 'exact') {
    brief.reuseHint = `exact match — uma task idêntica já ficou verde; reutilize a abordagem (${prep.reuse.edits.length} edit(s)).`
  } else if (prep.reuse.kind === 'scaffold') {
    brief.reuseHint = `scaffold próximo (sim ${prep.reuse.similarity.toFixed(2)}) — reaproveite o que servir.`
  }

  if (prep.pheromoneTrails.length > 0) {
    brief.pheromoneHints =
      `Arquivos que tasks anteriores tocaram com sucesso (trilhas de feromônio — pode priorizar):\n` +
      prep.pheromoneTrails.map((f) => `  - ${f}`).join('\n')
  }

  return brief
}

// ── Colony brief (improve-briefing) ──────────────────────

const COLONY_CHARS_PER_TOKEN = 4
const COLONY_AC_CAP = 5
const COLONY_TRUNCATED_NOTE = '[truncated — agf brief <id> --full]'

/** Compressed, task-only briefing for a subagent. Carries zero session/global context. */
export interface ColonyBrief {
  /** The compressed briefing text (intent, AC, files, deps) — no CLAUDE.md/system prompt. */
  text: string
  /** Estimated tokens of `text` (4 chars/token heuristic). */
  tokenEstimate: number
  /** Char count of `text`. */
  chars: number
}

export interface ColonyBriefOptions {
  /** Token ceiling for the compressed brief. Defaults to BRIEF_TOKEN_CEILING (500). */
  ceiling?: number
}

/** Render only the task-relevant fields — never any session/global preamble. */
function renderColonyBrief(brief: ExecutorBrief): string {
  const files = brief.blastRadius.length > 0 ? brief.blastRadius.join(', ') : '(a definir)'
  const deps = brief.blockers.length > 0 ? brief.blockers.map((b) => `${b.id} (${b.title})`).join('; ') : '(nenhuma)'
  const acLines =
    brief.acceptanceCriteria.length > 0 ? brief.acceptanceCriteria.map((a) => `- ${a}`).join('\n') : '- (nenhum)'

  return [
    `TASK ${brief.task.id} (${brief.task.type}): ${brief.task.title}`,
    `Intent: ${brief.intent}`,
    `Files: ${files}`,
    `Deps: ${deps}`,
    `Ready: ${brief.readyToDelegate ? 'sim' : 'não'}`,
    'AC:',
    acLines,
    `NÃO: ${brief.notList.join('; ')}`,
  ].join('\n')
}

function estimateColonyTokens(text: string): number {
  return Math.ceil(text.length / COLONY_CHARS_PER_TOKEN)
}

/**
 * Build a COMPRESSED colony briefing for a subagent from a graph node.
 *
 * A subagent normally reloads the full CLAUDE.md + system prompt (~28k fixed
 * overhead) before touching a task. This carries ONLY task-relevant context —
 * intent, acceptance criteria, blast radius / files to touch, and deps — and
 * never any session/global preamble, so the per-subagent overhead collapses.
 *
 * Respects the existing brief ceiling: the underlying brief is passed through
 * {@link applyBriefCeiling}, and the rendered text is defensively trimmed (AC
 * list first, then a hard cap) so `tokenEstimate` never exceeds the ceiling.
 *
 * Pure and deterministic. Returns `null` when the node is missing (same
 * contract as {@link buildExecutorBrief}).
 */
export function buildColonyBrief(
  store: SqliteStore,
  nodeId: string,
  opts: ColonyBriefOptions = {},
): ColonyBrief | null {
  const core = buildExecutorBrief(store, nodeId)
  if (!core) return null

  const ceiling = opts.ceiling ?? BRIEF_TOKEN_CEILING
  const bounded = applyBriefCeiling(core)

  let text = renderColonyBrief(bounded)
  let tokenEstimate = estimateColonyTokens(text)

  // Defensive: task-only fields alone can still exceed the ceiling (e.g. a node
  // with a very long AC list). Trim the AC list first, then hard-cap the string.
  if (tokenEstimate > ceiling) {
    const trimmed: ExecutorBrief = {
      ...bounded,
      acceptanceCriteria: bounded.acceptanceCriteria.slice(0, COLONY_AC_CAP),
    }
    text = renderColonyBrief(trimmed)
    tokenEstimate = estimateColonyTokens(text)
  }
  if (tokenEstimate > ceiling) {
    const maxChars = ceiling * COLONY_CHARS_PER_TOKEN - COLONY_TRUNCATED_NOTE.length - 1
    text = `${text.slice(0, Math.max(0, maxChars)).trimEnd()}\n${COLONY_TRUNCATED_NOTE}`
    tokenEstimate = estimateColonyTokens(text)
  }

  return { text, tokenEstimate, chars: text.length }
}

// ── Renderers ────────────────────────────────────────────

/** Render a bullet list, with a "(nenhum)" fallback when empty. */
function bullets(items: readonly string[]): string {
  if (items.length === 0) return '- (nenhum)'
  return items.map((i) => `- ${i}`).join('\n')
}

/**
 * Render the brief as the "de outro mundo" markdown template — labeled sections
 * in a fixed order. Deterministic: no timestamps, no randomness. `<fill: …>`
 * placeholders render verbatim so the conductor sees exactly what to complete.
 */
export function renderBriefMarkdown(brief: ExecutorBrief): string {
  const { task } = brief
  const estimate = task.estimateMinutes !== undefined ? ` · ~${task.estimateMinutes}min` : ''
  const size = task.xpSize !== undefined ? ` · ${task.xpSize}` : ''
  const blast = brief.blastRadius.length > 0 ? brief.blastRadius.join(', ') : '(nenhum identificado)'

  const lines = [
    `# Brief de execução — ${task.title}`,
    '',
    `**Intenção:** ${brief.intent}`,
    '',
    `**Tarefa:** ${task.title} (${task.type}${size}${estimate}) — node \`${task.id}\``,
    '',
    `**Imite:** ${brief.imitate}`,
    '',
    `**Ler/tocar:** ${brief.readTouch}`,
    '',
    `**Contrato:** ${brief.contract}`,
    '',
    '**AC:**',
    bullets(brief.acceptanceCriteria),
    '',
    '**NÃO:**',
    bullets(brief.notList),
    '',
    `**Blast radius:** ${blast}`,
    '',
    `**Orçamento:** ${brief.budget}`,
    '',
    `**Incerteza:** ${brief.uncertainty}`,
    '',
    `**Teste com:** ${brief.testWith}`,
    '',
    '**DoD:**',
    bullets(brief.dod),
    '',
    '**Self-review:**',
    bullets(brief.selfReview),
    '',
    `**Retorne:** ${brief.returnSchema}`,
    '',
    `ready to delegate: ${brief.readyToDelegate ? 'yes' : 'no'}`,
  ]

  // Optional enrichment (present only via buildEnrichedBrief) — appended so the
  // unenriched render stays byte-identical.
  if (brief.reuseHint) lines.push('', `**Reuse:** ${brief.reuseHint}`)
  if (brief.priorMemories && brief.priorMemories.length > 0) {
    lines.push('', '**Memórias relevantes:**')
    for (const m of brief.priorMemories) lines.push(`- ${m.name}: ${m.snippet}`)
  }
  if (brief.pheromoneHints) lines.push('', `**Trilhas de feromônio:**`, brief.pheromoneHints)
  if (brief.repoMap) lines.push('', '**Repo-map (referência, não reescreva o que já existe):**', brief.repoMap)

  return lines.join('\n')
}

/**
 * Render a compact, paste-ready delegation prompt — same content as the markdown
 * brief but in prose/imperative form an executor agent can act on directly.
 * Deterministic (no timestamps/random).
 */
export function renderBriefPrompt(brief: ExecutorBrief): string {
  const { task } = brief
  const blast = brief.blastRadius.length > 0 ? brief.blastRadius.join(', ') : '(nenhum identificado)'
  const acLines =
    brief.acceptanceCriteria.length > 0 ? brief.acceptanceCriteria.map((a) => `  - ${a}`).join('\n') : '  - (nenhum)'

  const lines = [
    `Você é o EXECUTOR da task \`${task.id}\` (${task.type}): ${task.title}.`,
    '',
    `Intenção: ${brief.intent}`,
    '',
    `Imite este padrão: ${brief.imitate}`,
    `Leia/reuse: ${brief.readTouch}`,
    `Contrato a cumprir: ${brief.contract}`,
    `Teste com: ${brief.testWith}`,
    '',
    'Acceptance criteria (cubra todos com testes):',
    acLines,
    '',
    `NÃO: ${brief.notList.join('; ')}.`,
    `Blast radius: ${blast}.`,
    `Orçamento: ${brief.budget}.`,
    `Sob incerteza: ${brief.uncertainty}.`,
    '',
    `Antes de declarar done, rode o self-review (${brief.selfReview.join(' ')}) e o DoD na ordem: ${brief.dod.join(' → ')}.`,
    `Ao terminar, retorne: ${brief.returnSchema}.`,
    '',
    `Pronto para delegar: ${brief.readyToDelegate ? 'sim' : 'não'}.`,
  ]

  // Optional enrichment (present only via buildEnrichedBrief) — appended so the
  // unenriched prompt stays byte-identical.
  if (brief.reuseHint) lines.push('', `Reuse: ${brief.reuseHint}`)
  if (brief.priorMemories && brief.priorMemories.length > 0) {
    lines.push('', 'Memórias relevantes do projeto:')
    for (const m of brief.priorMemories) lines.push(`- ${m.name}: ${m.snippet}`)
  }
  if (brief.pheromoneHints) lines.push('', 'Trilhas de feromônio (stigmergy):', brief.pheromoneHints)
  if (brief.repoMap) lines.push('', 'Repo-map (referência, não reescreva o que já existe):', brief.repoMap)

  return lines.join('\n')
}
