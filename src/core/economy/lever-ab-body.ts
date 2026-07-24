/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * O CORPO QUE O BRAÇO DO A/B ENVIA (node_204a6111227e).
 *
 * O executor ao vivo acendeu a medição, mas o CLI montava o corpo como
 * `"Task <id>: responda OK."`. Medido: `tokensBefore = tokensAfter = 127` para
 * `cascade` E `ncd_dedup`, `savedTokens: 0`, `keep-off` nos dois. Não existe o
 * que um lever corte em 20 tokens — logo TODO veredito saía negativo por
 * construção, e o aparato ficava vivo e não-informativo.
 *
 * **Um A/B cujo resultado é constante não mede nada; apenas parece medir.**
 *
 * A correção é dar ao braço o payload que o consumidor real carrega: o
 * context-pack da task, na mensagem `role:'tool'` — que é exatamente onde o
 * middleware de economia atua. Um corpo sem nenhuma mensagem `tool` atravessa os
 * dois braços intacto por construção.
 *
 * Este módulo é PURO (recebe o contexto já lido, devolve o corpo) para que a
 * decisão de forma seja testável sem store, sem provider e sem rede.
 */

/**
 * Piso de tamanho para o corpo ser considerado uma medição válida.
 *
 * Abaixo disso o veredito "não economizou" é indistinguível de "o lever não
 * serve" — foi precisamente a confusão que o corpo de brinquedo produziu. Quem
 * consome o veredito precisa poder separar os dois casos, e o piso é o que
 * torna essa separação verificável em vez de opinativa.
 */
export const MIN_REALISTIC_BODY_CHARS = 400

/** Corpo no formato de produção (chat) que o executor entrega ao middleware. */
export interface LeverAbBody {
  messages: Array<Record<string, unknown>>
}

/**
 * Monta o corpo do braço a partir do context-pack da task.
 *
 * `context` nulo (node recém-criado, pack indisponível) degrada para um corpo
 * mínimo que ainda identifica a task: estourar o A/B inteiro por falta de
 * contexto seria pior. O corpo mínimo fica DELIBERADAMENTE abaixo de
 * {@link MIN_REALISTIC_BODY_CHARS}, para que o chamador consiga reconhecer um
 * veredito que não vale.
 *
 * Serialização com chaves ORDENADAS: sem isso, dois braços do mesmo experimento
 * poderiam diferir por ordem de propriedades e o delta mediria o serializador em
 * vez do lever.
 */
export function buildLeverAbBody(taskId: string, context: unknown): LeverAbBody {
  const messages: Array<Record<string, unknown>> = [
    { role: 'user', content: `Task ${taskId}: analise o contexto e responda OK.` },
  ]
  if (context != null) {
    messages.push({ role: 'tool', content: stableStringify(context) })
  }
  return { messages }
}

/** JSON determinístico — chaves em ordem estável em qualquer profundidade. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return val
    const record = val as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((k) => [k, record[k]]),
    )
  })
}
