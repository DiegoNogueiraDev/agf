/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * A REDE DO CORTE MAIS AGRESSIVO DO PRODUTO (node_243c93c7c8a2).
 *
 * `forage_stop` fica LIGADO por default sempre que um agente dirige (bundle
 * loss-safe, node_7ee81fd6a5e0) e corta 62–96% do repo-map — medido em três
 * repositórios independentes. O auto-revert (`applyLossyTransform`) já existia,
 * mas só no middleware; o `task-prep`, onde este corte acontece, não passava por
 * ele. A única proteção era o piso `minItems: 1`, que garante que sobre UM item
 * — não que sobrou o que a task precisa.
 *
 * ─── Por que o oráculo é MODESTO (decisão, não omissão) ──────────────────────
 *
 * "Quebrou o sentido" não tem definição fechada para um repo-map, e um oráculo
 * esperto e errado degradaria em silêncio TODA sessão dirigida por agente — o
 * caminho default. Então não se tenta adivinhar qualidade: verifica-se a única
 * relação direta e checável entre o corte e o propósito do artefato. O repo-map
 * existe para trazer o código relacionado à task; se o corte removeu TODO
 * símbolo relacionado, ele cortou exatamente aquilo por que o mapa existe.
 *
 * A segurança real não vem daqui. Vem da REVERSIBILIDADE: o gate cacheia o
 * original (CCR) e o corte permanece recuperável mesmo quando este oráculo erra.
 * Um oráculo modesto + drop reversível é mais honesto que um oráculo confiante.
 */

/**
 * Termos curtos casam qualquer path ("de", "do", "a") e fariam o guard aprovar
 * sempre. Quatro caracteres é o piso onde um termo passa a discriminar algo.
 */
const MIN_TERM_LENGTH = 4

/**
 * Termos significativos do foco, normalizados.
 *
 * Quebra TAMBÉM nas fronteiras camelCase antes de baixar a caixa: títulos de
 * task carregam identificadores como `LeverEvidence`, enquanto os paths do
 * repo-map são kebab-case (`lever-evidence-gate.ts`). Sem essa quebra o termo
 * nunca casa, o guard cai na regra "não havia nada relacionado" e aprova
 * qualquer corte — falhando exatamente nos casos que ele existe para pegar.
 */
function significantTerms(focus: string): string[] {
  return focus
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TERM_LENGTH)
}

/**
 * O corte preservou o que a task procura?
 *
 * `false` ⇒ o chamador deve descartar o corte e usar o mapa completo.
 *
 * Regras, em ordem:
 * 1. Mapa cortado VAZIO nunca passa — piso absoluto, qualquer que seja o foco.
 * 2. Se o mapa completo já não tinha nenhum termo do foco, o corte não piorou
 *    nada: recusar só gastaria tokens sem devolver informação (evita o falso
 *    positivo que tornaria a rede um imposto permanente).
 * 3. Caso contrário, exige que ao menos um termo do foco sobreviva ao corte.
 */
export function forageCutIsSafe(full: string, cut: string, focus: string): boolean {
  if (cut.trim().length === 0) return false

  const terms = significantTerms(focus)
  if (terms.length === 0) return true

  const fullLower = full.toLowerCase()
  const cutLower = cut.toLowerCase()
  const relevantesNoOriginal = terms.filter((t) => fullLower.includes(t))
  if (relevantesNoOriginal.length === 0) return true

  return relevantesNoOriginal.some((t) => cutLower.includes(t))
}
