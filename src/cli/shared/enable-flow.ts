/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Liga a diluição de contexto por λ_flow para o projeto: persiste
 * `flow_config={enabled:true,...}` (mesclando com o que já existir), de forma que
 * `resolveFlowConfig` passe a retornar `enabled=true` no hot-path do contexto.
 * Idempotente — só altera o campo `enabled`.
 */
import { FLOW_CONFIG_SETTING_KEY } from '../../core/context/flow-config.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'enable-flow.ts' })

export interface FlowToggleStore {
  getProjectSetting(key: string): string | null
  setProjectSetting(key: string, value: string): void
}

/** Liga/desliga o flow no projeto, preservando quaisquer overrides já gravados. */
export function setFlowEnabled(store: FlowToggleStore, enabled: boolean): void {
  const raw = store.getProjectSetting(FLOW_CONFIG_SETTING_KEY)
  let current: Record<string, unknown> = {}
  if (raw) {
    try {
      current = JSON.parse(raw) as Record<string, unknown>
    } catch {
      current = {}
    }
  }
  store.setProjectSetting(FLOW_CONFIG_SETTING_KEY, JSON.stringify({ ...current, enabled }))
}

/** Ativa o flow no projeto (preserva overrides). */
export function enableFlowConfig(store: FlowToggleStore): void {
  log.debug('enabling flow config')
  setFlowEnabled(store, true)
}
