/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Retry-loop de implementação com feedback compacto (M1f) — a alavanca de
 * economia do loop autônomo. Em vez de re-gerar do zero ou escalar no primeiro
 * vermelho, realimenta ao modelo APENAS a saída de teste que falhou (truncada),
 * pedindo um fix incremental. Menos tokens por iteração e menos escalações.
 *
 * Puro por injeção (`generate`/`execute`) — testável sem o SDK do Copilot.
 *
 * §EPIC-COMPRESS 2026 — Adaptive compression loop:
 *   L0 (raw)          — sem compressão
 *   L1 (test-runner)  — colapsa passes, mantém falhas (auto-detect via compressToolOutput)
 *   L2 (structured)   — extrai assertions falhadas: expected vs received
 *   A escolha do nível é guiada por histórico de outcomes (cross-task learning) e
 *   tamanho da saída. Cada compressão é registrada no economy lever ledger para
 *   visibilidade via `agf savings`.
 */
import { createLogger } from '../utils/logger.js'
import { getErrorMessage } from '../utils/errors.js'
import { truncateWithMarker } from '../context/truncate.js'
import { parseImplementationPlan } from './plan-parser.js'
import { classifyLlmError } from '../model-hub/llm-error.js'
import { chooseEffort, type ReasoningEffort } from '../model-hub/effort-router.js'
import type { ExecutionResult, ImplementationPlan } from './implementation-executor.js'
import type { ReuseDecision } from '../reuse/resolve-reuse.js'
import { compressToolOutput } from '../tool-compress/index.js'
import { buildStructuredSummary } from '../tool-compress/extract-failures.js'
import { routeContent } from '../economy/content-router.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { emitEconomyHook } from '../hooks/economy-lifecycle-hooks.js'
import type Database from 'better-sqlite3'
import { buildLessonsContext, persistLesson } from './lessons-store.js'
import type { ScaffoldDescriptor, RagOutOutcome } from '../rag-out/gate.js'

const log = createLogger({ layer: 'core', source: 'implement-attempt.ts' })

const DEFAULT_MAX_FEEDBACK_CHARS = 2500

const MIN_COMPRESS_SIZE = 500

// ── Tipos públicos ──────────────────────────────────────

export interface AttemptDeps {
  generate: (prompt: string, effort?: ReasoningEffort) => Promise<string>
  execute: (plan: ImplementationPlan) => Promise<ExecutionResult>
  sleep?: (ms: number) => Promise<void>
}

export type CompressionLevel = 'none' | 'auto' | 'structured'

export interface CompressionStat {
  level: CompressionLevel
  filter: string | null
  saved: number
  before: number
  after: number
}

export interface AttemptOptions {
  node: { id: string; title: string }
  maxAttempts: number
  maxFeedbackChars?: number
  maxParseRecoveries?: number
  repoMap?: string
  flowContext?: string
  reuse?: ReuseDecision
  /** Database for economy lever ledger (records compress savings). */
  economyDb?: Database.Database
  /** Database for lessons-store lookup — injects relevant lessons into first prompt. */
  lessonsDb?: Database.Database
  /** Force compression level; 'auto' = adaptive (default). */
  compressLevel?: CompressionLevel
}

export interface AttemptOutcome {
  success: boolean
  attempts: number
  lastResult?: ExecutionResult
  error?: string
  appliedEdits?: Array<{ path: string; oldString: string; newString: string }>
  reused?: 'exact' | 'scaffold'
  /** Compression stats from retry feedback, accumulated across attempts. */
  compressionStats?: CompressionStat[]
}

// ── Prompt system estável ────────────────────────────────

export const STABLE_SYSTEM_PROMPT = [
  'Você é um agente SWE que implementa tasks com TDD (Test-Driven Development), emitindo o MÍNIMO de tokens.',
  'FLUXO OBRIGATÓRIO TDD:',
  '1. PRIMEIRO: Escreva o teste que valida o comportamento esperado',
  '2. SEGUNDO: Execute o teste e verifique que ele FALHA (RED phase)',
  '3. TERCEIRO: Implemente o código mínimo para o teste passar (GREEN phase)',
  '4. QUARTO: Refatore se necessário, mantendo os testes verdes',
  'Responda SEMPRE e APENAS com um bloco ```json. Há DOIS mecanismos:',
  '- "edits" (PREFIRA — economia de token): [{ "path", "oldString", "newString", "replaceAll"? }].',
  '  "oldString" deve casar EXATAMENTE (incl. indentação) e ser ÚNICO; use "replaceAll": true p/ várias.',
  '  "oldString": "" cria arquivo novo com "newString".',
  '- "files" (só p/ arquivos novos grandes): [{ "path", "content" }].',
  'Inclua "testCommand" se diferente do default. Ex.:',
  '{ "edits": [{ "path": "sum.js", "oldString": "a - b", "newString": "a + b" }], "testCommand": "node --test" }',
  'IMPORTANTE: PREFIRA EDITAR ARQUIVOS EXISTENTES a criar novos. Se a task pede para adicionar',
  'uma função a um arquivo existente ("adicione exports.mul em math.js"), use "edits" com',
  '"oldString" do conteúdo atual do arquivo e "newString" com a função adicionada. Só crie',
  'arquivos NOVOS se a task explicitamente pedir ("crie um novo arquivo").',
  'Caminhos relativos à raiz do projeto. Verifique a estrutura de arquivos existente repo-map antes de decidir o path.',
].join('\n')

// ── Prompt builders ──────────────────────────────────────

export function buildInitialPrompt(
  node: { id: string; title: string },
  opts: { repoMap?: string; flowContext?: string; scaffoldHint?: string } = {},
): string {
  const parts: string[] = []

  const repoMapBlock =
    opts.repoMap && opts.repoMap.length > 0
      ? [`Contexto do repositório (referência, não reescreva o que já existe):`, opts.repoMap, '']
      : []
  if (repoMapBlock.length > 0) {
    parts.push(...maybeCompact(repoMapBlock))
  }

  const flowBlock = opts.flowContext && opts.flowContext.length > 0 ? [opts.flowContext, ''] : []
  if (flowBlock.length > 0) {
    parts.push(...maybeCompact(flowBlock))
  }

  const scaffoldBlock =
    opts.scaffoldHint && opts.scaffoldHint.length > 0
      ? [`Scaffold de referência (task semelhante já resolvida — reaproveite o que servir):`, opts.scaffoldHint, '']
      : []
  if (scaffoldBlock.length > 0) {
    parts.push(...scaffoldBlock)
  }

  parts.push(`Implemente a task "${node.title}" (id: ${node.id}) seguindo TDD estrito:`)
  parts.push('1. PRIMEIRO: Escreva o teste que valida o comportamento esperado')
  parts.push('2. SEGUNDO: Execute o teste e verifique que ele FALHA (RED phase)')
  parts.push('3. TERCEIRO: Implemente o código mínimo para o teste passar (GREEN phase)')
  parts.push('4. QUARTO: Refatore se necessário, mantendo os testes verdes')
  parts.push('Use o contrato JSON do system.')
  return parts.join('\n')
}

export interface ScaffoldDecisionInput {
  decision: RagOutOutcome
  confidence: number
  best: ScaffoldDescriptor | null
}

/**
 * Variant of buildInitialPrompt that injects the RAG-OUT scaffold decision.
 * If `scaffoldDecision.decision === 'recover'` and a best scaffold is available,
 * injects the scaffold id + slots into the prompt so the LLM fills only the holes
 * (not generating from scratch). Logged per AC3.
 */
export function buildInitialPromptWithScaffold(
  node: { id: string; title: string },
  opts: {
    repoMap?: string
    flowContext?: string
    scaffoldHint?: string
    scaffoldDecision?: ScaffoldDecisionInput
  } = {},
): string {
  const { scaffoldDecision } = opts

  if (scaffoldDecision?.decision === 'recover' && scaffoldDecision.best) {
    const sc = scaffoldDecision.best
    log.info('implement-attempt:scaffold-recover', {
      nodeId: node.id,
      scaffoldId: sc.id,
      confidence: scaffoldDecision.confidence,
    })
    const parts: string[] = []
    if (opts.repoMap) parts.push(`Contexto do repositório:\n${opts.repoMap}\n`)
    if (opts.flowContext) parts.push(`${opts.flowContext}\n`)
    parts.push(
      `Scaffold disponível: ${sc.id} (confiança ${(scaffoldDecision.confidence * 100).toFixed(0)}%)`,
      `Referência: ${sc.structureRef ?? sc.id}`,
      `Slots a preencher: ${sc.slots.join(', ')}`,
      '',
      `Tarefa: "${node.title}" (id: ${node.id})`,
      'Preencha apenas os slots acima usando TDD estrito — não regenere a estrutura do scaffold.',
    )
    return parts.join('\n')
  }

  log.debug('implement-attempt:scaffold-generate', { nodeId: node.id, confidence: scaffoldDecision?.confidence ?? 0 })
  return buildInitialPrompt(node, opts)
}

/**
 * Compact a block of text by running compressToolOutput on it — safe fallback.
 */
function maybeCompact(block: string[]): string[] {
  const joined = block.join('\n')
  const compressed = compressToolOutput(joined)
  if (compressed.saved > 0) return [compressed.value, '']
  return block
}

/** Prompt de retry: mostra a falha + arquivos relevantes + pede fix direcionado. */
export function buildRetryPrompt(
  node: { id: string; title: string },
  failure: ExecutionResult,
  maxFeedbackChars: number,
): string {
  const raw = failure.testOutput ?? '(sem saída)'
  // Nota: compressão agora acontece no caller (attemptImplementation), que passa
  // o output já comprimido via `failure.testOutput`. Caso contrário (chamada direta
  // à buildRetryPrompt sem caller), o truncate ainda protege.
  const trimmed = truncateWithMarker(raw, maxFeedbackChars)
  return [
    `A implementação anterior da task "${node.title}" falhou nos testes.`,
    'Analise a saída abaixo e identifique o que o teste ESPERAVA vs o que seu código PRODUZIU.',
    'Depois corrija APENAS o necessário com "edits" precisos (search/replace).',
    '',
    'Saída dos testes:',
    '```',
    trimmed,
    '```',
    '',
    'Instruções:',
    '- Leia a mensagem de erro: ela mostra o valor esperado vs o valor recebido.',
    '- Corrija APENAS a função que falhou — não reescreva arquivos inteiros.',
    '- PREFIRA "edits" com oldString/newString cirúrgicos.',
    '- Responda com o MESMO contrato JSON (edits/files + testCommand).',
  ].join('\n')
}

export function buildParseRetryPrompt(node: { id: string; title: string }, parseError: string): string {
  return [
    `Sua resposta anterior para a task "${node.title}" NÃO é um plano JSON válido.`,
    `Erro: ${parseError}`,
    'Responda APENAS com um bloco ```json contendo { "edits": [{ "path", "oldString", "newString" }] }',
    'OU { "files": [{ "path", "content" }] }, mais um "testCommand" string. Sem texto fora do JSON.',
  ].join('\n')
}

// ── Compression level selection ──────────────────────────

interface LevelChoice {
  level: CompressionLevel
  reason: string
}

/**
 * Choose compression level based on output size.
 *
 * Adaptive sizing:
 *   - < MIN_COMPRESS_SIZE        → L0 (pass-through — very small, no gain)
 *   - < MIN_COMPRESS_SIZE * 10   → L1 (auto-detect via compressToolOutput)
 *   - >= MIN_COMPRESS_SIZE * 10  → L2 (structured assertion extraction)
 *
 * §P5 TODO: Cross-task learning — query episodic_outcomes by taskType to
 * refine level based on historical success rate per level.
 */
function chooseLevel(text: string, _taskType: string): LevelChoice {
  const len = text.length

  if (len < MIN_COMPRESS_SIZE) {
    return { level: 'none', reason: `output ${len}B < ${MIN_COMPRESS_SIZE}B threshold` }
  }

  if (len < MIN_COMPRESS_SIZE * 10) {
    return { level: 'auto', reason: `output ${len}B < ${MIN_COMPRESS_SIZE * 10}B → auto (L1)` }
  }

  return { level: 'structured', reason: `output ${len}B >= ${MIN_COMPRESS_SIZE * 10}B → structured (L2)` }
}

/**
 * Derive a taskType for episodic queries from the node's context.
 * Falls back to 'implement' for unknown types.
 */
function deriveTaskType(node: { id: string; title: string }, existingType?: string): string {
  if (existingType) return existingType
  const title = node.title.toLowerCase()
  if (title.includes('bug') || title.includes('fix') || title.includes('error')) return 'bug-fix'
  if (title.includes('test') || title.includes('spec')) return 'test'
  if (title.includes('refactor') || title.includes('clean')) return 'refactor'
  if (title.includes('doc') || title.includes('readme')) return 'docs'
  return 'implement'
}

// ── Compression application + economy recording ──────────

interface CompressResult {
  text: string
  stat: CompressionStat | null
}

/**
 * Best safe compressor for tool output (WS-B / T1.4): roteia pelo content-router
 * (code→tool-compress+AST, json→SmartCrusher, log→dedup) e compara com o tool-compress base,
 * adotando o de maior economia. Pula o ramo `caveman` (NL lossy) p/ preservar a
 * fidelidade da saída de ferramenta. Sempre seguro: cai no tool-compress quando não há ganho.
 */
export function bestToolCompression(raw: string): { value: string; filter: string | null; saved: number } {
  const base = compressToolOutput(raw)
  let routed: { output: string; saved: number; compressor: string } | null
  try {
    routed = routeContent(raw)
  } catch {
    routed = null
  }
  if (routed && routed.compressor !== 'caveman' && routed.saved > base.saved) {
    return { value: routed.output, filter: routed.compressor, saved: routed.saved }
  }
  return { value: base.saved > 0 ? base.value : raw, filter: base.filter, saved: base.saved }
}

/**
 * Apply compression at the chosen level and record to economy lever ledger.
 * Safe fallback: returns raw text on any failure.
 */
function compressWithEconomy(
  raw: string,
  db: Database.Database | undefined,
  nodeId: string,
  attempt: number,
  level: CompressionLevel,
  _taskType: string,
): CompressResult {
  if (level === 'none' || raw.length < MIN_COMPRESS_SIZE) {
    return { text: raw, stat: null }
  }

  // WS-C / T2.1: dispara o hook de fase Economia na via ativa (no-op sem handler).
  emitEconomyHook('pre_compress', { lever: 'compress', nodeId, level, bytesBefore: raw.length })

  let result: { compressed: string; filter: string | null; saved: number }

  if (level === 'structured') {
    const summary = buildStructuredSummary(raw)
    if (summary.count > 0) {
      result = { compressed: summary.text, filter: 'structured-extract', saved: raw.length - summary.text.length }
    } else {
      const r = bestToolCompression(raw)
      result = { compressed: r.saved > 0 ? r.value : raw, filter: r.filter, saved: r.saved }
    }
  } else {
    const r = bestToolCompression(raw)
    result = { compressed: r.saved > 0 ? r.value : raw, filter: r.filter, saved: r.saved }
  }

  if (result.saved <= 0) return { text: raw, stat: null }

  emitEconomyHook('post_compress', {
    lever: 'compress',
    nodeId,
    filter: result.filter,
    bytesBefore: raw.length,
    bytesAfter: result.compressed.length,
    saved: result.saved,
    savedPct: Math.round((result.saved / raw.length) * 100),
  })

  const stat: CompressionStat = {
    level,
    filter: result.filter,
    saved: result.saved,
    before: raw.length,
    after: result.compressed.length,
  }

  log.info('retry:compress-applied', {
    node: nodeId,
    attempt,
    level,
    filter: result.filter,
    saved: result.saved,
    pct: ((result.saved / raw.length) * 100).toFixed(1),
  })

  if (db) {
    try {
      recordLeverEvent(db, {
        sessionId: `retry_${nodeId}_${attempt}`,
        nodeId,
        lever: 'compress',
        tokensBefore: raw.length,
        tokensAfter: result.compressed.length,
        saved: result.saved,
        accepted: true,
        gateOutcome: 'accepted',
      })
    } catch (err) {
      log.warn('retry:compress-ledger-failed', { error: String(err) })
    }
  }

  return { text: result.compressed, stat }
}

// ── Main entry point ─────────────────────────────────────

/**
 * Tenta implementar a task: gera → aplica → testa; em vermelho, comprime a
 * saída de teste adaptativamente e realimenta a falha, retentando até
 * `maxAttempts`. JSON malformado ganha recuperação corretiva barata
 * (cap `maxParseRecoveries`) sem queimar uma tentativa. Retorna o desfecho
 * com stats de compressão.
 */
export async function attemptImplementation(deps: AttemptDeps, options: AttemptOptions): Promise<AttemptOutcome> {
  const maxAttempts = Math.max(1, options.maxAttempts)
  const maxFeedbackChars = options.maxFeedbackChars ?? DEFAULT_MAX_FEEDBACK_CHARS
  const sleep = deps.sleep ?? defaultSleep
  const maxParseRecoveries = options.maxParseRecoveries ?? 2

  let lastResult: ExecutionResult | undefined
  let lastError: string | undefined
  let parseRecoveries = 0
  const compressionStats: CompressionStat[] = []

  const db = options.economyDb ?? undefined
  const taskType = deriveTaskType(options.node)

  // Reuso determinístico (R4): edits exatos — 0 tokens de modelo.
  const reuse = options.reuse
  if (reuse?.kind === 'exact') {
    // AUDIT-055: a stale cached edit can throw (e.g. EditNotFoundError) from execute.
    // Catch it and fall through to generation instead of letting it escape.
    try {
      const result = await deps.execute({ edits: reuse.edits })
      if (result.testPassed === true) {
        log.info('Reuso exato verde — 0 tokens de modelo', { node: options.node.id, sourceId: reuse.sourceId })
        return { success: true, attempts: 1, lastResult: result, appliedEdits: reuse.edits, reused: 'exact' }
      }
      lastResult = result
      lastError = result.testOutput
      log.warn('Reuso exato vermelho — caindo para geração', { node: options.node.id })
    } catch (err) {
      lastError = getErrorMessage(err)
      log.warn('Reuso exato lançou — caindo para geração', { node: options.node.id, error: lastError })
    }
  }
  const scaffoldHint =
    reuse?.kind === 'scaffold' ? reuse.edits.map((e) => `── ${e.path} ──\n+ ${e.newString}`).join('\n') : undefined

  // Inject relevant lessons from lessons-store. Cap at ~2 k chars (~500 tok) to prevent prompt overflow.
  const MAX_LESSONS_CHARS = 8000
  const rawLessonsContext = options.lessonsDb
    ? buildLessonsContext(options.lessonsDb, `${options.node.id} ${options.node.title}`)
    : ''
  const lessonsContext =
    rawLessonsContext.length > MAX_LESSONS_CHARS
      ? `${rawLessonsContext.slice(0, MAX_LESSONS_CHARS - 3)}...`
      : rawLessonsContext
  const effectiveFlowContext = [options.flowContext, lessonsContext].filter(Boolean).join('\n\n')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // ── Build prompt ──────────────────────────────────
    const prompt =
      attempt === 1 || !lastResult
        ? buildInitialPrompt(options.node, {
            repoMap: options.repoMap,
            flowContext: effectiveFlowContext || undefined,
            scaffoldHint,
          })
        : (() => {
            // Compress test output adaptively before building retry prompt
            const raw = lastResult.testOutput ?? ''
            const forceLevel = options.compressLevel
            const chosen = forceLevel
              ? { level: forceLevel, reason: `forced: ${forceLevel}` }
              : chooseLevel(raw, taskType)

            const { text: compressedText, stat } = compressWithEconomy(
              raw,
              db,
              options.node.id,
              attempt,
              chosen.level,
              taskType,
            )
            if (stat) compressionStats.push(stat)
            if (stat) {
              log.info('retry:compress-chosen', {
                node: options.node.id,
                attempt,
                level: chosen.level,
                reason: chosen.reason,
                saved: stat.saved,
              })
            }

            // Pass compressed output as if it were the original test output
            const effectiveResult: ExecutionResult = {
              ...lastResult,
              testOutput: compressedText,
            }
            const baseRetry = buildRetryPrompt(options.node, effectiveResult, maxFeedbackChars)
            return lessonsContext ? `${baseRetry}\n\n${lessonsContext}` : baseRetry
          })()

    const effort = chooseEffort({
      kind: 'implement',
      attempt,
      hasReuse: reuse?.kind === 'exact' || reuse?.kind === 'scaffold',
    })

    // 1) Provider call
    let text: string
    try {
      text = await deps.generate(prompt, effort)
    } catch (err) {
      lastError = getErrorMessage(err)
      const cls = classifyLlmError(err)
      if (!cls.retryable) {
        log.warn('Erro permanente do provider — escalando sem re-tentar', {
          attempt,
          node: options.node.id,
          kind: cls.kind,
          error: lastError,
        })
        return { success: false, attempts: attempt, lastResult, error: lastError, compressionStats }
      }
      if (cls.retryAfterMs && cls.retryAfterMs > 0) await sleep(cls.retryAfterMs)
      log.warn('Erro transitório do provider — re-tentando', {
        attempt,
        node: options.node.id,
        kind: cls.kind,
        retryAfterMs: cls.retryAfterMs,
      })
      continue
    }

    // 2) Parse
    let plan: ImplementationPlan | undefined
    try {
      plan = parseImplementationPlan(text)
    } catch (err) {
      lastError = getErrorMessage(err)
      log.warn('Tentativa falhou no parse', { attempt, node: options.node.id, error: lastError })
      while (!plan && parseRecoveries < maxParseRecoveries) {
        parseRecoveries++
        try {
          const fixText = await deps.generate(buildParseRetryPrompt(options.node, lastError), 'minimal')
          plan = parseImplementationPlan(fixText)
          log.info('Parse recuperado', { attempt, node: options.node.id, recovery: parseRecoveries })
        } catch (err2) {
          lastError = getErrorMessage(err2)
          log.warn('Recuperação de parse falhou', { attempt, node: options.node.id, error: lastError })
        }
      }
    }
    if (!plan) continue

    // 3) Execute + test
    // AUDIT-055: execute can throw (e.g. EditNotFoundError on a stale/ambiguous
    // edit). Catch it, record the error, and fall through to the next attempt
    // instead of letting it escape attemptImplementation.
    try {
      lastResult = await deps.execute(plan)
    } catch (err) {
      lastError = getErrorMessage(err)
      log.warn('Execute lançou — re-tentando', { attempt, node: options.node.id, error: lastError })
      continue
    }
    if (lastResult.testPassed === true) {
      log.info('Implementação verde', { attempt, node: options.node.id })
      if (options.lessonsDb) {
        persistLesson(options.lessonsDb, {
          patternHash: `success-${options.node.id}`,
          description: `Task "${options.node.title}" (${options.node.id}) succeeded at attempt ${attempt}.`,
          recommendedAction: `Implementation for task "${options.node.title}" succeeded at attempt ${attempt}`,
          confidence: attempt === 1 ? 0.9 : 0.7,
          source: 'implement-attempt-success',
        })
      }
      const appliedEdits = (plan.edits ?? []).map((e) => ({
        path: e.path,
        oldString: e.oldString,
        newString: e.newString,
      }))
      return {
        success: true,
        attempts: attempt,
        lastResult,
        appliedEdits,
        compressionStats: compressionStats.length > 0 ? compressionStats : undefined,
        ...(reuse?.kind === 'scaffold' ? { reused: 'scaffold' as const } : {}),
      }
    }
    lastError = lastResult.testOutput
    log.warn('Testes vermelhos', { attempt, node: options.node.id })
  }

  return {
    success: false,
    attempts: maxAttempts,
    lastResult,
    error: lastError,
    compressionStats: compressionStats.length > 0 ? compressionStats : undefined,
  }
}

/** Espera real entre tentativas (injetável em testes via AttemptDeps.sleep). */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
