/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 Diego Nogueira (surface-skill)
 * Copyright © 2026 Diego Lima Nogueira de Paula (port and changes)
 *
 * Adapted from surface-skill (https://github.com/DiegoNogueiraDev/surface-skill), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * task-policy-rendering — Deterministic format decision engine for TUI output.
 *
 * Zero dependencies. Zero LLM. Pure deterministic routing.
 *
 * Given signals (intent, consumer, size, content), walks a policy of rules
 * top-to-bottom and returns the first matching format. The format determines
 * how output renders in the TUI (colored diff, JSON pretty-print, markdown).
 */

import { McpGraphError } from '../core/utils/errors.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/surface-decide.ts' })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormatIntent =
  'spec' | 'code-review' | 'report' | 'dashboard' | 'mockup' | 'scratchpad' | 'doc' | 'data-extract'

export type FormatConsumer = 'human-once' | 'human-archive' | 'agent-next' | 'agent-verify' | 'rag-ingest'

export type FormatSize = 'small' | 'medium' | 'large'

export type OutputFormat = 'markdown' | 'html' | 'html+svg' | 'json' | 'hybrid-md-html'

export interface Signals {
  intent?: FormatIntent
  consumer?: FormatConsumer
  size?: FormatSize
}

export interface PolicyRule {
  name: string
  match: '*' | Partial<Record<keyof Signals, string | string[] | '*'>>
  decide: { format: OutputFormat; reason: string }
}

export interface Policy {
  version: number
  rules: PolicyRule[]
  prompts: Record<OutputFormat, string>
}

export interface Decision {
  format: OutputFormat
  promptPrefix: string
  rationale: string
  matchedRule: string
}

// ---------------------------------------------------------------------------
// Match logic
// ---------------------------------------------------------------------------

function fieldMatches(signal: string | undefined, criterion: string | string[]): boolean {
  if (signal === undefined) return false
  if (Array.isArray(criterion)) return criterion.includes(signal)
  return criterion === signal
}

function ruleMatches(signals: Signals, rule: PolicyRule): boolean {
  if (rule.match === '*') return true
  for (const [field, criterion] of Object.entries(rule.match)) {
    const value = signals[field as keyof Signals]
    if (!fieldMatches(value, criterion as string | string[])) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Default policy (embedded, no YAML dependency)
// ---------------------------------------------------------------------------

export const DEFAULT_POLICY: Policy = {
  version: 1,
  rules: [
    {
      name: 'Code review for humans → html',
      match: { intent: 'code-review', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'html', reason: 'Code reviews need colored diffs and annotations.' },
    },
    {
      name: 'Dashboard for humans → html',
      match: { intent: 'dashboard', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'html', reason: 'Dashboards are visual interfaces.' },
    },
    {
      name: 'Spec for agent → hybrid',
      match: { intent: 'spec', consumer: 'agent-next' },
      decide: { format: 'hybrid-md-html', reason: 'Agents read MD well with HTML islands.' },
    },
    {
      name: 'Large spec → html',
      match: { intent: 'spec', consumer: ['human-once', 'human-archive'], size: 'large' },
      decide: { format: 'html', reason: 'Large specs need structured layout.' },
    },
    {
      name: 'Spec for humans → markdown',
      match: { intent: 'spec', consumer: ['human-once', 'human-archive'], size: ['small', 'medium'] },
      decide: { format: 'markdown', reason: 'Short specs scan fine as Markdown.' },
    },
    {
      name: 'Data extraction → json',
      match: { intent: 'data-extract' },
      decide: { format: 'json', reason: 'Structured data belongs in structured containers.' },
    },
    {
      name: 'Doc for humans → markdown',
      match: { intent: 'doc', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'markdown', reason: 'Documentation stays portable as Markdown.' },
    },
    {
      name: 'Report → markdown',
      match: { intent: 'report', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'markdown', reason: 'Reports default to readable Markdown.' },
    },
    {
      name: 'Default fallback',
      match: '*',
      decide: { format: 'markdown', reason: 'Conservative default: portable and readable.' },
    },
  ],
  prompts: {
    markdown: 'Output clean GitHub-flavored Markdown. Use ATX headings, fenced code blocks, tables.',
    html: 'Output self-contained HTML5. Inline styles only. Semantic tags. No JS unless interactive.',
    'html+svg': 'Output HTML with inline SVG. Use viewBox. Vector over raster.',
    json: 'Output a single JSON object. No prose, no fences. Top-level fields only.',
    'hybrid-md-html': 'Markdown with embedded HTML blocks for high-density content.',
  },
}

// ---------------------------------------------------------------------------
// Core decide function
// ---------------------------------------------------------------------------

/** Evaluates policy rules against signals and returns the first matching Decision. */
export function decide(signals: Signals, policy: Policy): Decision {
  for (const rule of policy.rules) {
    if (ruleMatches(signals, rule)) {
      const format = rule.decide.format
      return {
        format,
        promptPrefix: policy.prompts[format] ?? '',
        rationale: rule.decide.reason,
        matchedRule: rule.name,
      }
    }
  }
  throw new McpGraphError(
    `surface.decide: no matching rule for signals ${JSON.stringify(signals)}. ` +
      `Add a fallback rule with match: "*" to your policy.`,
  )
}

/**
 * Decides the output format for a command result.
 * Uses the default policy, defaulting to "markdown" for terminal display.
 */
export function decideOutput(intent: FormatIntent, size?: FormatSize): { format: OutputFormat; rationale: string } {
  log.debug(`decideOutput: intent=${intent}`)
  const signals: Signals = {
    intent,
    consumer: 'human-once',
    size,
  }
  const result = decide(signals, DEFAULT_POLICY)
  return { format: result.format, rationale: result.rationale }
}
