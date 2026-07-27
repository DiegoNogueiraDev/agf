/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_7159c356573c — Orquestração genesis: ideia → grafo → primeiro brief em
 * UM round-trip (init → generate_prd → import_prd → decompose → gaps → brief),
 * substituindo os ≥5 comandos manuais de bootstrap com re-leitura de contexto
 * entre cada um.
 *
 * Puro por injeção (espelho: ./run-delivery.ts): este módulo não conhece
 * store/LLM/FS — o wiring real entra por {@link GenesisHandlers} (o comando
 * `agf genesis`, task irmã node_bcd488e481e4, monta os handlers de produção;
 * os testes usam fakes, 0 token).
 *
 * Contrato de honestidade (lição do bug exec chain node_e3972a535bf6): falha em
 * QUALQUER etapa ⇒ `ok:false` + `failedStep` nomeando-a — nunca ok:true com
 * falha interna. Etapas após a falha não rodam; `steps` contém somente o que
 * executou, cada entrada com `{name, ok, ms}` (AC3).
 */

/** Ordem canônica das 6 etapas do pipeline genesis. */
export const GENESIS_STEP_NAMES = ['init', 'generate_prd', 'import_prd', 'decompose', 'gaps', 'brief'] as const
export type GenesisStepName = (typeof GENESIS_STEP_NAMES)[number]

/** Relatório de uma etapa executada — `error` presente apenas quando ok=false. */
export interface GenesisStepReport {
  name: GenesisStepName
  ok: boolean
  ms: number
  error?: string
}

/**
 * Ports das 6 etapas (DIP). Cada handler encapsula a capacidade já existente:
 * init → runGraphOnlySetup; generate_prd → generatePrd (LLM via port);
 * import_prd → extractEntities+convertToGraph+bulkInsert; decompose →
 * detectLargeTasks+persistDecomposition; gaps → detectAllGaps(required);
 * brief → findNextTask+buildExecutorBrief. Zero lógica de domínio nova aqui.
 */
export interface GenesisHandlers<TBrief = unknown> {
  init: () => Promise<void>
  generatePrd: (idea: string) => Promise<string>
  importPrd: (prdMarkdown: string) => Promise<{ nodes: number; edges: number }>
  decompose: () => Promise<{ decomposed: number }>
  gaps: () => Promise<{ required: number }>
  brief: () => Promise<TBrief | null>
}

/** Envelope final — `firstBrief` só existe quando o pipeline completou (AC1). */
export interface GenesisReport<TBrief = unknown> {
  ok: boolean
  idea: string
  steps: GenesisStepReport[]
  failedStep?: GenesisStepName
  imported?: { nodes: number; edges: number }
  decomposed?: number
  requiredGaps?: number
  firstBrief?: TBrief | null
}

/**
 * Executa o pipeline genesis de ponta a ponta. Determinístico dado `handlers`
 * + `now` (relógio injetável p/ testes); para na primeira falha e devolve o
 * relatório honesto por etapa.
 */
export async function runGenesis<TBrief = unknown>(
  idea: string,
  handlers: GenesisHandlers<TBrief>,
  now: () => number = () => Date.now(),
): Promise<GenesisReport<TBrief>> {
  const report: GenesisReport<TBrief> = { ok: true, idea, steps: [] }

  const step = async <T>(name: GenesisStepName, run: () => Promise<T>): Promise<T | undefined> => {
    const startedAt = now()
    try {
      const result = await run()
      report.steps.push({ name, ok: true, ms: now() - startedAt })
      return result
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      report.steps.push({ name, ok: false, ms: now() - startedAt, error })
      report.ok = false
      report.failedStep = name
      return undefined
    }
  }

  await step('init', handlers.init)
  if (!report.ok) return report

  const prd = await step('generate_prd', () => handlers.generatePrd(idea))
  if (!report.ok || prd === undefined) return report

  report.imported = await step('import_prd', () => handlers.importPrd(prd))
  if (!report.ok) return report

  const decomposed = await step('decompose', handlers.decompose)
  if (!report.ok) return report
  report.decomposed = decomposed?.decomposed

  const gaps = await step('gaps', handlers.gaps)
  if (!report.ok) return report
  report.requiredGaps = gaps?.required

  report.firstBrief = await step('brief', handlers.brief)
  return report
}
