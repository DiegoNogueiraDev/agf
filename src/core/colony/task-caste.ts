/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type TaskCasteKind = 'minima' | 'pequena' | 'media' | 'soldado'
export type ModelTier = 'cheap' | 'build' | 'frontier'

export interface TaskCasteInput {
  type: string
  priority: number
  acceptanceCriteria: string[]
}

const CASTE_MODEL: Record<TaskCasteKind, ModelTier> = {
  soldado: 'frontier',
  media: 'build',
  pequena: 'cheap',
  minima: 'cheap',
}

const HIGH_AC_THRESHOLD = 4

function baseCasteFromPriority(priority: number): TaskCasteKind {
  if (priority <= 1) return 'soldado'
  if (priority <= 3) return 'media'
  if (priority === 4) return 'pequena'
  return 'minima'
}

const CASTE_ORDER: TaskCasteKind[] = ['minima', 'pequena', 'media', 'soldado']

function bumpCaste(caste: TaskCasteKind): TaskCasteKind {
  const idx = CASTE_ORDER.indexOf(caste)
  return idx < CASTE_ORDER.length - 1 ? CASTE_ORDER[idx + 1]! : caste
}

export function computeTaskCaste(input: TaskCasteInput): TaskCasteKind {
  if (input.type === 'bug') return 'minima'
  if (input.type === 'epic') return 'soldado'

  const base = baseCasteFromPriority(input.priority)
  if (input.acceptanceCriteria.length >= HIGH_AC_THRESHOLD) return bumpCaste(base)
  return base
}

export function casteToModelTier(caste: TaskCasteKind): ModelTier {
  return CASTE_MODEL[caste]
}
