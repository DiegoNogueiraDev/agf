/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Writes OutputEnvelope to stdout as single-line JSON.
 * Supports --pretty for human-readable indented output, --select for
 * deterministic field projection, --profile for agent-aware presets,
 * and --ai for ultra-compact AI consumption (~75% token reduction).
 */

import type { OutputEnvelope } from './envelope.js'
import { projectEnvelope } from './select.js'
import type { ProfileName } from './profiles.js'
import { resolveProfile } from './profiles.js'
import { aiCompress } from './ai-compress.js'
import { extractDecision, formatDecisionOnly } from './decision-filter.js'
import { routeOutputFormat, type ConsumerType, type SizeHint } from './format-routing-policy.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'writer.ts' })

/** Detect AI coding agent from env vars. Returns agent name or null. */
const AI_AGENTS: Record<string, string> = {
  CLAUDE_CODE: 'Claude Code',
  OPENCODE: 'OpenCode',
  GITHUB_COPILOT: 'GitHub Copilot',
  CODEX_CLI: 'Codex',
  CURSOR: 'Cursor',
  AIDER: 'Aider',
  WINDSURF: 'Windsurf',
  ANTIGRAVITY: 'Antigravity',
  AMAZON_Q: 'Amazon Q',
  GEMINI_CODE_ASSIST: 'Gemini Code Assist',
  CONTINUE: 'Continue',
  TABBY: 'Tabby',
  WARP: 'Warp',
  CODEIUM: 'Codeium',
}

export function detectAiFromEnv(): string | null {
  for (const [envVar, name] of Object.entries(AI_AGENTS)) {
    if (process.env[envVar] !== undefined) return name
  }
  return null
}

/**
 * Map a detected agent display name (from {@link detectAiFromEnv}) to the
 * output profile purpose-built for it. Agents without a dedicated profile —
 * and the no-agent case — fall back to `minimal`, preserving the historical
 * `--ai` default byte-for-byte.
 */
const AGENT_PROFILE: Record<string, ProfileName> = {
  'Claude Code': 'claude-code',
  'GitHub Copilot': 'copilot',
  OpenCode: 'opencode',
}

export function resolveAgentProfile(agentName: string | null): ProfileName {
  if (!agentName) return 'minimal'
  return AGENT_PROFILE[agentName] ?? 'minimal'
}

let pretty = false
let selectPaths: string[] | null = null
let profileName: ProfileName | undefined
let currentCommand: string | undefined
let aiMode = false
/** Profile resolved from the env-detected AI agent; enriches `--ai`. */
let detectedProfile: ProfileName | undefined
let decisionOnly = false
let autoFormat = false

export function setPretty(v: boolean): void {
  pretty = v
}

/** Set the `--select` dot-paths (null/empty disables projection). */
export function setSelect(paths: string[] | null): void {
  selectPaths = paths && paths.length > 0 ? paths : null
}

/** Set the `--profile` name for agent-aware output presets. */
export function setProfile(name: ProfileName | undefined): void {
  profileName = name
}

/** Set the current command name (used for profile resolution). */
export function setCurrentCommand(cmd: string): void {
  currentCommand = cmd
}

/** Enable ultra-compact AI mode (quiet + envelope compression). */
export function setAi(v: boolean): void {
  aiMode = v
}

/**
 * Record the env-detected AI agent so `--ai` resolves that agent's richer
 * profile instead of always collapsing to `minimal`. Pass `null` to clear
 * (keeps the `minimal` fallback).
 */
export function setDetectedAgent(agentName: string | null): void {
  detectedProfile = agentName ? resolveAgentProfile(agentName) : undefined
}

/** Enable `--decision-only`: collapse the envelope to a compact APPROVED/REJECTED line. */
export function setDecisionOnly(v: boolean): void {
  decisionOnly = v
}

/**
 * Enable `--auto-format`: derive rich (pretty) vs. json (compact) from
 * format-routing-policy instead of `--pretty` alone. A detected AI agent
 * routes to `json`; no detected agent routes to `rich`. Opt-in — default
 * output is unchanged when this is off.
 */
export function setAutoFormat(v: boolean): void {
  autoFormat = v
}

export function writeEnvelope(env: OutputEnvelope): void {
  // Profile resolution precedence (most explicit wins):
  //   1. --select  2. --profile <name>  3. --ai → detected agent ?? minimal
  // An explicit --profile must win over the (often default-on) --ai mode, so it
  // is checked first; otherwise the auto-enabled --ai would shadow the flag.
  let effectivePaths = selectPaths

  if (!effectivePaths && currentCommand) {
    if (profileName) {
      const resolved = resolveProfile(profileName, currentCommand)
      if (resolved?.select) {
        effectivePaths = resolved.select
      }
    } else if (aiMode) {
      const resolved = resolveProfile(detectedProfile ?? 'minimal', currentCommand)
      if (resolved?.select) {
        effectivePaths = resolved.select
      }
    }
  }

  let out = effectivePaths ? projectEnvelope(env, effectivePaths) : env

  // AI compression: strip noise, flatten checks, compress savings
  if (aiMode) {
    out = aiCompress(out)
  }

  if (decisionOnly) {
    const envWithMessage = out as OutputEnvelope
    const candidate = envWithMessage.message ?? JSON.stringify(envWithMessage.data ?? envWithMessage.error ?? '')
    const decision = extractDecision(candidate)
    if (decision) {
      // Full context stays out of stdout (token economy) but is not lost —
      // it lands in the debug log buffer for later retrieval.
      log.debug('decision-only:full-context', { envelope: out })
      process.stdout.write(formatDecisionOnly(decision) + '\n')
      return
    }
  }

  let prettyEffective = pretty
  if (autoFormat) {
    const consumer: ConsumerType = detectedProfile ? 'agent-generic' : 'human'
    const size = JSON.stringify(out).length
    const sizeHint: SizeHint = size < 500 ? 'small' : size < 5000 ? 'medium' : 'large'
    const routed = routeOutputFormat({ consumer, intent: currentCommand ?? 'unknown', sizeHint })
    prettyEffective = routed.format === 'rich'
  }

  const json = prettyEffective ? JSON.stringify(out, null, 2) : JSON.stringify(out)
  process.stdout.write(json + '\n')
}
