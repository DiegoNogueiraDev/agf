/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph docs generator — living, agent-oriented documentation derived from the
 * graph (motivated by OpenWiki: docs "written and maintained for agents").
 *
 * Deterministic and LLM-free: the same graph always yields byte-identical
 * markdown, so it costs zero tokens and works in delegate mode with no provider.
 * The doc-sync-guard hook flags when this artifact drifts from graph activity,
 * which is the signal to regenerate.
 *
 * Pure — no I/O, no graph mutation.
 */

/** Minimal node shape the generator reads (a GraphNode satisfies it). */
export interface DocNode {
  id: string
  type: string
  title: string
  status: string
  parentId?: string | null
  ac?: string[]
}

/** Minimal graph shape (a GraphDocument satisfies it). */
export interface DocGraph {
  project: { name: string }
  nodes: DocNode[]
}

const STATUS_MARK: Record<string, string> = {
  done: '✓',
  in_progress: '◐',
  blocked: '⊘',
  backlog: '○',
  ready: '◔',
}

function mark(status: string): string {
  return STATUS_MARK[status] ?? '·'
}

/** Stable, human-readable ordering: by title, then id (deterministic). */
function byTitle(a: DocNode, b: DocNode): number {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

function renderTaskLine(node: DocNode): string {
  const acCount = node.ac?.length ?? 0
  const acNote = acCount > 0 ? ` — ${acCount} AC` : ''
  return `- ${mark(node.status)} **${node.title}** (${node.status})${acNote}`
}

function renderOverview(nodes: DocNode[]): string {
  const byStatus = new Map<string, number>()
  for (const n of nodes) byStatus.set(n.status, (byStatus.get(n.status) ?? 0) + 1)
  const counts = [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const lines = counts.map(([status, count]) => `- ${mark(status)} ${status}: ${count}`)
  return [`**${nodes.length}** nodes total.`, '', ...lines].join('\n')
}

/**
 * Render the graph as an agent-oriented markdown overview: project heading,
 * status overview, epics with nested tasks, orphan tasks, and requirements.
 */
export function generateGraphDocs(graph: DocGraph): string {
  const nodes = graph.nodes
  const out: string[] = [`# ${graph.project.name} — graph overview`, '']

  out.push('## Overview', '', renderOverview(nodes), '')

  const epics = nodes.filter((n) => n.type === 'epic').sort(byTitle)
  const tasks = nodes.filter((n) => n.type === 'task' || n.type === 'subtask')

  if (epics.length > 0) {
    out.push('## Epics', '')
    for (const epic of epics) {
      out.push(`### ${mark(epic.status)} ${epic.title} (${epic.status})`, '')
      const children = tasks.filter((t) => t.parentId === epic.id).sort(byTitle)
      if (children.length === 0) {
        out.push('_(no tasks yet)_', '')
      } else {
        out.push(...children.map(renderTaskLine), '')
      }
    }
  }

  const orphans = tasks.filter((t) => !t.parentId || !epics.some((e) => e.id === t.parentId)).sort(byTitle)
  if (orphans.length > 0) {
    out.push('## Tasks without an epic', '', ...orphans.map(renderTaskLine), '')
  }

  const requirements = nodes.filter((n) => n.type === 'requirement').sort(byTitle)
  if (requirements.length > 0) {
    out.push('## Requirements', '', ...requirements.map((r) => `- ${mark(r.status)} ${r.title}`), '')
  }

  return out.join('\n').replace(/\n+$/, '\n')
}
