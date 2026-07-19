/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Flow config resolver — reads the `flow_config` project setting (a JSON blob)
 * and parses it through {@link FlowConfigSchema}, so every absent field falls
 * back to its safe default. With no setting stored, flow is OFF and the context
 * pipeline behaves exactly as before.
 */

import { FlowConfigSchema, type FlowConfig } from '../config/config-schema.js'

/** Minimal surface needed to read the persisted flow config. */
export interface FlowConfigSource {
  getProjectSetting(key: string): string | null
}

export const FLOW_CONFIG_SETTING_KEY = 'flow_config'

/** Resolve the effective flow config; defaults (enabled=false) when unset/invalid. */
export function resolveFlowConfig(source: FlowConfigSource): FlowConfig {
  const raw = source.getProjectSetting(FLOW_CONFIG_SETTING_KEY)
  if (!raw) return FlowConfigSchema.parse({})
  try {
    return FlowConfigSchema.parse(JSON.parse(raw))
  } catch {
    // Corrupt/partial setting → safe defaults rather than throwing in the hot path.
    return FlowConfigSchema.parse({})
  }
}

/**
 * Deterministic A/B arm assignment for a node id. Stable across calls (same node
 * always lands in the same arm) so the comparison isn't polluted by node-level
 * variance. Even char-sum → flow_on, odd → flow_off.
 */
export function flowAbArm(nodeId: string): 'flow_on' | 'flow_off' {
  let sum = 0
  for (let i = 0; i < nodeId.length; i += 1) sum += nodeId.charCodeAt(i)
  return sum % 2 === 0 ? 'flow_on' : 'flow_off'
}
