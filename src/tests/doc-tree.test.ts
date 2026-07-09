/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_a9591245a072 — buildDocTree folds a flat Section[] (heading levels) into
 * a nested ToC tree with treePath / parentId / deterministic TF-IDF summaries.
 */
import { describe, it, expect } from 'vitest'
import { buildDocTree } from '../core/rag/doc-tree.js'
import type { Section } from '../core/parser/segment.js'

const sec = (level: number, title: string, body: string): Section => ({
  level,
  title,
  body,
  startLine: 0,
  endLine: 0,
})

describe('buildDocTree (#node_a9591245a072)', () => {
  it('nests sections by heading level with dotted treePaths', () => {
    const tree = buildDocTree(
      [
        sec(1, 'Auth', 'authentication overview'),
        sec(2, 'Login', 'login flow with password and tokens'),
        sec(2, 'Logout', 'logout clears the session token'),
        sec(1, 'Billing', 'billing and invoices'),
      ],
      'doc1',
    )
    const byTitle = Object.fromEntries(tree.map((n) => [n.title, n]))
    expect(byTitle['Auth'].treePath).toBe('1')
    expect(byTitle['Auth'].parentId).toBeNull()
    expect(byTitle['Login'].treePath).toBe('1.1')
    expect(byTitle['Login'].parentId).toBe(byTitle['Auth'].id)
    expect(byTitle['Logout'].treePath).toBe('1.2')
    expect(byTitle['Billing'].treePath).toBe('2')
    expect(byTitle['Billing'].parentId).toBeNull()
  })

  it('attaches a non-empty deterministic summary to each node (no LLM)', () => {
    const a = buildDocTree([sec(1, 'Login', 'the login flow validates the password and issues a token')], 'd')
    const b = buildDocTree([sec(1, 'Login', 'the login flow validates the password and issues a token')], 'd')
    expect(a[0].summary.length).toBeGreaterThan(0)
    expect(a[0].summary).toBe(b[0].summary) // deterministic
  })

  it('gives each node a stable id derived from documentId + treePath', () => {
    const tree = buildDocTree([sec(1, 'A', 'x'), sec(2, 'B', 'y')], 'docX')
    expect(tree[0].id).toBe('docX:1')
    expect(tree[1].id).toBe('docX:1.1')
    expect(tree[1].documentId).toBe('docX')
  })

  it('handles skipped heading levels (h1 → h3) without crashing', () => {
    const tree = buildDocTree([sec(1, 'Top', 'a'), sec(3, 'Deep', 'b')], 'd')
    expect(tree[1].parentId).toBe(tree[0].id)
    expect(tree[1].treePath).toBe('1.1')
  })

  it('returns an empty array for no sections', () => {
    expect(buildDocTree([], 'd')).toEqual([])
  })
})
