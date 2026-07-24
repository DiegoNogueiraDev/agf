/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_a689c5ad8c9a — Doctrine: o credo de engenharia da CLI.
 *
 * Catálogo tipado dos princípios que governam o produto — Clean Code, XP, TDD,
 * Lean/TOC — com a fórmula do dono `λ_flow = λ_base + α·Φ(t)` como peça central
 * da economia de token. Dados puros + selectors; surfados pelo comando
 * `principles`. Fonte única de verdade do "como construímos".
 */

export type PrincipleCategory = 'promise' | 'tdd' | 'clean-code' | 'xp' | 'flow' | 'lean'

export interface Principle {
  id: string
  title: string
  category: PrincipleCategory
  /** A regra, em uma frase acionável. */
  statement: string
  /** Por que ela existe (o ganho que protege). */
  rationale: string
}

/**
 * O catálogo. Imutável em runtime (congelado). λ_flow é deliberadamente o
 * primeiro princípio de `flow` — a economia de token é o diferencial do projeto.
 */
const PRINCIPLES: readonly Principle[] = Object.freeze([
  // ── Promessa (o filtro de toda decisão) ──────────────────
  {
    id: 'three-pillars',
    title: 'Três pilares',
    category: 'promise',
    statement: 'Rápido · best-practice SWE · custo de token brutalmente baixo. O que não serve aos três, não entra.',
    rationale: 'Uma promessa única alinha cada decisão de produto; remove ambiguidade sobre o que merece existir.',
  },

  // ── TDD ──────────────────────────────────────────────────
  {
    id: 'tdd-red-green-refactor',
    title: 'TDD Red → Green → Refactor',
    category: 'tdd',
    statement: 'Sem teste, sem código. Escreva o teste que falha (Red), faça passar (Green), então refatore.',
    rationale: 'O teste primeiro define o contrato e elimina retrabalho — o anti-vibe-coding por excelência.',
  },
  {
    id: 'ac-as-contract',
    title: 'AC como contrato',
    category: 'tdd',
    statement: 'Critérios de aceitação Given/When/Then são o contrato; o DoD precisa passar antes de `done`.',
    rationale: "AC testável transforma intenção em verificação objetiva — nada é 'pronto' por opinião.",
  },

  // ── Clean Code ───────────────────────────────────────────
  {
    id: 'clean-functions',
    title: 'Funções pequenas e reveladoras',
    category: 'clean-code',
    statement: 'Funções fazem uma coisa, num só nível de abstração, com nomes que revelam intenção.',
    rationale: 'Código que se lê como prosa reduz alucinação do agente e custo de manutenção.',
  },
  {
    id: 'typed-errors',
    title: 'Erros tipados',
    category: 'clean-code',
    statement: 'Nunca lance string crua; use erros tipados e trate falhas explicitamente.',
    rationale: 'Erros classificáveis permitem retry inteligente e diagnósticos — não silenciam o sistema.',
  },
  {
    id: 'no-magic',
    title: 'Sem mágica, sem `any`',
    category: 'clean-code',
    statement: 'Sem números mágicos, sem `any`; tipos estritos e constantes nomeadas.',
    rationale: 'Tipos são contexto de máquina — elevam o agent-readiness e barram regressões em compilação.',
  },

  // ── XP ───────────────────────────────────────────────────
  {
    id: 'atomic-decomposition',
    title: 'Decomposição atômica',
    category: 'xp',
    statement: 'Cada task é completável em ≤2h; epics viram tasks atômicas antes de implementar.',
    rationale: 'Pequenos passos verificáveis mantêm o ciclo curto e o custo previsível.',
  },
  {
    id: 'anti-one-shot',
    title: 'Anti-one-shot',
    category: 'xp',
    statement: 'Nunca gere um sistema inteiro num prompt; decomponha e itere.',
    rationale: 'Geração one-shot infla tokens e esconde defeitos — o oposto da disciplina incremental.',
  },
  {
    id: 'code-detachment',
    title: 'Code detachment',
    category: 'xp',
    statement: 'Se a IA errou, explique o erro via prompt e regenere — não edite o resultado à mão.',
    rationale: 'Mantém o agente como autor responsável e preserva a rastreabilidade no grafo.',
  },

  // ── Lean / Theory of Constraints ─────────────────────────
  {
    id: 'wip-one',
    title: 'WIP = 1',
    category: 'lean',
    statement: 'No máximo uma task `in_progress` por vez.',
    rationale: 'Lei de Little: cycle_time = WIP / throughput — menos WIP, menos cycle time.',
  },
  {
    id: 'pull-not-push',
    title: 'Pull, não push',
    category: 'lean',
    statement: '`next` puxa a próxima task desbloqueada; nunca empurre para `in_progress`.',
    rationale: 'Sistema pull respeita o gargalo (TOC) e evita acúmulo de WIP.',
  },

  // ── Flow / economia de token (a fórmula do dono no centro) ─
  {
    id: 'token-economy-lambda-flow',
    title: 'Hipofrontalidade: λ_flow',
    category: 'flow',
    statement:
      'λ_flow = λ_base + (α · Φ(t)). Φ (índice de flow, EMA com histerese) governa a agressividade do esquecimento; o decaimento e^{-λ·d} dilui a vizinhança do grafo — cortando tokens de contexto sem perder invariantes.',
    rationale:
      'O diferencial do projeto: um controlador determinístico de esquecimento corta o custo de contexto sem sumarização por LLM.',
  },
  {
    id: 'repo-map-ranked',
    title: 'Repo-map ranqueado',
    category: 'flow',
    statement: 'Injete símbolos ranqueados por PageRank num budget ~1k tokens, focados na task.',
    rationale: 'Contexto de entrada mínimo e relevante — corte de token sem perder sinal.',
  },
  {
    id: 'compact-feedback',
    title: 'Feedback compacto no retry',
    category: 'flow',
    statement: 'No retry, realimente só a saída de teste que falhou (truncada), pedindo fix incremental.',
    rationale: 'Menos tokens por iteração e menos escalações que re-geram do zero.',
  },
])

/** Todos os princípios (cópia rasa imutável). */
export function listPrinciples(): readonly Principle[] {
  return PRINCIPLES
}

/** Um princípio por id, ou `undefined`. */
export function getPrinciple(id: string): Principle | undefined {
  return PRINCIPLES.find((p) => p.id === id)
}

/** Princípios de uma categoria. */
export function principlesByCategory(category: PrincipleCategory): Principle[] {
  return PRINCIPLES.filter((p) => p.category === category)
}

/** Categorias presentes no catálogo (únicas, ordem de primeira aparição). */
export function listCategories(): PrincipleCategory[] {
  const seen: PrincipleCategory[] = []
  for (const p of PRINCIPLES) {
    if (!seen.includes(p.category)) seen.push(p.category)
  }
  return seen
}
