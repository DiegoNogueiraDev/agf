/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_c706f5c14bc8 — CLIProvider interface (ADR-001).
 *
 * Strategy Pattern: each CLI mode (hook, direct) implements this interface.
 * Detection via env vars + filesystem markers.
 * Base on: src/core/init/detect.ts, src/core/hooks/config-loader.ts (AgentSource).
 */

import type { AgentSource } from '../hooks/config-loader.js'

/** Connection mode: hook (shell commands via hooks) or direct (MCP in-process). */
export type CliConnectionMode = 'hook' | 'direct'

/** Result of CLI detection. */
export interface CliDetection {
  /** Which agent CLI was detected. */
  readonly source: AgentSource
  /** How to connect to it. */
  readonly mode: CliConnectionMode
  /** Human-readable label (e.g. "OpenCode"). */
  readonly label: string
  /** Confidence 0-1. Higher = more certain detection. */
  readonly confidence: number
}

/**
 * Strategy interface for CLI detection and mode resolution.
 * Each detector knows how to identify a specific CLI tool.
 */
export interface CliDetector {
  /** Unique provider identifier matching AgentSource. */
  readonly id: AgentSource
  /** Human-readable name. */
  readonly label: string
  /** Priority for conflict resolution (higher = preferred on tie). */
  readonly priority: number
  /**
   * Detect if this CLI is active in the environment.
   * @param env - Environment variables.
   * @param hasMarker - Optional function to check filesystem markers (dir exists).
   * @returns Detection result or null if not detected.
   */
  detect(env: Record<string, string | undefined>, hasMarker?: (dir: string) => boolean): CliDetection | null
}

// ─── Built-in detectors ──────────────────────────────────────────────

const OPENCODE_ENV_VAR = 'OPENCODE'
const CODEX_ENV_VAR = 'CODEX'
const CLAUDE_CODE_ENV_VAR = 'CLAUDE_CODE'
const COPILOT_ENV_VAR = 'COPILOT'

/**
 * Detector for OpenCode (formerly SST).
 * Uses env var OPENCODE=1 or .opencode directory marker.
 */
export const opencodeDetector: CliDetector = {
  id: 'opencode',
  label: 'OpenCode',
  priority: 10,
  detect(env, hasMarker) {
    if (env[OPENCODE_ENV_VAR] === '1') {
      return { source: 'opencode', mode: 'hook', label: 'OpenCode', confidence: 1 }
    }
    if (hasMarker && hasMarker('.opencode')) {
      return { source: 'opencode', mode: 'hook', label: 'OpenCode', confidence: 0.7 }
    }
    return null
  },
}

/**
 * Detector for Codex CLI.
 * Uses env var CODEX=1.
 */
export const codexDetector: CliDetector = {
  id: 'codex',
  label: 'Codex',
  priority: 10,
  detect(env) {
    if (env[CODEX_ENV_VAR] === '1') {
      return { source: 'codex', mode: 'hook', label: 'Codex', confidence: 1 }
    }
    return null
  },
}

/**
 * Detector for Claude Code.
 * Uses env var CLAUDE_CODE=1/true or .claude directory marker.
 */
export const claudeDetector: CliDetector = {
  id: 'claude',
  label: 'Claude Code',
  priority: 10,
  detect(env, hasMarker) {
    // Claude Code sets CLAUDECODE=1 (no underscore) + CLAUDE_CODE_* vars; accept
    // CLAUDE_CODE too for forward-compat. These markers mean Claude IS the driver.
    const v = env[CLAUDE_CODE_ENV_VAR] ?? env.CLAUDECODE
    if (v === '1' || v === 'true' || env.CLAUDE_CODE_ENTRYPOINT) {
      return { source: 'claude', mode: 'hook', label: 'Claude Code', confidence: 1 }
    }
    if (hasMarker && hasMarker('.claude')) {
      return { source: 'claude', mode: 'hook', label: 'Claude Code', confidence: 0.7 }
    }
    return null
  },
}

/**
 * Detector for GitHub Copilot.
 * Uses env var COPILOT=1. Mode is direct (MCP in-process) since Copilot
 * does not expose a hook system like opencode/codex/claude.
 */
export const copilotDetector: CliDetector = {
  id: 'copilot',
  label: 'GitHub Copilot',
  priority: 5,
  detect(env) {
    // GitHub Copilot CLI markers — CONFIRMED live (Copilot CLI 1.0.63, authenticated,
    // captured from a spawned child env): COPILOT_CLI=1 (≈ CLAUDECODE=1),
    // COPILOT_AGENT_SESSION_ID (per-session, ≈ CLAUDE_CODE_SESSION_ID), and
    // COPILOT_CLI_BINARY_VERSION. (COPILOT_AGENT never existed — removed.)
    // COPILOT=1 / COPILOT_HOME / COPILOT_MODEL kept as user-config fallbacks.
    if (
      env.COPILOT_CLI === '1' ||
      env.COPILOT_AGENT_SESSION_ID !== undefined ||
      env.COPILOT_CLI_BINARY_VERSION ||
      env[COPILOT_ENV_VAR] === '1' ||
      env.COPILOT_HOME ||
      env.COPILOT_MODEL
    ) {
      return { source: 'copilot', mode: 'direct', label: 'GitHub Copilot', confidence: 0.8 }
    }
    return null
  },
}

const DEFAULT_DETECTORS: CliDetector[] = [opencodeDetector, codexDetector, claudeDetector, copilotDetector]

/**
 * Resolve active CLI across multiple detectors.
 * Returns the highest-confidence match, or null if none detected.
 *
 * @param detectors - Array of CliDetector strategies (defaults to built-in set).
 * @param env - Environment variables to check.
 * @param hasMarker - Optional filesystem marker checker.
 */
export function detectActiveCLI(
  detectors: CliDetector[] = DEFAULT_DETECTORS,
  env: Record<string, string | undefined> = process.env,
  hasMarker?: (dir: string) => boolean,
): CliDetection | null {
  let best: CliDetection | null = null
  for (const d of detectors) {
    const result = d.detect(env, hasMarker)
    if (result && (!best || result.confidence > best.confidence)) {
      best = result
    }
  }
  return best
}
