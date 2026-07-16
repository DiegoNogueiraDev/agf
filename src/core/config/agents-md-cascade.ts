/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * agents-md-cascade — resolves a hierarchical AGENTS.md chain
 * (root → subdir, nearest-wins) and merges layers into a single string.
 *
 * WHY: Codex and OpenCode honour AGENTS.md at any directory level;
 * inner files should extend/override the root rather than replace it.
 * Pure — no I/O. Callers collect layer paths and contents; this module
 * merges them.
 *
 * Algorithm: layers are ordered root-first (shallowest → deepest).
 * Merge = concatenate with a separator so that nearest (deepest) content
 * appears last and wins when an agent processes top-to-bottom.
 */

export interface AgentsMdLayer {
  /** Absolute path of this AGENTS.md file (for diagnostics). */
  path: string
  /** Raw file content of this layer. */
  content: string
}

const LAYER_SEPARATOR = '\n\n<!-- agf: subdir override -->\n\n'

/**
 * Merge AGENTS.md layers from root to subdir (nearest-wins).
 * Layers must be ordered shallowest first; each deeper layer is appended
 * after a separator so deepest content appears last and takes precedence.
 *
 * Returns empty string when no layers provided.
 */
export function mergeAgentsMd(layers: AgentsMdLayer[]): string {
  if (layers.length === 0) return ''
  return layers.map((l) => l.content.trim()).join(LAYER_SEPARATOR)
}

/**
 * Collect AGENTS.md layers by walking from `rootDir` down to `currentDir`.
 * Returns layers ordered root-first (ready for mergeAgentsMd).
 * Pure path logic — actual file reading is the caller's responsibility.
 *
 * Example: root=/a, current=/a/b/c → checks /a, /a/b, /a/b/c for AGENTS.md.
 */
export function buildLayerPaths(rootDir: string, currentDir: string): string[] {
  const root = rootDir.replace(/\/$/, '')
  const current = currentDir.replace(/\/$/, '')
  if (!current.startsWith(root)) return [`${root}/AGENTS.md`]

  const relative = current.slice(root.length)
  const parts = relative.split('/').filter(Boolean)
  const paths: string[] = [`${root}/AGENTS.md`]
  let acc = root
  for (const part of parts) {
    acc = `${acc}/${part}`
    paths.push(`${acc}/AGENTS.md`)
  }
  return paths
}
