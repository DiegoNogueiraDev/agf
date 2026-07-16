/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tree-navigation retrieval over the ToC index (PageIndex-style, adapted).
 *
 * A **standalone** retriever (its own corpus = `doc_tree_nodes`, distinct from
 * graph nodes — so it is intentionally NOT merged into the graph-node
 * multi-strategy RRF; default retrieval stays byte-identical). It runs a
 * ToC-weighted FTS over the tree (title ≫ summary ≫ content): matching a heading
 * surfaces its section, and because summaries are concise the input is
 * token-light. 100% local, no vectors, no LLM. Surfaced via `agf search
 * --hierarchical`.
 */

import type Database from 'better-sqlite3'
import { tokenize } from '../search/tokenizer.js'
import type { DocTreeRow } from './doc-tree-store.js'

/** A retrieved tree section with its relevance score (higher = better). */
export interface HierarchicalHit {
  row: DocTreeRow
  score: number
}

/** Build a safe FTS5 MATCH expression from a free-text query (OR of terms). */
function toMatchExpression(query: string): string | null {
  const terms = [...new Set(tokenize(query))].filter((t) => t.length > 0)
  if (terms.length === 0) return null
  // Quote each term to neutralise FTS5 operators; OR them for recall.
  return terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ')
}

interface RawJoined {
  id: string
  document_id: string
  tree_path: string
  level: number
  title: string
  summary: string
  content: string
  parent_id: string | null
  start_line: number
  end_line: number
  rank: number
}

/**
 * Navigate the ToC tree for `query`, returning the most relevant sections.
 * Column weights bias toward headings/summaries (the cheap structural signal).
 * Returns [] when the index is empty or the query has no usable terms.
 */
export function hierarchicalTreeSearch(db: Database.Database, query: string, limit = 10): HierarchicalHit[] {
  const match = toMatchExpression(query)
  if (match === null) return []

  let rows: RawJoined[]
  try {
    rows = db
      .prepare(
        `SELECT t.*, bm25(doc_tree_nodes_fts, 0.0, 0.0, 5.0, 2.0, 1.0) AS rank
           FROM doc_tree_nodes_fts f
           JOIN doc_tree_nodes t ON t.id = f.node_id
          WHERE doc_tree_nodes_fts MATCH ?
          ORDER BY rank
          LIMIT ?`,
      )
      .all(match, limit) as RawJoined[]
  } catch {
    // Missing table (un-migrated) or FTS parse edge case → no results.
    return []
  }

  return rows.map((r) => ({
    // bm25 is negative; flip so higher = better and clamp to a stable positive.
    score: -r.rank,
    row: {
      id: r.id,
      documentId: r.document_id,
      treePath: r.tree_path,
      level: r.level,
      title: r.title,
      summary: r.summary,
      content: r.content,
      parentId: r.parent_id,
      startLine: r.start_line,
      endLine: r.end_line,
    },
  }))
}
