/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Session config resolver — the HARNESS-level `config` surface from the
 * architecture diagram. Resolves the active preset/provider/model-pin/flags the
 * session runs under. Pure: reads env + optional overrides, no store I/O.
 */

import type { SessionConfig } from '../../schemas/session.schema.js'

/** Default preset when none is configured. */
const DEFAULT_PRESET = 'default'

/** Overrides a caller may pass (e.g. from CLI flags or worker-state). */
export interface SessionConfigOverrides {
  preset?: string
  provider?: string
  modelPin?: string | null
  flags?: Record<string, boolean | string>
}

/** Resolve the active session config, applying overrides over sensible defaults. */
export function resolveSessionConfig(overrides: SessionConfigOverrides = {}): SessionConfig {
  const provider = overrides.provider ?? process.env.AGF_PROVIDER ?? 'copilot'
  return {
    preset: overrides.preset ?? DEFAULT_PRESET,
    provider,
    modelPin: overrides.modelPin ?? null,
    flags: { ...(overrides.flags ?? {}) },
  }
}
