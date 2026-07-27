/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Persistence + query helpers for the hierarchical ToC tree (`doc_tree_nodes`).
 *
 * Standalone FTS5 (`doc_tree_nodes_fts`) is populated manually here. Re-import is
 * idempotent: a document's rows are purged before re-insert. db-level functions
 * (not a class) keep this cohesive with `doc-tree.ts` and reusable by retrieval.
 */

import type Database from 'better-sqlite3'
import type { DocTreeNode } from './doc-tree.js'

/** A row read back from `doc_tree_nodes`. */
export interface DocTreeRow {
  id: string
  documentId: string
  treePath: string
  level: number
  title: string
  summary: string
  content: string
  parentId: string | null
  startLine: number
  endLine: number
}

interface RawRow {
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
}

function toRow(r: RawRow): DocTreeRow {
  return {
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
  }
}

/** Replace the tree for `documentId` with `nodes` (idempotent re-import). */
export function insertTreeNodes(db: Database.Database, documentId: string, nodes: DocTreeNode[]): void {
  const now = new Date().toISOString()
  const delMain = db.prepare('DELETE FROM doc_tree_nodes WHERE document_id = ?')
  const delFts = db.prepare('DELETE FROM doc_tree_nodes_fts WHERE document_id = ?')
  const insMain = db.prepare(
    `INSERT INTO doc_tree_nodes
       (id, document_id, tree_path, level, title, summary, content, parent_id, start_line, end_line, created_at)
     VALUES (@id, @document_id, @tree_path, @level, @title, @summary, @content, @parent_id, @start_line, @end_line, @created_at)`,
  )
  const insFts = db.prepare(
    `INSERT INTO doc_tree_nodes_fts (node_id, document_id, title, summary, content)
     VALUES (@node_id, @document_id, @title, @summary, @content)`,
  )

  db.transaction(() => {
    delMain.run(documentId)
    delFts.run(documentId)
    for (const n of nodes) {
      insMain.run({
        id: n.id,
        document_id: n.documentId,
        tree_path: n.treePath,
        level: n.level,
        title: n.title,
        summary: n.summary,
        content: n.content,
        parent_id: n.parentId,
        start_line: n.startLine,
        end_line: n.endLine,
        created_at: now,
      })
      insFts.run({
        node_id: n.id,
        document_id: n.documentId,
        title: n.title,
        summary: n.summary,
        content: n.content,
      })
    }
  })()
}

/** Count tree nodes (optionally for a single document). */
export function countTreeNodes(db: Database.Database, documentId?: string): number {
  const row = documentId
    ? db.prepare('SELECT COUNT(*) AS c FROM doc_tree_nodes WHERE document_id = ?').get(documentId)
    : db.prepare('SELECT COUNT(*) AS c FROM doc_tree_nodes').get()
  return (row as { c: number }).c
}

/** Direct children of a node id (ordered by tree_path). */
export function getTreeChildren(db: Database.Database, parentId: string | null): DocTreeRow[] {
  const rows = (
    parentId === null
      ? db.prepare('SELECT * FROM doc_tree_nodes WHERE parent_id IS NULL ORDER BY tree_path').all()
      : db.prepare('SELECT * FROM doc_tree_nodes WHERE parent_id = ? ORDER BY tree_path').all(parentId)
  ) as RawRow[]
  return rows.map(toRow)
}

/** Fetch a node by id, or null. */
export function getTreeNode(db: Database.Database, id: string): DocTreeRow | null {
  const row = db.prepare('SELECT * FROM doc_tree_nodes WHERE id = ?').get(id) as RawRow | undefined
  return row ? toRow(row) : null
}
