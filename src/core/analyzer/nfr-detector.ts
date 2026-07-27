/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * NFR (non-functional requirement) signal detector (M4). Functional ACs rarely
 * capture performance / security / reliability / scalability / accessibility
 * concerns even when the PRD hints at them. This deterministically detects those
 * signals across the graph and flags categories that lack a dedicated NFR
 * requirement. Zero-token; the driver writes the measurable NFR.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'

export type NfrCategory = 'performance' | 'security' | 'reliability' | 'scalability' | 'accessibility'

export const NFR_CATEGORIES: NfrCategory[] = ['performance', 'security', 'reliability', 'scalability', 'accessibility']

const NFR_SIGNALS: Record<NfrCategory, RegExp> = {
  performance:
    /(latency|latência|throughput|vaz[ãa]o|response time|tempo de resposta|\bp9[59]\b|\d+\s*ms\b|requests?\s+per\s+second|\brps\b)/i,
  security:
    /(authentication|autentica|authorization|autoriza|encrypt|criptografi|\brbac\b|oauth|permiss|csrf|\bxss\b|seguran[çc]a)/i,
  reliability:
    /(uptime|\bsla\b|availability|disponibilidade|failover|redund[âa]nci|fault tolerance|toler[âa]ncia a falhas)/i,
  scalability: /(scalab|escalab|concurrent|concorrent|\bload\b|carga|horizontal scal|vertical scal|escala horizontal)/i,
  accessibility:
    /(\ba11y\b|accessibility|acessibilidade|\bwcag\b|\baria\b|screen reader|leitor de tela|contrast|contraste)/i,
}

/** Measurable example NFR per category (used in the enrichment instruction). */
export const NFR_EXAMPLE: Record<NfrCategory, string> = {
  performance: 'p95 de latência < 200ms sob 100 req/s',
  security: 'todos os endpoints exigem autenticação + autorização (RBAC)',
  reliability: 'disponibilidade ≥ 99.9% (SLA mensurável)',
  scalability: 'suporta 1000 usuários concorrentes sem degradação > 10%',
  accessibility: 'conformidade WCAG 2.1 AA (contraste ≥ 4.5:1, navegável por teclado)',
}

function nodeText(node: GraphNode): string {
  return [node.title, node.description ?? '', ...(node.acceptanceCriteria ?? [])].join(' \n ')
}

function categoriesIn(text: string): NfrCategory[] {
  return NFR_CATEGORIES.filter((cat) => NFR_SIGNALS[cat].test(text))
}

/** Categories whose signal appears anywhere in the graph text. */
export function detectNfrSignals(doc: GraphDocument): Set<NfrCategory> {
  const found = new Set<NfrCategory>()
  for (const node of doc.nodes) for (const cat of categoriesIn(nodeText(node))) found.add(cat)
  return found
}

/** True if a node is a dedicated NFR requirement (by tag or title convention). */
function isNfrNode(node: GraphNode): boolean {
  if (node.type !== 'requirement') return false
  if ((node.tags ?? []).includes('nfr')) return true
  return /\bnfr\b|não-funcional|nao-funcional|non-functional/i.test(node.title)
}

/** Categories already covered by a dedicated NFR requirement node. */
export function addressedNfrCategories(doc: GraphDocument): Set<NfrCategory> {
  const addressed = new Set<NfrCategory>()
  for (const node of doc.nodes) {
    if (!isNfrNode(node)) continue
    for (const cat of categoriesIn(nodeText(node))) addressed.add(cat)
  }
  return addressed
}

/** NFR categories signalled in the graph but lacking a dedicated NFR requirement. */
export function missingNfrCategories(doc: GraphDocument): NfrCategory[] {
  const addressed = addressedNfrCategories(doc)
  return [...detectNfrSignals(doc)].filter((c) => !addressed.has(c))
}
