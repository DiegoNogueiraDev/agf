/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Fonte estruturada de KR (Key Result) por épico — node_cc9c63611c2e.
 *
 * PORQUÊ: hoje o KR de um épico vive como prosa em description/ac, então o cockpit
 * não consegue distinguir "0% de atingimento" de "não há dado". Esta fonte lê o KR
 * ESTRUTURADO que o épico declara em `metadata.kr = { target, current, unit }` — um
 * campo aberto que o GraphNode.metadata já suporta (zero migração de schema, DRY) — e
 * devolve o CONTRACT {@link KrRecord} com `attainment = current/target`. Ausência de
 * estrutura ⇒ `status:'no-data'` + `provenance:'unset'`: o cockpit renderiza "sem
 * dado", nunca um falso 0%. Puro/determinístico — a fronteira de leitura é o node.
 */
import type { GraphNode } from '../graph/graph-types.js'

/** Contrato lido pelo cockpit: o KR de um épico normalizado + seu atingimento. */
export interface KrRecord {
  /** Alvo numérico do KR, ou null quando ausente/não-numérico. */
  target: number | null
  /** Valor atual, ou null quando ausente/não-numérico. */
  current: number | null
  /** Unidade de medida (percent, builds, seconds…), ou null. */
  unit: string | null
  /** current/target quando ambos são números finitos e target != 0; senão null. */
  attainment: number | null
  /** 'ok' quando target+current estruturados e numéricos; 'no-data' caso contrário. */
  status: 'ok' | 'no-data'
  /** De onde o KR veio: 'metadata' (estruturado) ou 'unset' (só prosa/ausente). */
  provenance: 'metadata' | 'unset'
}

const NO_DATA: KrRecord = {
  target: null,
  current: null,
  unit: null,
  attainment: null,
  status: 'no-data',
  provenance: 'unset',
}

/** Coerção conservadora: number|string-numérica finita ⇒ number; senão null. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Lê o KR estruturado de um épico. Devolve `no-data`/`unset` sempre que faltar
 * estrutura numérica válida (ausente, parcial, ou não-numérica) — nunca inventa
 * atingimento. `attainment` é null quando target=0 (evita divisão por zero),
 * preservando os valores brutos para exibição.
 */
export function readEpicKr(node: GraphNode): KrRecord {
  const kr = node.metadata?.kr as { target?: unknown; current?: unknown; unit?: unknown } | undefined
  if (!kr || typeof kr !== 'object') return NO_DATA

  const target = toFiniteNumber(kr.target)
  const current = toFiniteNumber(kr.current)
  if (target === null || current === null) return NO_DATA

  const unit = typeof kr.unit === 'string' && kr.unit.trim() !== '' ? kr.unit : null
  const attainment = target !== 0 ? current / target : null
  return { target, current, unit, attainment, status: 'ok', provenance: 'metadata' }
}
