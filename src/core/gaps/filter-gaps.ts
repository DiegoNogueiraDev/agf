/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * filter-gaps — o recorte por severidade do `agf gaps` (node_754040cd2680).
 *
 * PORQUÊ existe separado: o comando validava `--severity`, aceitava o valor e
 * NUNCA filtrava — devolvia os 319 gaps do grafo para quem pediu os 37
 * `required`. O erro passou despercebido porque a resposta parece correta (é
 * uma lista de gaps), e o custo apareceu longe: duas tasks do backlog foram
 * escritas sobre contagens infladas, prescrevendo limpeza em massa de dívida
 * que, na severidade real, não era acionável.
 *
 * Puro e testável de propósito: um filtro embutido no meio de um comando é
 * exatamente o tipo de código que ninguém testa e que falha em silêncio.
 */

import type { Gap, GapSeverity } from './gap-types.js'

/**
 * Recorta por severidade. Sem severidade pedida, devolve tudo — mas quando uma
 * é pedida e nada casa, devolve VAZIO: cair no conjunto completo é a falha que
 * este módulo existe para impedir.
 */
export function filterGapsBySeverity(gaps: readonly Gap[], severity?: GapSeverity): Gap[] {
  if (!severity) return [...gaps]
  return gaps.filter((g) => g.severity === severity)
}
