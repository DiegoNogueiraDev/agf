/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_a81a478e2dc8 — Work profiles: bundles nomeados que configuram tier de
 * modelo + flow (λ_flow) + retries num único gesto. Inspirado nos profiles do
 * Codex CLI. Puro/determinístico; a aplicação no store é feita pela CLI.
 */

export type ModelTier = 'cheap' | 'build' | 'frontier'

export interface WorkProfile {
  modelTier: ModelTier
  /** Liga a diluição de contexto por λ_flow. */
  flow: boolean
  /** Tentativas por task no loop ao vivo. */
  retries: number
}

/** Perfis built-in: do mais barato/rápido ao mais capaz. */
export const BUILT_IN_PROFILES: Record<string, WorkProfile> = {
  fast: { modelTier: 'cheap', flow: false, retries: 1 },
  build: { modelTier: 'build', flow: true, retries: 2 },
  frontier: { modelTier: 'frontier', flow: true, retries: 3 },
}

/** Resolve um perfil por nome; `undefined` se não existir. */
export function resolveProfile(name: string): WorkProfile | undefined {
  return BUILT_IN_PROFILES[name]
}

/** Nomes dos perfis disponíveis. */
export function listProfiles(): string[] {
  return Object.keys(BUILT_IN_PROFILES)
}
