/* eslint-disable security/detect-unsafe-regex */
/*!
 * Lint exemption: the regex patterns in this file are bounded
 * (literal alternations, short character classes, language-keyword
 * lookups) and run against parsed/structured input. The ReDoS class
 * the rule is designed to prevent is not reachable here.
 */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-9.T03 — Deep-module analyzer.
 * Per Ousterhout: a "deep" module hides much behavior behind a small public
 * interface. We approximate this by counting exported lines vs total
 * implementation lines — high implementation/export ratio = deep.
 *
 * Pure functions; caller (analyze tool) walks dir + reads files.
 */

export const DEEP_RATIO_MAX = 0.2
export const SHALLOW_RATIO_MIN = 0.5

export type ModuleDepth = 'deep' | 'medium' | 'shallow'

export interface FileMetrics {
  file: string
  totalLoc: number
  exportLoc: number
  ratio: number
  depth: ModuleDepth
  suggestion: string
}

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|\*\/)/
const BLANK_LINE = /^\s*$/

/** Count non-blank, non-comment lines. */
export function countNonTrivialLines(content: string): number {
  let count = 0
  for (const line of content.split('\n')) {
    if (BLANK_LINE.test(line)) continue
    if (COMMENT_LINE.test(line)) continue
    count++
  }
  return count
}

/**
 * Count lines that participate in the public-API surface: exported declarations
 * (export function/class/interface/type/const/let/var) and re-exports.
 */
export function countExportLines(content: string): number {
  let count = 0
  for (const line of content.split('\n')) {
    if (BLANK_LINE.test(line)) continue
    if (/^\s*export\s+(default\s+)?(async\s+)?(function|class|interface|type|const|let|var|enum)\b/.test(line)) {
      count++
    } else if (/^\s*export\s*\{/.test(line) || /^\s*export\s+\*\s+from/.test(line)) {
      count++
    }
  }
  return count
}

/** classifyDepth —  */
export function classifyDepth(ratio: number): ModuleDepth {
  if (ratio < DEEP_RATIO_MAX) return 'deep'
  if (ratio > SHALLOW_RATIO_MIN) return 'shallow'
  return 'medium'
}

function suggestionFor(depth: ModuleDepth, exportLoc: number, totalLoc: number): string {
  if (totalLoc < 10) return 'module too small to evaluate (LOC < 10)'
  if (depth === 'deep') return 'good: small interface hides substantial behavior'
  if (depth === 'shallow')
    return `consider deepening: ${exportLoc} exported LOC over ${totalLoc} total — interface is wide relative to logic`
  return 'balanced surface; track for trend'
}

/** analyzeDeepModule —  */
export function analyzeDeepModule(file: string, content: string): FileMetrics {
  const totalLoc = countNonTrivialLines(content)
  const exportLoc = countExportLines(content)
  const ratio = totalLoc === 0 ? 1 : exportLoc / totalLoc
  const depth = classifyDepth(ratio)
  return {
    file,
    totalLoc,
    exportLoc,
    ratio,
    depth,
    suggestion: suggestionFor(depth, exportLoc, totalLoc),
  }
}

export interface DepthReport {
  files: FileMetrics[]
  byDepth: Record<ModuleDepth, number>
  shallowCandidates: string[]
}

/** summarizeDepth —  */
export function summarizeDepth(reports: FileMetrics[]): DepthReport {
  const byDepth: Record<ModuleDepth, number> = { deep: 0, medium: 0, shallow: 0 }
  const shallowCandidates: string[] = []
  for (const rVar of reports) {
    byDepth[rVar.depth]++
    if (rVar.depth === 'shallow' && rVar.totalLoc >= 10) shallowCandidates.push(rVar.file)
  }
  return { files: reports, byDepth, shallowCandidates }
}
