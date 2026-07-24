/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Vague / weasel terms that make an acceptance criterion under-specified.
 * Shared by the INVEST AC validator (E-check) and the ambiguity gate (M6).
 */

/** Core vague terms — kept verbatim so the INVEST AC validator is unchanged. */
export const VAGUE_TERMS = [
  'apropriado',
  'appropriate',
  'adequado',
  'adequate',
  'rápido',
  'fast',
  'bom',
  'good',
  'bonito',
  'nice',
  'eficiente',
  'efficient',
  'robusto',
  'robust',
  'escalável',
  'scalable',
  'intuitivo',
  'intuitive',
  'fácil',
  'easy',
  'simples',
  'simple',
  'melhor',
  'better',
  'ótimo',
  'great',
  'etc',
  'e outros',
  'and more',
]

/** Extra weasel phrases used only by the ambiguity gate (richer detection). */
export const WEASEL_EXTRA = [
  'optimal',
  'se necessário',
  'if needed',
  'if applicable',
  'quando necessário',
  'flexível',
  'flexible',
  'user-friendly',
  'seamless',
  'moderno',
  'modern',
  'limpo',
  'clean',
  'among others',
  'de alguma forma',
  'somehow',
  'conforme apropriado',
  'as appropriate',
]

/** Combined set for ambiguity classification. */
export const ALL_VAGUE_TERMS = [...VAGUE_TERMS, ...WEASEL_EXTRA]
