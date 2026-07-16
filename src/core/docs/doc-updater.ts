/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Doc Updater — named marker system for auto-generated doc sections.
 * Supports multiple independent marker pairs in a single file.
 */

function markerStart(name: string): string {
  return `<!-- mcp-graph:${name}:start -->`
}

function markerEnd(name: string): string {
  return `<!-- mcp-graph:${name}:end -->`
}

/**
 * Replace content between named markers. If markers don't exist,
 * returns content unchanged (safe by default).
 */
export function applySectionWithName(existingContent: string, sectionName: string, newContent: string): string {
  const startMarker = markerStart(sectionName)
  const endMarker = markerEnd(sectionName)

  const startIdx = existingContent.indexOf(startMarker)
  const endIdx = existingContent.indexOf(endMarker)

  if (startIdx === -1 || endIdx === -1) {
    return existingContent
  }

  const before = existingContent.substring(0, startIdx + startMarker.length)
  const after = existingContent.substring(endIdx)

  return `${before}\n${newContent}\n${after}`
}
