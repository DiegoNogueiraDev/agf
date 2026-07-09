/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_d68504f3f697 — Geração de PRD a partir de uma descrição. `buildPrdPrompt`
 * é puro (template com as seções que o importador depois vira grafo);
 * `generatePrd` injeta a chamada ao modelo — testável com fake (0 token no dev).
 * Entrada vazia → erro tipado (anti-lixo).
 */
import { ValidationError } from '../utils/errors.js'

export interface GeneratePrdDeps {
  /** Invoca o modelo com o prompt e devolve o markdown do PRD. */
  generate: (prompt: string) => Promise<string>
}

/** Monta o prompt de geração do PRD a partir da descrição do produto. */
export function buildPrdPrompt(description: string): string {
  return [
    `Você é um Product Manager sênior. Escreva um PRD em Markdown para o produto descrito abaixo,`,
    `pronto para ser importado num grafo de execução (epics → tasks → critérios de aceitação).`,
    '',
    `Descrição do produto:`,
    description.trim(),
    '',
    `Estruture com EXATAMENTE estas seções (Markdown, headings ##):`,
    `## Objetivo`,
    `## Usuários`,
    `## Épicos  (lista de epics; cada um como heading ### com id curto)`,
    ``,
    `Cada epic deve conter tasks como headings #### e CADA TASK deve ter uma subseção:`,
    ``,
    `##### Acceptance Criteria`,
    `- Given <contexto>, When <ação>, Then <resultado esperado>`,
    `- Given <contexto alternativo>, When <ação>, Then <resultado>`,
    ``,
    `(mínimo 2 bullets Given-When-Then por task — testáveis automaticamente)`,
    ``,
    `## Constraints  (técnicas e de negócio)`,
    `## Riscos`,
    '',
    `Seja específico e conciso. Cada AC deve ser verificável por um teste automatizado.`,
  ].join('\n')
}

/** Scaffold recuperado por RAG-OUT (`decideScaffold`) — só os slots a preencher, não a estrutura inteira. */
export interface PrdScaffold {
  slots: string[]
}

/**
 * Monta um prompt reduzido a partir de um scaffold já recuperado (RAG-OUT):
 * pede ao modelo para preencher os `slots` em vez de inventar a estrutura
 * inteira do zero. Os slots são um piso, não um teto — o produto pode
 * precisar de seções extras (mitiga o risco de recover falso-positivo
 * cortar conteúdo essencial, node_7eb68f1b471d).
 */
export function buildSlotPrdPrompt(description: string, slots: string[]): string {
  return [
    `Você é um Product Manager sênior. Escreva um PRD em Markdown para o produto descrito abaixo,`,
    `pronto para ser importado num grafo de execução (epics → tasks → critérios de aceitação).`,
    '',
    `Descrição do produto:`,
    description.trim(),
    '',
    `Um scaffold de PRD já foi recuperado para este tipo de produto — preencha estes campos (slots)`,
    `com conteúdo específico do produto acima:`,
    ...slots.map((s) => `- ${s}`),
    '',
    `Os slots acima são um PISO, não um teto: se o produto claramente precisar de seções ou`,
    `informação além destes slots, acrescente-as — não omita nada essencial só para caber no scaffold.`,
    '',
    `Cada task deve ter uma subseção "Acceptance Criteria" com Given-When-Then (mínimo 2 bullets).`,
    `Seja específico e conciso. Cada AC deve ser verificável por um teste automatizado.`,
  ].join('\n')
}

/**
 * Gera o PRD em Markdown. Lança `ValidationError` se a descrição for vazia.
 * Com `scaffold.slots` não-vazio, reaproveita o scaffold recuperado por RAG-OUT
 * (prompt reduzido); sem ele, ou com slots vazio, comportamento é o de sempre.
 */
export async function generatePrd(description: string, deps: GeneratePrdDeps, scaffold?: PrdScaffold): Promise<string> {
  if (description.trim().length === 0) {
    throw new ValidationError('Descrição vazia — forneça o que deve ser construído para gerar o PRD.', [])
  }
  const prompt =
    scaffold && scaffold.slots.length > 0
      ? buildSlotPrdPrompt(description, scaffold.slots)
      : buildPrdPrompt(description)
  return deps.generate(prompt)
}
