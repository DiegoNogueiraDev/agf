/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Consumer-proof producer (node_f7e5dbdbdf06, épico node_7deb314e81b0).
 *
 * PORQUÊ: o pilar `consumer_proof` da Delivery Certainty (src/core/certainty/
 * delivery-certainty.ts) LÊ node.metadata.consumerProof, mas não havia caminho
 * para PREENCHÊ-lo — logo o pilar ficava eternamente vermelho e nenhum
 * deliverable alcançava PROVEN (o seam "aggregator-without-producer"). Este é o
 * produtor: constrói a prova (comando REAL rodado no modo consumidor + resultado
 * + timestamp) e a mescla no metadata de forma ADITIVA e IMUTÁVEL — nunca
 * sobrescreve campos existentes. Um `result=failed` é gravado como fato: prova
 * que falhou não é prova (o composer marca vermelho).
 *
 * Puro: o timestamp entra por parâmetro (o caller injeta Date.now()), então é
 * testável sem relógio. A escrita no store fica no comando (DIP).
 */

/** Prova de execução no modo do consumidor real. */
export interface ConsumerProof {
  /** O comando que rodou no modo do consumidor (CLI/UI). */
  command: string
  /** Resultado observado — `passed` conta como prova; `failed` é fato, não prova. */
  result: 'passed' | 'failed'
  /** Quando rodou (ms epoch) — provado, não alegado. */
  ranAt: number
  /** Evidência textual opcional (o que apareceu). */
  evidence?: string
}

/** Constrói a prova a partir do comando + resultado + timestamp injetado. */
export function buildConsumerProof(
  command: string,
  result: 'passed' | 'failed',
  ranAt: number,
  evidence?: string,
): ConsumerProof {
  return {
    command,
    result,
    ranAt,
    ...(evidence !== undefined ? { evidence } : {}),
  }
}

/**
 * Mescla a prova no metadata de forma aditiva e imutável: retorna um NOVO
 * objeto com todos os campos existentes preservados + `consumerProof`. Nunca
 * muta a entrada (AC3 — nenhum campo existente sobrescrito).
 */
export function mergeConsumerProof(
  metadata: Record<string, unknown> | undefined,
  proof: ConsumerProof,
): Record<string, unknown> {
  return { ...(metadata ?? {}), consumerProof: proof }
}
