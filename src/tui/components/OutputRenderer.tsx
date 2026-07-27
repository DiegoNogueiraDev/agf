/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-policy-rendering — Output renderer that formats TUI output based on surface policy.
 *
 * Wraps command output with format metadata so the TUI can apply appropriate
 * rendering (colors for diffs, indentation for JSON, plain for markdown).
 */
import { Text, Box } from 'ink'
import type { ReactElement } from 'react'
import { decide, DEFAULT_POLICY, type FormatIntent, type OutputFormat, type Signals } from '../surface-decide.js'

export type { FormatIntent }

export interface OutputRenderResult {
  format: OutputFormat
  content: string
  rationale: string
  matchedRule: string
}

/**
 * Decides the rendering format for a command output based on intent.
 */
export function classifyOutput(intent: FormatIntent): OutputRenderResult {
  const signals: Signals = { intent, consumer: 'human-once' }
  const decision = decide(signals, DEFAULT_POLICY)
  return {
    format: decision.format,
    content: decision.promptPrefix,
    rationale: decision.rationale,
    matchedRule: decision.matchedRule,
  }
}

export interface OutputRendererProps {
  content: string
  format?: OutputFormat
  intent?: FormatIntent
}

/**
 * Renders a line of TUI output with format-aware styling.
 */
export function OutputRenderer({ content, format, intent }: OutputRendererProps): ReactElement {
  const effectiveFormat = format ?? (intent ? classifyOutput(intent).format : 'markdown')

  if (effectiveFormat === 'json') {
    return (
      <Box flexDirection="column">
        <Text color="grey" dimColor>
          [json]
        </Text>
        <Text>{tryPrettyJson(content)}</Text>
      </Box>
    )
  }

  if (effectiveFormat === 'html') {
    return (
      <Box flexDirection="column">
        <Text color="grey" dimColor>
          [html]
        </Text>
        <Text color="yellow">{content}</Text>
      </Box>
    )
  }

  return <Text>{content}</Text>
}

function tryPrettyJson(text: string): string {
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

/**
 * Extracts format badge text for the TUI log prefix.
 */
export function formatLabel(format: OutputFormat): string {
  switch (format) {
    case 'html':
      return '[html]'
    case 'json':
      return '[json]'
    case 'html+svg':
      return '[svg]'
    case 'hybrid-md-html':
      return '[hybrid]'
    default:
      return ''
  }
}

/**
 * Formats a command output line with its format label prefix.
 */
export function formatOutputLine(content: string, intent?: FormatIntent): string {
  const decision = intent ? classifyOutput(intent) : { format: 'markdown' as OutputFormat, rationale: '' }
  const label = formatLabel(decision.format)
  return label ? `${label} ${content}` : content
}
