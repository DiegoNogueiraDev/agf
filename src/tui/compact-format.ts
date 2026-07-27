/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_ab487ed80d82 — TOON-style compact output formatter.
 *
 * One line per item, ~73% fewer tokens than full output.
 * Inspired by icm -f toon.
 */

export interface CompactableNode {
  id: string
  title: string
  type: string
  status: string
  tags?: string[]
  parentTitle?: string
}

const STATUS_ICON: Record<string, string> = {
  done: '\u2713',
  in_progress: '\u25cf',
  backlog: '\u00b7',
  blocked: '\u25b2',
}

/** Formats a single node as a compact one-line summary with icon, type, title, tags, and status. */
export function compactNode(node: CompactableNode): string {
  const icon = STATUS_ICON[node.status] ?? '\u00b7'
  const tags = node.tags?.length ? ` [${node.tags.join(',')}]` : ''
  const parent = node.parentTitle ? ` \u2190 ${node.parentTitle}` : ''
  return `${icon} [${node.type}] ${node.title}${tags}${parent} (${node.status})`
}

/** Joins an array of nodes into a multi-line compact summary; returns empty string for empty input. */
export function compactItems(nodes: CompactableNode[]): string {
  if (nodes.length === 0) return ''
  return nodes.map(compactNode).join('\n')
}
