/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Creative Edge — a "mutação/polinização" da Árvore Forte.
 *
 * É o ÚNICO ponto em que o sistema gasta tokens: quando o corpus determinístico
 * NÃO cobre a necessidade (algo genuinamente novo), a LLM gera o que falta. O
 * resultado validado é PROMOVIDO a padrão reutilizável (via artifact_cache no
 * coupler) → na próxima estação já é determinístico (`exact`, 0 token).
 *
 * Gated por λ_flow: explora (gasta) quando NÃO está em alto fluxo; conserva
 * quando o fluxo determinístico está saturado. Default OFF (sem gerador injetado
 * → 0 LLM), preservando o invariante de geração determinística.
 */
import type { SqliteStore } from '../store/sqlite-store.js'
import type { ScaffoldedFile } from './registry.js'
import { computeLambdaFlow } from '../context/flow-index.js'
import { parseImplementationPlan } from '../autonomy/plan-parser.js'
import { validateSource } from '../security/ast-source-validator.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'scaffolder/creative-edge.ts' })

/** Gerador injetado (LLM). Recebe o prompt, devolve o texto bruto (JSON plan). */
export type CreativeGenerator = (prompt: string) => Promise<string>

// Defaults da fórmula λ_flow (config-schema): λ_base=0.15, α=1.5.
const LAMBDA_BASE = 0.15
const ALPHA = 1.5
const DEFAULT_SATURATION = 0.6

export interface CreativeGate {
  readonly allowed: boolean
  readonly reason: string
  readonly lambda: number
}

/** Desligado por env/setting. */
function creativeDisabled(store: SqliteStore): boolean {
  if (process.env.AGF_CREATIVE === '0') return true
  return store.getProjectSetting('creative_disabled') === 'true'
}

/**
 * Gate por λ_flow. λ = λ_base + α·Φ. Explora (allowed) quando λ < saturação —
 * ou seja, quando o fluxo determinístico NÃO está alto; conserva tokens quando
 * já está em alto fluxo. φ e o limiar são overridáveis por project settings.
 */
export function creativeGate(store: SqliteStore): CreativeGate {
  const phi = Number(store.getProjectSetting('flow_phi') ?? '0') || 0
  const saturation = Number(store.getProjectSetting('creative_saturation') ?? '') || DEFAULT_SATURATION
  const lambda = computeLambdaFlow(phi, LAMBDA_BASE, ALPHA)
  if (creativeDisabled(store)) return { allowed: false, reason: 'disabled', lambda }
  if (lambda >= saturation) return { allowed: false, reason: `flow-saturated(λ=${lambda.toFixed(2)})`, lambda }
  return { allowed: true, reason: `explore(λ=${lambda.toFixed(2)})`, lambda }
}

/** Prompt restrito: gerar SÓ o que cobre o gap (capacidades não cobertas). */
function buildCreativePrompt(node: { title: string; description?: string | null }, gap: readonly string[]): string {
  return [
    `Gere APENAS o código mínimo que cobre estas capacidades ainda não cobertas pelo corpus:`,
    gap.length > 0 ? gap.map((g) => `- ${g}`).join('\n') : `- (requisito: ${node.title})`,
    ``,
    `Contexto: "${node.title}"${node.description ? ` — ${node.description}` : ''}.`,
    `Responda APENAS com um bloco \`\`\`json com { "files": [{ "path": "...", "content": "..." }] }.`,
  ].join('\n')
}

/**
 * Gera (LLM) os arquivos da borda criativa e os VALIDA por parsing do contrato.
 * Retorna `[]` se a validação falhar (não promove lixo). Tokens são contabilizados
 * pelo adapter (llm_call_ledger). É o único caminho que gasta tokens.
 */
export async function generateCreativeFiles(
  node: { title: string; description?: string | null },
  gap: readonly string[],
  generate: CreativeGenerator,
): Promise<ScaffoldedFile[]> {
  let text: string
  try {
    text = await generate(buildCreativePrompt(node, gap))
  } catch (err) {
    log.warn('creative:generate-failed', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
  try {
    const plan = parseImplementationPlan(text)
    const files: ScaffoldedFile[] = []
    for (const f of plan.files ?? []) files.push({ path: f.path, content: f.content })
    for (const e of plan.edits ?? []) if (e.oldString === '') files.push({ path: e.path, content: e.newString })
    const unsafe = files.filter((f) => !validateSource(f.content).ok)
    if (unsafe.length > 0) {
      log.warn('creative:unsafe-output', { unsafeFiles: unsafe.map((f) => f.path) })
      return []
    }
    log.info('creative:generated', { files: files.length, gap: gap.length })
    return files
  } catch (err) {
    log.warn('creative:invalid-output', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}
