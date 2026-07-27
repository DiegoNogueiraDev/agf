/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-9.T04 — Zoom-out caller graph analyzer.
 * Pure: dado lista de import edges {from, to}, calcula fan-in/fan-out,
 * detecta central modules / leaves / islands, e renderiza um mermaid
 * digraph. Caller (analyze tool) coleta edges do CodeStore index.
 */

import { posix } from 'node:path'

export const CENTRAL_FAN_IN_THRESHOLD = 5

export interface ImportEdge {
  from: string
  to: string
}

export interface NodeMetric {
  file: string
  fanIn: number
  fanOut: number
}

export interface ZoomOutReport {
  nodes: NodeMetric[]
  central: string[]
  leaves: string[]
  islands: string[]
  mermaid: string
}

function shortLabel(file: string): string {
  const stripped = file.replace(/^src\//, '').replace(/\.ts$/, '')
  return stripped.replace(/[^a-zA-Z0-9_]/g, '_')
}

function escapeMermaid(file: string): string {
  return file.replace(/"/g, '\\"')
}

/**
 * Resolve a relative import specifier (as extracted from a file's source) to the
 * project-relative path of the file it points to, matched against `knownFiles`.
 * Returns null for package specifiers (non-relative) or unresolved paths.
 */
export function resolveModuleSpecifier(fromFile: string, specifier: string, knownFiles: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null

  const joined = posix.normalize(posix.join(posix.dirname(fromFile), specifier))
  const withoutExt = joined.replace(/\.(js|ts)$/, '')

  const candidates = [joined, `${withoutExt}.ts`, `${withoutExt}/index.ts`]
  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) return candidate
  }
  return null
}

/** buildMermaid —  */
export function buildMermaid(nodes: NodeMetric[], edges: ImportEdge[]): string {
  const ids = new Map<string, string>()
  for (const nVar of nodes) ids.set(nVar.file, shortLabel(nVar.file))
  const lines = ['graph TD']
  for (const nVar of nodes) {
    const id = ids.get(nVar.file)
    if (id === undefined) continue
    lines.push(`  ${id}["${escapeMermaid(nVar.file)}"]`)
  }
  for (const e of edges) {
    const from = ids.get(e.from)
    const to = ids.get(e.to)
    if (!from || !to) continue
    lines.push(`  ${from} --> ${to}`)
  }
  return lines.join('\n')
}

/** analyzeZoomOut —  */
export function analyzeZoomOut(
  files: string[],
  edges: ImportEdge[],
  centralThreshold: number = CENTRAL_FAN_IN_THRESHOLD,
): ZoomOutReport {
  const fanIn = new Map<string, number>()
  const fanOut = new Map<string, number>()
  for (const fVar of files) {
    fanIn.set(fVar, 0)
    fanOut.set(fVar, 0)
  }
  for (const e of edges) {
    if (!fanIn.has(e.to)) fanIn.set(e.to, 0)
    if (!fanOut.has(e.from)) fanOut.set(e.from, 0)
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1)
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1)
  }

  const nodes: NodeMetric[] = []
  for (const file of new Set([...files, ...fanIn.keys(), ...fanOut.keys()])) {
    nodes.push({
      file,
      fanIn: fanIn.get(file) ?? 0,
      fanOut: fanOut.get(file) ?? 0,
    })
  }

  const central = nodes.filter((n) => n.fanIn >= centralThreshold).map((n) => n.file)
  const leaves = nodes.filter((n) => n.fanOut === 0 && n.fanIn > 0).map((n) => n.file)
  const islands = nodes.filter((n) => n.fanIn === 0 && n.fanOut === 0).map((n) => n.file)
  const mermaid = buildMermaid(nodes, edges)

  return { nodes, central, leaves, islands, mermaid }
}
