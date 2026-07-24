/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Surface-task self-declaration (node_919687afcea8).
 *
 * PORQUÊ: um leaf-task só é uma "surface" (algo que o consumidor OPERA — uma
 * tela/fluxo) quando ele mesmo o declara ligando-se a um nó que prova esse
 * comportamento. A declaração reusa uma aresta JÁ válida (`related_to` ou
 * `implements`) apontando para um nó de tipo `scenario` ou `browser_test` — sem
 * inventar novo tipo de relação/nó. Sem essa aresta, a task é não-surface e o
 * gate ignora a prova de superfície (default OFF, backward-compat: `checks[]`
 * byte-idêntico ao de hoje). É a fronteira que {@link checkDefinitionOfDone}
 * lê para expor `isSurface` no relatório sem alterar nenhum check existente.
 */
import type { GraphDocument, NodeType, RelationType } from '../graph/graph-types.js'

/** Tipos de nó que PROVAM comportamento de superfície (a task se liga a um deles). */
const SURFACE_PROOF_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['scenario', 'browser_test'])

/**
 * Arestas JÁ válidas que uma task usa para SE DECLARAR surface. `depends_on`,
 * `blocks`, etc. NÃO declaram — só estas duas expressam "esta task realiza/refere
 * o comportamento provado por aquele nó".
 */
const SURFACE_DECLARING_RELATIONS: ReadonlySet<RelationType> = new Set<RelationType>(['related_to', 'implements'])

/**
 * Puro: uma task é surface sse tiver ≥1 out-edge declarante (related_to|implements)
 * para um nó de tipo scenario|browser_test. Sem tal aresta ⇒ false (não-surface).
 */
export function isSurfaceTask(doc: GraphDocument, nodeId: string): boolean {
  const typeById = new Map(doc.nodes.map((n) => [n.id, n.type]))
  return doc.edges.some(
    (e) =>
      e.from === nodeId &&
      SURFACE_DECLARING_RELATIONS.has(e.relationType) &&
      SURFACE_PROOF_NODE_TYPES.has(typeById.get(e.to) as NodeType),
  )
}
