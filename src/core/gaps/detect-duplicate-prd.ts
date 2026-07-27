/*!
 * Detects near-duplicate PRD/epic titles using Jaccard bigram similarity.
 *
 * WHY: Parallel planning sessions often produce slightly renamed epics covering
 * identical scope — duplicate_prd gaps surface these pairs so the conductor can
 * merge or close one. Never auto-deletes — report only (honesty principle).
 *
 * Composes with: gap-types.ts (Gap/GapKind), index.ts (GAP_DETECTORS registry).
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'

const SIMILARITY_THRESHOLD = 0.85

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/^prd:\s*/i, '')
    .replace(/\bv\d+\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigramSet(text: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2))
  return set
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const bg of a) if (b.has(bg)) intersection++
  return intersection / (a.size + b.size - intersection)
}

export function detectDuplicatePrd(doc: GraphDocument): Gap[] {
  const epics = doc.nodes.filter((n) => n.type === 'epic' && n.status !== 'done')
  const gaps: Gap[] = []
  const reported = new Set<string>()

  for (let i = 0; i < epics.length; i++) {
    for (let j = i + 1; j < epics.length; j++) {
      const a = epics[i]!
      const b = epics[j]!
      const pairKey = [a.id, b.id].sort().join(':')
      if (reported.has(pairKey)) continue

      const normA = normalize(a.title)
      const normB = normalize(b.title)
      const sim = jaccardSimilarity(bigramSet(normA), bigramSet(normB))
      if (sim < SIMILARITY_THRESHOLD) continue

      reported.add(pairKey)
      gaps.push({
        kind: 'duplicate_prd',
        severity: 'recommended',
        nodeId: a.id,
        evidence: `Epics "${a.title}" (${a.id}) and "${b.title}" (${b.id}) have title similarity ${(sim * 100).toFixed(0)}% — possible duplicate.`,
        enrichment: {
          action: 'annotate',
          instruction: `Review these two epics for overlap and close or merge one.`,
          applyVia: [`agf node status ${b.id} done  # close duplicate`, `agf node rm ${b.id}  # or remove if safe`],
        },
      })
    }
  }

  return gaps
}
