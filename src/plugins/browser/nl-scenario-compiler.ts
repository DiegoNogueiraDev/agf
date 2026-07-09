/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 2.1: Compilador NL → plano de passos.
 *
 * Converte texto livre/pseudocódigo (PT/EN) num plano ORDENADO de passos, cada um
 * mapeado para um tool do browser agent (browser_*). Deterministic-first: passos claros
 * resolvem com 0 token; passos ambíguos são marcados `needsDelegation` para o
 * orquestrador delegar ao code agent (brief/submit). Guardrail: isto só PLANEJA —
 * não executa browser; o agf não pivota para ferramenta de RPA.
 */

/** Um passo do cenário, mapeado (ou não) para um tool do browser agent. */
export interface ScenarioStep {
  /** Linha original em linguagem natural. */
  raw: string
  /** Tool browser agent resolvido (browser_*), ou null se não-resolvido. */
  tool: string | null
  /** Argumentos extraídos para o tool. */
  args: Record<string, unknown>
  /** Confiança determinística do match (0–1). */
  confidence: number
  /** true quando o passo precisa ser delegado a um code agent (ambíguo). */
  needsDelegation: boolean
}

/** Plano de cenário compilado a partir de NL. */
export interface ScenarioPlan {
  steps: ScenarioStep[]
  /** Quantos passos precisam de delegação (não resolvidos deterministicamente). */
  unresolved: number
}

interface Rule {
  tool: string
  test: RegExp
  /** Extrai args do match; default {}. */
  args?: (m: RegExpMatchArray) => Record<string, unknown>
}

const URL_RE = /(https?:\/\/[^\s'"]+|\b[\w-]+\.[a-z]{2,}(?:\/[^\s'"]*)?)/i

const RULES: Rule[] = [
  {
    tool: 'browser_navigate',
    test: /\b(?:navigate to|go to|open|visit|acesse|abra|abrir|navegue para|ir para)\b\s+(.+)/i,
    args: (m) => {
      const url = (m[1].match(URL_RE)?.[0] ?? m[1].trim()).replace(/[.,;]+$/, '')
      return { url }
    },
  },
  {
    tool: 'browser_type',
    test: /\b(?:type|enter|fill|digite|preencha|escreva|insira)\b\s+["']?(.+?)["']?\s+(?:in|into|em|no|na)\s+(.+)/i,
    args: (m) => ({ text: m[1].trim(), field: m[2].trim().replace(/[.,;]+$/, '') }),
  },
  {
    tool: 'browser_press_key',
    test: /\b(?:press|hit|tecle|pressione)\b\s+(.+)/i,
    args: (m) => ({ key: m[1].trim().replace(/[.,;]+$/, '') }),
  },
  {
    tool: 'browser_click',
    test: /\b(?:click|tap|clique|clicar|aperte)\b\s*(?:on|em|no|na)?\s*(.+)/i,
    args: (m) => ({ target: m[1].trim().replace(/[.,;]+$/, '') }),
  },
  {
    tool: 'browser_screenshot',
    test: /\b(?:screenshot|capture|captura|tire uma foto|print)\b/i,
  },
  {
    tool: 'browser_press_key',
    test: /\b(?:scroll|role|rolar)\b/i,
    args: () => ({ key: 'PageDown' }),
  },
]

/** Quebra o roteiro em linhas de passo (numeradas, com bullets, ou por linha). */
function splitSteps(nl: string): string[] {
  return nl
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((l) => l.length > 0)
}

/**
 * Compila um roteiro em linguagem natural num plano ordenado de passos.
 * Cada linha vira um ScenarioStep; passos sem regra casada ficam needsDelegation.
 */
export function compileScenario(nl: string): ScenarioPlan {
  const lines = splitSteps(nl)
  const steps: ScenarioStep[] = lines.map((raw) => {
    for (const rule of RULES) {
      const m = raw.match(rule.test)
      if (m) {
        return { raw, tool: rule.tool, args: rule.args ? rule.args(m) : {}, confidence: 0.9, needsDelegation: false }
      }
    }
    return { raw, tool: null, args: {}, confidence: 0, needsDelegation: true }
  })
  return { steps, unresolved: steps.filter((s) => s.needsDelegation).length }
}
