/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Shared handler utilities for TUI skill execution.
 * Agnostic formatting helpers — no MCP dependency.
 */

import type { SkillStep } from '../../tui/skill-handler-port.js'
import type { GraphNode, NodeStatus } from '../../core/graph/graph-types.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'skills/shared/handler-utils' })

/** Format elapsed ms → human readable. */
export function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m${sec > 0 ? `${sec}s` : ''}`
}

/** Format a single graph node as a compact line. */
export function fmtNode(node: GraphNode): string {
  const icon = statusIcon(node.status)
  const size = node.xpSize ? ` [${node.xpSize}]` : ''
  const sprint = node.sprint ? ` @${node.sprint}` : ''
  return `${icon} ${node.title} (${node.id})${size}${sprint}`
}

/** Status icon mapping. */
export function statusIcon(status: NodeStatus): string {
  switch (status) {
    case 'done':
      return '✓'
    case 'in_progress':
      return '→'
    case 'blocked':
      return '⚠'
    case 'ready':
      return '●'
    case 'backlog':
      return '○'
    default:
      return '·'
  }
}

/** Format a progress step line. */
export function fmtProgress(step: SkillStep): string {
  return `[${step.step}/${step.total}] ${step.label} (${fmtElapsed(step.elapsedMs)})`
}

/** Build a summary line from key-value pairs. */
export function fmtSummary(pairs: Record<string, string | number>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ')
}

/** Pad right for aligned output. */
export function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length)
}
