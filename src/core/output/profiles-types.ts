/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Shared types for output profiles.
 * Composing: imported by all profile modules.
 */

export interface CommandProfile {
  /** Dot-paths to project from the envelope. */
  select: string[]
  /** Whether to use compressed context by default. */
  compressed?: boolean
}

export type ProfileName = 'claude-code' | 'copilot' | 'opencode' | 'minimal'
