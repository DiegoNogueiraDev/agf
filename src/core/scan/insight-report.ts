/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 * Insight report — renders a `ScanResult` as a ranked Markdown evaluation and
 * builds the graph backlog (one epic + one task per unique capability gap) so
 * `agf scan-repos --ingest` can seed the graph with what the neighbours have
 * that agf still lacks.
 */

import { generateId } from '../utils/id.js'
import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { specForTag, type Pillar, type Level } from './capability-lexicon.js'
import type { ScanResult, Insight } from './repo-scanner.js'

/** Numeric weight so we can sort high→low deterministically. */
const RANK: Record<Level, number> = { high: 3, med: 2, low: 1 }

/** One row of the ranked table — a unique gap with the repos that have it. */
export interface RankedGap {
  capability: string
  label: string
  insight: string
  pillar: Pillar
  effort: Level
  impact: Level
  repos: string[]
}

/** Collapse per-(repo,capability) insights into unique, ranked gaps. */
export function rankGaps(insights: Insight[]): RankedGap[] {
  const byCap = new Map<string, RankedGap>()
  for (const i of insights) {
    const existing = byCap.get(i.capability)
    if (existing) {
      if (!existing.repos.includes(i.repo)) existing.repos.push(i.repo)
      continue
    }
    byCap.set(i.capability, {
      capability: i.capability,
      label: i.label,
      insight: i.insight,
      pillar: i.pillar,
      effort: i.effort,
      impact: i.impact,
      repos: [i.repo],
    })
  }
  return [...byCap.values()].sort((a, b) => {
    // impact desc, then effort asc (cheaper first), then capability asc.
    if (RANK[b.impact] !== RANK[a.impact]) return RANK[b.impact] - RANK[a.impact]
    if (RANK[a.effort] !== RANK[b.effort]) return RANK[a.effort] - RANK[b.effort]
    return a.capability.localeCompare(b.capability)
  })
}

export interface RenderOptions {
  /** ISO date string for the report header (caller supplies — keeps it pure). */
  generatedAt?: string
}

/** Render the scan as a ranked Markdown evaluation document. */
export function renderReport(result: ScanResult, opts: RenderOptions = {}): string {
  const gaps = rankGaps(result.insights.filter((i) => !i.presentInAgf))
  const lines: string[] = []
  lines.push('# Sibling-repo insight scan — what agf still lacks')
  lines.push('')
  if (opts.generatedAt) lines.push(`> Generated ${opts.generatedAt} · root \`${result.root}\``)
  else lines.push(`> root \`${result.root}\``)
  lines.push('')
  lines.push(
    `Scanned **${result.summary.scannedCount}** dirs · **${result.summary.repoCount}** repos · ` +
      `**${result.summary.uniqueGapCount}** unique capability gaps ` +
      `(token-cost ${result.summary.byPillar['token-cost']}, swe ${result.summary.byPillar.swe}, speed ${result.summary.byPillar.speed}).`,
  )
  lines.push('')
  lines.push('## Ranked gaps (impact desc, then cheapest effort first)')
  lines.push('')
  lines.push('| Capability | Pillar | Effort | Impact | Seen in | Transferable idea |')
  lines.push('|---|---|---|---|---|---|')
  for (const g of gaps) {
    lines.push(`| ${g.label} | ${g.pillar} | ${g.effort} | ${g.impact} | ${g.repos.join(', ')} | ${g.insight} |`)
  }
  lines.push('')
  // Provenance section: capabilities already present in agf with their owning module
  const presentInsights = result.insights.filter((i) => i.presentInAgf && i.agfModule)
  if (presentInsights.length > 0) {
    lines.push('## Already present in agf (provenance)')
    lines.push('')
    lines.push('| Capability | agf module |')
    lines.push('|---|---|')
    for (const i of presentInsights) {
      lines.push(`| ${i.label} | \`${i.agfModule}\` |`)
    }
    lines.push('')
  }

  const hasDistinctiveTerms = result.repos.some((r) => r.distinctiveTerms !== undefined)
  lines.push('## Repo fingerprints')
  lines.push('')
  if (hasDistinctiveTerms) {
    lines.push('| Repo | Stack | Capabilities detected | Distinctive terms | Last commit |')
    lines.push('|---|---|---|---|---|')
    for (const r of result.repos) {
      lines.push(
        `| ${r.name} | ${r.stack.join(', ') || '—'} | ${r.capabilities.join(', ') || '—'} | ` +
          `${(r.distinctiveTerms ?? []).join(', ') || '—'} | ${r.lastCommit ?? '—'} |`,
      )
    }
  } else {
    lines.push('| Repo | Stack | Capabilities detected | Last commit |')
    lines.push('|---|---|---|---|')
    for (const r of result.repos) {
      lines.push(
        `| ${r.name} | ${r.stack.join(', ') || '—'} | ${r.capabilities.join(', ') || '—'} | ${r.lastCommit ?? '—'} |`,
      )
    }
  }
  lines.push('')
  lines.push(
    '> Deterministic scan (keyword + manifest). Capability tags map to curated, ' +
      'manually-vetted insight metadata — the signal is automated, the judgment is seeded.',
  )
  lines.push('')
  return lines.join('\n')
}

export interface InsightNodes {
  epic: GraphNode
  tasks: GraphNode[]
  edges: GraphEdge[]
}

export interface BuildNodesOptions {
  /** ISO timestamp for created/updated (caller supplies). */
  now?: string
  /** Title suffix, e.g. a date, for the epic. */
  label?: string
  /** Capability tags already represented in the graph — skipped to avoid duplicates. */
  skipCapabilities?: Set<string>
}

/**
 * Build a graph backlog from the ranked gaps: one epic plus one task per unique
 * gap, each with testable acceptance criteria and a `parent_of` edge. Pure —
 * returns objects; the caller inserts them into the store.
 */
export function buildInsightNodes(result: ScanResult, opts: BuildNodesOptions = {}): InsightNodes {
  const now = opts.now ?? new Date().toISOString()
  const skip = opts.skipCapabilities ?? new Set<string>()
  const gaps = rankGaps(result.insights).filter((g) => !skip.has(g.capability))
  const epic: GraphNode = {
    id: generateId('node'),
    type: 'epic',
    title: `Sibling-repo insights${opts.label ? ` (${opts.label})` : ''}`,
    description:
      `Backlog of capabilities found in neighbour repos under ${result.root} that agf lacks. ` +
      `${gaps.length} unique gaps from ${result.summary.repoCount} repos.`,
    status: 'backlog',
    priority: 3,
    xpSize: 'M',
    parentId: null,
    acceptanceCriteria: [],
    tags: ['insight', 'scan-repos'],
    createdAt: now,
    updatedAt: now,
    metadata: { source: 'scan-repos', root: result.root },
  }
  const tasks: GraphNode[] = []
  const edges: GraphEdge[] = []
  for (const g of gaps) {
    const spec = specForTag(g.capability)
    const task: GraphNode = {
      id: generateId('node'),
      type: 'task',
      title: `Adopt: ${g.label}`,
      description: `${g.insight} (seen in ${g.repos.join(', ')}; pillar ${g.pillar}, effort ${g.effort}, impact ${g.impact}).`,
      status: 'backlog',
      priority: g.impact === 'high' ? 2 : 3,
      xpSize: g.effort === 'high' ? 'L' : g.effort === 'med' ? 'M' : 'S',
      parentId: epic.id,
      acceptanceCriteria: [
        `${g.label} is designed and tracked as an agf capability`,
        `A test demonstrates the ${g.capability} behaviour end-to-end`,
        spec
          ? `Token/speed impact measured vs baseline (pillar: ${g.pillar})`
          : `Behaviour validated against the scanned repo (${g.repos[0]})`,
      ],
      tags: ['insight', g.pillar, g.capability],
      createdAt: now,
      updatedAt: now,
      metadata: { source: 'scan-repos', capability: g.capability },
    }
    tasks.push(task)
    edges.push({
      id: generateId('edge'),
      from: epic.id,
      to: task.id,
      relationType: 'parent_of',
      createdAt: now,
    })
  }
  return { epic, tasks, edges }
}
