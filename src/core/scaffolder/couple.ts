/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Coupler — o acoplador determinístico de scaffold. Pipeline assíncrono:
 * retrieve (RAG lexical) → rank → compose (set-cover) → **gerar 100%
 * determinístico** (roda cada scaffolder do plano e mescla os arquivos como
 * quebra-cabeça) → persiste (proveniência + artifact_cache p/ reuso) → contabiliza
 * tokens evitados no economy-lever-ledger (visível na fórmula λ_flow). 0 LLM.
 *
 * Rodado a partir do hook `scaffold:requested` (async) — ver hook-runtime.
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import type { SqliteStore } from '../store/sqlite-store.js'
import { runScaffold, type ScaffoldedFile } from './registry.js'
import { rankScaffolds } from './retrieve-rank.js'
import { composeScaffoldPlan, type ComposableNode } from './compose.js'
import type { RankableNode } from './retrieve-rank.js'
import { corpusBoostForStore } from './corpus.js'
import { creativeGate, generateCreativeFiles, type CreativeGenerator } from './creative-edge.js'
import { decideBest, type ScaffoldDecider } from './decide.js'
import { recordArtifact } from '../reuse/artifact-cache.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { ScaffolderError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'scaffolder/couple.ts' })

export type CoupleNode = RankableNode & ComposableNode & { readonly id: string }

/** Validador injetável: roda os testes no workspace. 0 token (determinístico). */
export type ScaffoldValidator = (workspaceDir: string) => Promise<{ passed: boolean; output?: string }>

export interface CoupleResult {
  readonly nodeId: string
  readonly skipped: boolean
  readonly reason?: string
  /** Resultado da validação da borda criativa (`undefined` se não validou). */
  readonly validated?: boolean
  readonly kinds: string[]
  readonly files: ScaffoldedFile[]
  readonly applied: boolean
  readonly tokensSaved: number
  readonly uncovered: string[]
}

/** Escrita segura no workspace (sem path traversal). */
function safeWrite(workspaceDir: string, file: ScaffoldedFile): void {
  if (isAbsolute(file.path)) throw new ScaffolderError(`Caminho absoluto não permitido: ${file.path}`)
  const root = resolve(workspaceDir)
  const target = resolve(root, file.path)
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new ScaffolderError(`Caminho escapa do workspace: ${file.path}`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, file.content, 'utf8')
}

/** ~4 chars/token (estimativa CL100k) — tokens que um LLM teria gerado. */
function estimateTokens(files: ScaffoldedFile[]): number {
  return Math.ceil(files.reduce((sum, f) => sum + f.content.length, 0) / 4)
}

function scaffoldSignature(nodeId: string, kinds: string[]): string {
  return `scf_${nodeId}_${[...kinds].sort().join('+')}`
}

/**
 * Acopla scaffolds para um node: rank → compose → gera (determinístico) → (apply)
 * escreve + persiste + cacheia + contabiliza. Retorna o resultado (nunca lança
 * por falta de spec — apenas `skipped`).
 */
export async function coupleNode(
  store: SqliteStore,
  node: CoupleNode,
  opts: {
    apply: boolean
    workspaceDir: string
    creative?: CreativeGenerator
    validate?: ScaffoldValidator
    decide?: ScaffoldDecider
  },
): Promise<CoupleResult> {
  // Brownfield + dogfooding: ranking enviesado pelos padrões de TODAS as raízes
  // de corpus (próprio projeto + registrados + irmãos).
  let ranked = rankScaffolds(node, { perfBoost: corpusBoostForStore(store, opts.workspaceDir) })
  // Decisão-LLM mínima: só reordena quando ambíguo + gated (default: argmax).
  if (opts.decide) ranked = await decideBest(store, node, ranked, { decide: opts.decide })
  const plan = composeScaffoldPlan(node, ranked)

  // Gera 100% determinístico e mescla (last-wins por path).
  const byPath = new Map<string, ScaffoldedFile>()
  const kinds: string[] = []
  for (const item of plan.items) {
    kinds.push(item.kind)
    for (const f of runScaffold(item.kind, item.spec)) byPath.set(f.path, f)
  }

  // Borda criativa (mutação): único ponto que gasta token. Só quando o corpus
  // NÃO cobre (gap) E há gerador injetado E o gate λ_flow permite. Validado por
  // parse; promovido a padrão via artifact_cache no bloco de apply.
  const gap = plan.items.length === 0 ? [] : plan.uncovered
  const needsCreative = plan.items.length === 0 || plan.uncovered.length > 0
  let creativeUsed = false
  if (opts.creative && needsCreative) {
    const gate = creativeGate(store)
    if (gate.allowed) {
      const creativeFiles = await generateCreativeFiles(node, gap, opts.creative)
      for (const f of creativeFiles) byPath.set(f.path, f)
      if (creativeFiles.length > 0) {
        creativeUsed = true
        kinds.push('creative')
      }
    }
  }

  const files = [...byPath.values()]
  if (files.length === 0) {
    return {
      nodeId: node.id,
      skipped: true,
      reason: plan.reason ?? 'no-plan',
      kinds: [],
      files: [],
      applied: false,
      tokensSaved: 0,
      uncovered: plan.uncovered,
    }
  }
  // Tokens "salvos" só contam a parte determinística (a criativa GASTOU tokens).
  const tokensSaved = creativeUsed ? 0 : estimateTokens(files)

  if (!opts.apply) {
    return { nodeId: node.id, skipped: false, kinds, files, applied: false, tokensSaved, uncovered: plan.uncovered }
  }

  // Escreve no disco.
  for (const f of files) safeWrite(opts.workspaceDir, f)

  // Seleção natural: a mutação criativa só vira semente se PASSAR nos testes.
  // Inviável → reverte os arquivos e NÃO promove (não polui o corpus). 0 token.
  if (creativeUsed && opts.validate) {
    const verdict = await opts.validate(opts.workspaceDir)
    if (!verdict.passed) {
      for (const f of files) {
        try {
          rmSync(resolve(opts.workspaceDir, f.path))
        } catch {
          /* já ausente */
        }
      }
      log.warn('coupler:creative-rejected', { nodeId: node.id })
      return {
        nodeId: node.id,
        skipped: false,
        reason: 'creative-failed-validation',
        validated: false,
        kinds,
        files,
        applied: false,
        tokensSaved: 0,
        uncovered: plan.uncovered,
      }
    }
  }

  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  const signature = scaffoldSignature(node.id, kinds)
  const ts = Date.now()

  // Proveniência.
  db.prepare(
    `INSERT OR REPLACE INTO generated_artifacts
     (id, project_id, node_id, kinds, paths, signature, covered, applied, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).run(
    `gen_${ts}_${node.id}`,
    projectId,
    node.id,
    JSON.stringify(kinds),
    JSON.stringify(files.map((f) => f.path)),
    signature,
    plan.covered.length,
    ts,
  )

  // Cache p/ reuso determinístico (resolve-reuse vira 'exact' na próxima).
  recordArtifact(db, {
    id: signature,
    signature,
    nodeId: node.id,
    appliedEdits: files.map((f) => ({ path: f.path, oldString: '', newString: f.content })),
    approachSummary: `scaffold-coupler: ${kinds.join('+')}`,
    // Mutação promovida a semente: marca a origem (criativa vira reutilizável).
    model: creativeUsed ? 'creative-llm' : 'deterministic',
    outcome: 'success',
    createdAt: ts,
  })

  // Economia visível na λ_flow — só a parte determinística economiza tokens.
  if (tokensSaved > 0) {
    recordLeverEvent(db, {
      sessionId: projectId,
      nodeId: node.id,
      lever: 'scaffold-coupler',
      tokensBefore: tokensSaved,
      tokensAfter: 0,
      saved: tokensSaved,
      accepted: true,
      gateOutcome: 'accepted',
    })
  }

  // Marca o node.
  const existing = store.getNodeById(node.id)
  if (existing) store.updateNode(node.id, { metadata: { ...existing.metadata, scaffolded: true } })

  log.info('coupler:applied', { nodeId: node.id, kinds, files: files.length, tokensSaved })
  return {
    nodeId: node.id,
    skipped: false,
    validated: creativeUsed && opts.validate ? true : undefined,
    kinds,
    files,
    applied: true,
    tokensSaved,
    uncovered: plan.uncovered,
  }
}

export interface GeneratedArtifactRow {
  id: string
  nodeId: string | null
  kinds: string[]
  paths: string[]
  applied: boolean
  createdAt: number
}

/** Lê a proveniência de geração (mais recente primeiro). */
export function listGeneratedArtifacts(store: SqliteStore, limit = 50): GeneratedArtifactRow[] {
  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  interface Raw {
    id: string
    node_id: string | null
    kinds: string
    paths: string
    applied: number
    created_at: number
  }
  const rows = db
    .prepare('SELECT * FROM generated_artifacts WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(projectId, limit) as Raw[]
  const parse = (j: string): string[] => {
    try {
      const v = JSON.parse(j)
      return Array.isArray(v) ? (v as string[]) : []
    } catch {
      return []
    }
  }
  return rows.map((r) => ({
    id: r.id,
    nodeId: r.node_id,
    kinds: parse(r.kinds),
    paths: parse(r.paths),
    applied: r.applied === 1,
    createdAt: r.created_at,
  }))
}
