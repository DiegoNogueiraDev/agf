/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type DestructiveAction = 'form_submit' | 'file_upload' | 'destructive_click' | string

export type DestructivePolicyMode = 'allow' | 'deny' | 'ask'

export interface DestructivePolicyConfig {
  mode?: DestructivePolicyMode
}

export interface DestructivePolicy {
  isAllowed(action: DestructiveAction): boolean
  needsConfirmation(action: DestructiveAction): boolean
}

/** Create a policy for confirming destructive actions (rm, format, overwrite) based on config or DESTRUCTIVE_POLICY env var. */
export function createDestructivePolicy(config?: DestructivePolicyConfig): DestructivePolicy {
  const envMode = process.env.DESTRUCTIVE_POLICY || process.env.DESTRUCTIVE_ACTION_POLICY
  const mode: DestructivePolicyMode = config?.mode ?? (envMode as DestructivePolicyMode) ?? 'deny'

  return {
    isAllowed(_action: DestructiveAction): boolean {
      if (mode === 'allow') return true
      return false
    },

    needsConfirmation(_action: DestructiveAction): boolean {
      return mode === 'ask'
    },
  }
}
