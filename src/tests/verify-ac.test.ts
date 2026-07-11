/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_614bef05311f — agf verify-ac <id>: check if AC is already
 * satisfied by existing code. Repeatedly found ACs already satisfied by
 * existing code, discovered only by manual grep before implementing.
 * Priority: (1) --check hint if present, (2) testFiles if present (run via
 * the resolved test gate), (3) grep the codebase for key terms extracted
 * from a testable-in-principle AC, (4) 'unclear' when the AC itself is too
 * vague to derive any check from (scoreAcTestability's weak signal).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { verifyAc } from '../core/analyzer/verify-ac.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('verifyAc', () => {
  let dir: string
  let store: SqliteStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-verify-ac-'))
    store = SqliteStore.open(dir)
    store.initProject('verify-ac-test')
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function addNode(overrides: Partial<GraphNode> & { id: string }): void {
    const now = new Date().toISOString()
    store.insertNode({
      type: 'task',
      title: overrides.id,
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as GraphNode)
  }

  it("GIVEN AC 'returns 200 when payload is valid' and testFiles that pass THEN reported as 'satisfied'", () => {
    addNode({
      id: 'node_1',
      acceptanceCriteria: ['returns 200 when payload is valid'],
      testFiles: ['irrelevant.test.ts'],
    })

    const result = verifyAc(store, 'node_1', dir, 'true')
    expect(result.status).toBe('satisfied')
  })

  it("GIVEN AC 'returns 200 when payload is valid' and no testFiles and no matching code THEN reported as 'not_satisfied'", () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/unrelated.ts'), 'export function foo() {}\n')
    addNode({ id: 'node_2', acceptanceCriteria: ['returns 200 when payload is valid'] })

    const result = verifyAc(store, 'node_2', dir)
    expect(result.status).toBe('not_satisfied')
  })

  it("GIVEN a vague AC 'the system should be fast' (no testable hint) THEN reported as 'unclear'", () => {
    addNode({ id: 'node_3', acceptanceCriteria: ['the system should be fast'] })

    const result = verifyAc(store, 'node_3', dir)
    expect(result.status).toBe('unclear')
    expect(result.reason).toContain('no check hint and no testFiles')
  })

  it('GIVEN a --check hint THEN the hint command is executed and its exit code determines satisfied/not', () => {
    addNode({
      id: 'node_4',
      acceptanceCriteria: ['handlePayload processes the request'],
      metadata: { checkHint: 'true' },
    })
    expect(verifyAc(store, 'node_4', dir).status).toBe('satisfied')

    addNode({
      id: 'node_5',
      acceptanceCriteria: ['handlePayload processes the request'],
      metadata: { checkHint: 'false' },
    })
    expect(verifyAc(store, 'node_5', dir).status).toBe('not_satisfied')
  })

  it('GIVEN a testable AC and a real grep match in the codebase THEN reported as satisfied', () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/handler.ts'), 'export function handlePayload(req) { return 200 }\n')
    addNode({ id: 'node_6', acceptanceCriteria: ['handlePayload returns 200 for a valid payload'] })

    const result = verifyAc(store, 'node_6', dir)
    expect(result.status).toBe('satisfied')
  })
})
