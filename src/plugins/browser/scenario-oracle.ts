/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 5.1: Oráculo de resultado + evidências de cenário.
 *
 * Dado o resultado dos passos de um cenário, decide o veredito (passed|failed) e
 * monta a sequência de eventos (started/step/evidence/passed|failed) para o
 * event-store do agf. Puro/determinístico; a emissão ao vivo reusa o
 * browser-harness-bridge. Não-pivota (não executa browser).
 */

/** Resultado de um passo executado. */
export interface StepResult {
  tool: string
  ok: boolean
  /**
   * Por que o passo falhou, quando falhou (node_61336a7b52b3). Sem isto o produtor
   * descartava a mensagem e um daemon fora do ar ficava indistinguível de uma
   * regressão real — o consumidor não tinha como separar infra de entrega.
   */
  error?: string
  /** Referência de evidência (screenshot/network), se houver. */
  evidence?: string
  /**
   * Marca o passo-conclusão (o terminal que PROVA a entrega — o que escreve no
   * store, não o preview). node_f432c8ce59e0: o oráculo exige PIXEL nele — 'o
   * screenshot é a única medição confiável' (ressalvas §2). Populado pelo executor.
   */
  concludes?: boolean
  /**
   * Identidade da fonte que o passo DEVERIA ter alcançado (ex. rota/URL/título).
   * node_c1bc533a67ac: se difere de {@link observedIdentity}, o oráculo barra ANTES
   * de olhar o valor — 'evidence lies by provenance' (ressalvas §7): um 200 da página
   * ERRADA (auth wall, consent, SPA stale) carrega perfeito e mente. Opt-in.
   */
  expectedIdentity?: string
  /** Identidade da fonte realmente observada. Comparada a {@link expectedIdentity} no terminal. */
  observedIdentity?: string
  /**
   * O cenário PROMETE um efeito (escrita no store) — opt-in do cross-check (node_5db2ab4e6bbf).
   * true ⇒ o terminal precisa provar o efeito com {@link crossCheck}; senão o veredito é
   * rebaixado a 'inconclusive' (ressalvas §5: falso-positivo envenena o feromônio). Ausente/false
   * ⇒ cenário read-only, cross-check não dispara (backward-compat).
   */
  expectsEffect?: boolean
  /**
   * Contagem antes/depois em rede/DB que PROVA o efeito. Um delta real (before≠after) é a prova;
   * delta zero, ausente ou malformado (NaN) NÃO conta como prova. Só olhado quando expectsEffect.
   */
  crossCheck?: CrossCheckCount[]
}

/** Uma contagem antes/depois numa fonte (rede/DB) — a prova de que o efeito prometido aconteceu. */
export interface CrossCheckCount {
  before: number
  after: number
  source: 'network' | 'db'
}

/** Força da prova por trás de um pass: identidade da fonte, efeito real, ambos ou nenhum. */
export type Corroboration = 'none' | 'identity' | 'effect' | 'both'

export interface ScenarioVerdict {
  /**
   * 'inconclusive' (node_f432c8ce59e0): a leitura não é confiável o bastante para
   * concluir — passo-conclusão sem pixel, ou cenário vazio. NUNCA é 'passed'; e
   * também não é 'failed' (o sistema pode estar certo, a prova é que falta).
   */
  verdict: 'passed' | 'failed' | 'inconclusive'
  passedSteps: number
  totalSteps: number
  /** Índice do 1º passo que falhou, se houver. */
  firstFailure?: number
  /**
   * Quão corroborado foi um PASS além de "existe um screenshot" (node_491cd48b6a54).
   * Opcional e só presente em 'passed' — ampliar o obrigatório quebraria consumidores.
   */
  corroboration?: Corroboration
}

/**
 * O passo terminal é o ÚLTIMO marcado `concludes` (node_0db7e12b3937, AC4: 2+ concludes ⇒
 * o último manda, determinístico). undefined quando nenhum passo se declara terminal.
 */
function terminalStep(steps: readonly StepResult[]): StepResult | undefined {
  return steps.filter((s) => s.concludes).at(-1)
}

/**
 * Identidade da fonte diverge no terminal? (node_c1bc533a67ac). Só dispara quando AMBOS
 * expectedIdentity e observedIdentity estão presentes (opt-in) — uma observedIdentity ''
 * conta como presente e divergente (nunca match acidental). Ausência dos dois = sem opinião.
 */
function terminalIdentityDiverges(terminal: StepResult): boolean {
  const { expectedIdentity: exp, observedIdentity: obs } = terminal
  return exp !== undefined && obs !== undefined && exp !== obs
}

/**
 * O terminal PROMETE efeito mas NÃO o prova? (node_5db2ab4e6bbf). Opt-in: só dispara com
 * `expectsEffect`. Prova válida = ≥1 crossCheck com before/after finitos e before≠after (delta
 * real). Ausente, vazio, malformado (NaN) ou delta-zero ⇒ sem prova ⇒ rebaixa p/ 'inconclusive'.
 */
function terminalLacksEffectProof(terminal: StepResult): boolean {
  if (!terminal.expectsEffect) return false
  const proven = (terminal.crossCheck ?? []).some(
    (c) => Number.isFinite(c.before) && Number.isFinite(c.after) && c.before !== c.after,
  )
  return !proven
}

/**
 * Oráculo honesto (E1 node_38156404d598). Precedência determinística:
 *  1. cenário vazio → 'inconclusive' (nada foi confirmado — ausência de prova, não falha);
 *  2. algum passo ok=false → 'failed' (a falha vence — é sinal real);
 *  3. todos ok mas SEM passo terminal (concludes) → 'inconclusive' (validar ≠ efetivar: parou
 *     no preview, não provou a escrita no store — L3 node_0db7e12b3937 §4 ressalvas);
 *  4. terminal com identidade divergente (expected≠observed) → 'inconclusive' ANTES do valor
 *     ('evidence lies by provenance': 200 da página errada mente — L2 node_c1bc533a67ac §7);
 *  5. terminal sem pixel → 'inconclusive' (leitura não-confiável — 'o screenshot é a única
 *     medição confiável', L1 §2 ressalvas);
 *  6. terminal que PROMETE efeito (expectsEffect) sem prova de cross-check (delta real) →
 *     'inconclusive' (L6 node_5db2ab4e6bbf §5: falso-positivo envenena o feromônio);
 *  7. senão → 'passed'.
 */
export function evaluateScenario(steps: StepResult[]): ScenarioVerdict {
  const totalSteps = steps.length
  const passedSteps = steps.filter((s) => s.ok).length
  const firstFailure = steps.findIndex((s) => !s.ok)
  const terminal = terminalStep(steps)

  let verdict: ScenarioVerdict['verdict']
  if (totalSteps === 0) verdict = 'inconclusive'
  else if (firstFailure >= 0) verdict = 'failed'
  else if (terminal === undefined) verdict = 'inconclusive'
  else if (terminalIdentityDiverges(terminal)) verdict = 'inconclusive'
  else if (!terminal.evidence) verdict = 'inconclusive'
  else if (terminalLacksEffectProof(terminal)) verdict = 'inconclusive'
  else verdict = 'passed'

  return {
    verdict,
    passedSteps,
    totalSteps,
    ...(firstFailure >= 0 ? { firstFailure } : {}),
    ...(verdict === 'passed' && terminal ? { corroboration: corroborationOf(terminal) } : {}),
  }
}

/**
 * How strongly a PASS was corroborated beyond "a screenshot exists".
 *
 * WHY this is reported instead of enforced: the identity and effect checks are
 * opt-in so existing scenarios keep working, which leaves the Goodhart hole open
 * — a scenario of trivial steps that never touch the real control passes simply
 * by omitting both fields. The oracle cannot refuse that without breaking every
 * scenario written before the checks existed, so it states the weakness instead,
 * and a green built on nothing becomes countable rather than indistinguishable
 * from a green that proved arrival and effect.
 *
 * Only ever present on a `passed` verdict: a failed or inconclusive run has
 * nothing to corroborate, and grading it would invite reading it as partial proof.
 */
function corroborationOf(terminal: StepResult): Corroboration {
  const identity = terminal.expectedIdentity !== undefined && terminal.observedIdentity !== undefined
  const effect = terminal.expectsEffect === true && !terminalLacksEffectProof(terminal)
  if (identity && effect) return 'both'
  if (identity) return 'identity'
  if (effect) return 'effect'
  return 'none'
}

export interface ScenarioEvent {
  kind: 'started' | 'step' | 'evidence' | 'passed' | 'failed' | 'inconclusive'
  scenarioId: string
  /** Índice do passo (para kind=step|evidence). */
  stepIndex?: number
  tool?: string
  ok?: boolean
  evidence?: string
}

/**
 * Monta a sequência ordenada de eventos do cenário: started → (step [+evidence])* →
 * passed|failed. Pronta para emitir ao event-store (browser-harness-bridge).
 */
export function buildScenarioEvents(scenarioId: string, steps: StepResult[]): ScenarioEvent[] {
  const events: ScenarioEvent[] = [{ kind: 'started', scenarioId }]
  steps.forEach((s, i) => {
    events.push({ kind: 'step', scenarioId, stepIndex: i, tool: s.tool, ok: s.ok })
    if (s.evidence) events.push({ kind: 'evidence', scenarioId, stepIndex: i, evidence: s.evidence })
  })
  events.push({ kind: evaluateScenario(steps).verdict, scenarioId })
  return events
}
