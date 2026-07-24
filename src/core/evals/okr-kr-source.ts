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

/** O que o produtor grava em `node.metadata.kr` — a mesma forma que {@link readEpicKr} lê. */
export interface KrMetadata {
  target: number
  current: number
  unit?: string
  /**
   * Prazo (ISO). Sem ele a régua de ritmo de `computeOkrStatus` não roda e o
   * KR morre em `no-data` — o que deixa o filtro `--at-risk` sobre um domínio
   * que nunca se povoa. É o campo que torna o veredito POSSÍVEL.
   */
  deadline?: string
}

export type BuildKrResult = { ok: true; kr: KrMetadata } | { ok: false; code: string; error: string }

/**
 * Constrói o `metadata.kr` a partir de entrada crua da CLI.
 *
 * PORQUÊ existe: `readEpicKr` lia essa estrutura e NADA a escrevia — 519 épicos
 * eternamente `no-data`. O leitor estava certo (ausência É no-data), mas um
 * cockpit que só sabe dizer "sem dado" não mede nada; a metade que faltava é
 * esta.
 *
 * Valida ANTES de qualquer escrita e devolve dados, não efeito: um KR aplicado
 * pela metade (target aceito, current recusado) faria o atingimento ser
 * calculado sobre fontes misturadas — pior que recusar, porque o número
 * pareceria real. Reusa {@link toFiniteNumber}, a MESMA coerção do leitor, para
 * que produtor e consumidor nunca divirjam sobre o que conta como número.
 *
 * `unit` é omitido quando não informado — inventar unidade é rotular um número
 * com um significado que ninguém declarou.
 */
export function buildKrMetadata(input: {
  target: unknown
  current: unknown
  unit?: unknown
  deadline?: unknown
}): BuildKrResult {
  const target = toFiniteNumber(input.target)
  if (target === null) {
    return { ok: false, code: 'INVALID_KR', error: 'target must be a finite number' }
  }

  const current = toFiniteNumber(input.current)
  if (current === null) {
    return { ok: false, code: 'INVALID_KR', error: 'current must be a finite number' }
  }

  // Uma data que ninguém consegue parsear é pior que nenhuma: viraria um prazo
  // silenciosamente ignorado pelo leitor, e o épico continuaria `no-data` sem
  // que ninguém entendesse por quê.
  let deadline: string | undefined
  if (input.deadline !== undefined && input.deadline !== null && input.deadline !== '') {
    if (typeof input.deadline !== 'string' || !Number.isFinite(Date.parse(input.deadline))) {
      return { ok: false, code: 'INVALID_KR', error: 'deadline must be a parseable date (ISO 8601)' }
    }
    deadline = input.deadline
  }

  const unit = typeof input.unit === 'string' && input.unit.trim() !== '' ? input.unit.trim() : undefined
  return { ok: true, kr: { target, current, ...(unit ? { unit } : {}), ...(deadline ? { deadline } : {}) } }
}
