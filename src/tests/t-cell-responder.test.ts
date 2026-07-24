/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_b9044ee66f3e — C75-T1: tests for selectResponses deduplication
 *
 * AC: deduplicates by antigenId; maxPerAntigen=1 default;
 *     empty input returns []; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { selectResponses } from '../core/immune/t-cell-responder.js'
import type { TCellResponse } from '../core/immune/immune-types.js'

function makeResponse(id: string, antigenId: string): TCellResponse {
  return {
    id,
    antigenId,
    actionKind: 'wrap_in_try_catch',
    targetFile: 'src/foo.ts',
    targetLine: 1,
    description: `Fix ${id}`,
    affinity: 0.8,
    applied: false,
    appliedAt: null,
  }
}

describe('selectResponses', () => {
  it('returns empty array for empty input', () => {
    expect(selectResponses([])).toEqual([])
  })

  it('returns single response unchanged', () => {
    const r = makeResponse('r1', 'ag1')
    const result = selectResponses([r])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')
  })

  it('deduplicates by antigenId — two responses for same antigen → one selected', () => {
    const r1 = makeResponse('r1', 'ag1')
    const r2 = makeResponse('r2', 'ag1')
    const result = selectResponses([r1, r2])
    const antigenIds = result.map((r) => r.antigenId)
    const uniqueIds = new Set(antigenIds)
    expect(uniqueIds.size).toBe(antigenIds.length)
  })

  it('keeps the first response for each antigenId', () => {
    const r1 = makeResponse('first', 'ag1')
    const r2 = makeResponse('second', 'ag1')
    const result = selectResponses([r1, r2])
    expect(result[0].id).toBe('first')
  })

  it('two different antigens → both selected', () => {
    const r1 = makeResponse('r1', 'ag1')
    const r2 = makeResponse('r2', 'ag2')
    const result = selectResponses([r1, r2])
    expect(result).toHaveLength(2)
  })

  it('returns an array (not mutates input)', () => {
    const input = [makeResponse('r1', 'ag1'), makeResponse('r2', 'ag1')]
    const original = [...input]
    selectResponses(input)
    expect(input).toEqual(original)
  })

  it('all returned responses have valid antigenId', () => {
    const responses = [makeResponse('r1', 'ag1'), makeResponse('r2', 'ag2'), makeResponse('r3', 'ag1')]
    const result = selectResponses(responses)
    for (const r of result) {
      expect(r.antigenId).toBeTruthy()
    }
  })
})
